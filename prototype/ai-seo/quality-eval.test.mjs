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
  const appended = structuredClone(landy);
  appended.report.facts.title = {value: 'The Clark • Landyachtz EXTRA INVENTED',
    citations: ['s3'], verification: 'source_asserted'};
  assert.ok(validateFixtureBindings(appended).some(p => p.includes('title')));
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
  // Avoiding the conflicting fact entirely is the only passing path:
  // the conflict stays listed as unresolved and UNKNOWNs stay UNKNOWN.
  const conservative = {
    title: {text: 'Conflicting Board', used_fact_ids: ['product_name']},
    meta_description: {text: 'Conflicting Board', used_fact_ids: ['product_name']},
    description: {text: 'Conflicting Board', used_fact_ids: ['product_name']},
    geo_qa: [{question: 'What is it?', answer: 'Conflicting Board', used_fact_ids: ['product_name']}],
  };
  const result = evaluateGeneration({report, suggestions: conservative});
  assert.equal(result.status, 'PASS_WITH_UNKNOWNS');
  assert.deepEqual(result.unresolved_conflicts, ['description']);
  assert.ok(result.unknown_facts.includes('meta_description'));

  // Presenting either side of the UNRESOLVED conflict as settled
  // fact fails closed, with an explicit conflict reason.
  const settled = structuredClone(conservative);
  settled.description = {text: 'Conflicting Board. Maple complete.', used_fact_ids: ['description']};
  const settledResult = evaluateGeneration({report, suggestions: settled});
  assert.equal(settledResult.status, 'FAIL_CLOSED');
  assert.ok(settledResult.problems.some(p => p.includes('UNRESOLVED')));

  const invented = structuredClone(conservative);
  invented.description = {text: 'Conflicting Board. Carbon complete with lifetime warranty.',
    used_fact_ids: ['description']};
  assert.equal(evaluateGeneration({report, suggestions: invented}).status, 'FAIL_CLOSED');
});

test('hyphenation and function words are not new facts, unsupported claims still fail', () => {
  const report = byId['landyachtz-the-clark'].report;
  const faithful = {
    title: {text: 'The Clark Twin-Kick Longboard', used_fact_ids: ['product_name', 'description']},
    meta_description: {text: 'The Clark is a twin-kick longboard with a double-kick shape, designed for skateparks and street skating.',
      used_fact_ids: ['description']},
    description: {text: 'The Clark is a 40.2 inch long skateboard built to skate everything, from downhill runs to tricks.',
      used_fact_ids: ['description']},
    geo_qa: [{question: 'What is The Clark?', answer: 'The Clark is a twin-kick longboard designed to skate everything.',
      used_fact_ids: ['description']}],
  };
  const ok = evaluateGeneration({report, suggestions: faithful});
  assert.equal(ok.status, 'PASS_WITH_UNKNOWNS', ok.problems.join('; '));

  const unsupported = structuredClone(faithful);
  unsupported.description = {text: 'The Clark is a lightweight carbon longboard with a top speed of 30 mph and a lifetime warranty.',
    used_fact_ids: ['description']};
  const bad = evaluateGeneration({report, suggestions: unsupported});
  assert.equal(bad.status, 'FAIL_CLOSED');
  assert.ok(bad.problems.some(p => p.includes('carbon')));
  assert.ok(bad.problems.some(p => p.includes('30')));

  // Non-adjacent parts do not establish a hyphenated compound, and
  // a short-unit swap on a sourced number still fails.
  const swapped = structuredClone(faithful);
  swapped.description = {text: 'The Clark is a 40.2 cm long skateboard.', used_fact_ids: ['description']};
  assert.equal(evaluateGeneration({report, suggestions: swapped}).status, 'FAIL_CLOSED');
});

test('conflict values fail regardless of punctuation or cited fact id', () => {
  const report = byId['conflicting-facts-negative'].report;
  const settled = {
    title: {text: 'Conflicting Board', used_fact_ids: ['product_name']},
    meta_description: {text: 'Conflicting Board', used_fact_ids: ['product_name']},
    description: {text: 'Conflicting Board. Maple complete', used_fact_ids: ['product_name']},
    geo_qa: [{question: 'What is it?', answer: 'Conflicting Board', used_fact_ids: ['product_name']}],
  };
  const result = evaluateGeneration({report, suggestions: settled});
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.ok(result.problems.some(p => p.includes('UNRESOLVED conflicting value')));

  const reworded = structuredClone(settled);
  reworded.description = {text: 'Conflicting Board. Maple is complete.', used_fact_ids: ['product_name']};
  assert.equal(evaluateGeneration({report, suggestions: reworded}).status, 'FAIL_CLOSED');

  // Any function word may sit between the conflicting tokens, and a
  // non-conflicting fact supplying the same words must not launder it.
  const launderedReport = structuredClone(report);
  launderedReport.facts.title = {value: 'Maple complete board guide', citations: ['s1'], verification: 'source_asserted'};
  for (const gap of ['very', 'now', 'just', 'also']) {
    const gapped = structuredClone(settled);
    gapped.description = {text: 'Conflicting Board. Maple ' + gap + ' complete.', used_fact_ids: ['product_name']};
    assert.equal(evaluateGeneration({report: launderedReport, suggestions: gapped}).status,
      'FAIL_CLOSED', 'gap: ' + gap);
  }
});

test('unlisted short units and size codes fail closed by default', () => {
  const report = byId['landyachtz-the-clark'].report;
  for (const text of ['The Clark is a 40.2 yd long skateboard.',
    'The Clark is a 40.2 m long skateboard.',
    'The Clark XL Longboard', 'The Clark US', 'The Clark IT']) {
    const suggestions = {
      title: {text: 'The Clark', used_fact_ids: ['product_name']},
      meta_description: {text: 'The Clark', used_fact_ids: ['product_name']},
      description: {text, used_fact_ids: ['description']},
      geo_qa: [{question: 'What is it?', answer: 'The Clark', used_fact_ids: ['product_name']}],
    };
    assert.equal(evaluateGeneration({report, suggestions}).status, 'FAIL_CLOSED', text);
  }
});
