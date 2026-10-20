import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateGeneration, validateFixtureBindings} from './quality-eval.mjs';

const cases = JSON.parse(await readFile(new URL('./fixtures/phase3b-cases.json', import.meta.url)));
const byId = Object.fromEntries(cases.cases.map(c => [c.id, c]));

const goodFor = (report) => ({
  title: {text: report.facts.title.value, used_fact_ids: ['title']},
  meta_description: {text: report.facts.meta_description.value ?? report.facts.description.value,
    used_fact_ids: [report.facts.meta_description.value ? 'meta_description' : 'description']},
  description: {text: report.facts.description.value, used_fact_ids: ['description']},
  geo_qa: [{question: 'What is it?', answer: report.facts.description.value, used_fact_ids: ['description']}],
});

test('three reproducible cases cover positive, WooCommerce and negative', () => {
  assert.equal(cases.cases.length, 3);
  assert.equal(byId['landyachtz-the-clark'].expected, 'GENERATE_WITH_CITATIONS');
  assert.equal(byId['woocommerce-bic00001'].kind, 'woocommerce_product');
  assert.equal(byId['conflicting-facts-negative'].expected, 'FAIL_CLOSED_OR_PRESERVE_UNKNOWN');
});

test('fixture facts are bound to recorded snapshot citations', () => {
  for (const testCase of cases.cases) {
    assert.deepEqual(validateFixtureBindings(testCase), [], testCase.id);
  }
  const landy = byId['landyachtz-the-clark'];
  assert.equal(landy.snapshot.version, 'c98f512dfd62bfb519afd0cdc41c4ff48561a41c7fbc7f4a5f5c969bf258ab57');
  assert.equal(landy.report.facts.meta_description.value, null);
  assert.ok(landy.report.facts.description.value.startsWith('It’s a 40.2'));
  const forged = structuredClone(landy);
  forged.report.facts.description = {value: 'The Clark. Maple complete with 54mm wheels.',
    citations: ['s4'], verification: 'source_asserted'};
  assert.ok(validateFixtureBindings(forged).some(p => p.includes('description')));
  assert.equal(byId['conflicting-facts-negative'].synthetic, true);
});

test('source-faithful generations pass gates in both languages', () => {
  for (const id of ['landyachtz-the-clark', 'woocommerce-bic00001']) {
    const result = evaluateGeneration({report: byId[id].report, suggestions: goodFor(byId[id].report)});
    // Both recorded sources lack a meta description tag, so the
    // honest outcome is PASS_WITH_UNKNOWNS, never an invented PASS.
    assert.equal(result.status, 'PASS_WITH_UNKNOWNS', id + ': ' + result.problems.join('; '));
    assert.ok(result.unknown_facts.includes('meta_description'));
    assert.equal(result.human_rubric_required, true);
  }
});

test('invented facts and invented GEO answers fail closed', () => {
  const report = byId['landyachtz-the-clark'].report;
  const bad = goodFor(report);
  bad.title = {text: 'The Clark only 999 dollars', used_fact_ids: ['product_name']};
  bad.geo_qa = [{question: 'Price?', answer: 'Only 999 dollars', used_fact_ids: ['description']}];
  const result = evaluateGeneration({report, suggestions: bad});
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.ok(result.problems.some(p => p.includes('999')));
});

test('negative case preserves UNKNOWN and never settles conflicts', () => {
  const report = byId['conflicting-facts-negative'].report;
  const conservative = {
    title: {text: 'Conflicting Board', used_fact_ids: ['product_name']},
    meta_description: {text: 'Conflicting Board. Maple complete.', used_fact_ids: ['description']},
    description: {text: 'Conflicting Board. Maple complete.', used_fact_ids: ['description']},
    geo_qa: [{question: 'What is it?', answer: 'Conflicting Board. Maple complete.', used_fact_ids: ['description']}],
  };
  const result = evaluateGeneration({report, suggestions: conservative});
  assert.equal(result.status, 'PASS_WITH_UNKNOWNS');
  assert.deepEqual(result.unresolved_conflicts, ['description']);
  assert.ok(result.unknown_facts.includes('meta_description'));

  const invented = structuredClone(conservative);
  invented.description = {text: 'Conflicting Board. Carbon complete with lifetime warranty.',
    used_fact_ids: ['description']};
  assert.equal(evaluateGeneration({report, suggestions: invented}).status, 'FAIL_CLOSED');
});
