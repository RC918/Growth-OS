import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateTrialClaimField, evaluateTrialGeneration} from './trial-claim-gate.mjs';
import {evaluateGeneration} from './quality-eval.mjs';

const makeReport = source => ({facts: {
  product_name: {value: 'Orion', citations: ['name'], verification: 'source_asserted'},
  title: {value: 'Orion', citations: ['title'], verification: 'verified'},
  meta_description: {value: null, citations: [], verification: 'UNKNOWN'},
  description: {value: source, citations: ['description:1', 'description:2'], verification: 'source_asserted'},
}});
const makeSuggestions = text => ({
  title: {text: 'Orion', used_fact_ids: ['title']},
  meta_description: {text, used_fact_ids: ['description']},
  description: {text, used_fact_ids: ['description']},
  geo_qa: [{question: 'What is it?', answer: text, used_fact_ids: ['description']}],
});
const evidenceFor = report => [{fact_id: 'description', quote_excerpt: report.facts.description.value,
  citation_ids: report.facts.description.citations}];

for (const [source, text, status, decision] of [
  ['Orion is in stock.', 'Orion is in stock.', 'REVIEW', 'PASS_WITH_REVIEW'],
  ['Orion is out of stock.', 'Orion is out of stock.', 'REVIEW', 'PASS_WITH_REVIEW'],
  ['Orion is in stock.', 'Orion is out of stock.', 'CONTRADICTED', 'FAIL_CLOSED'],
  ['Orion is out of stock.', 'Orion is in stock.', 'CONTRADICTED', 'FAIL_CLOSED'],
  ['Orion is out of stock.', 'Orion is not out of stock.', 'CONTRADICTED', 'FAIL_CLOSED'],
  ['Orion is in stock. Orion is out of stock.', 'Orion is in stock.', 'SOURCE_CONFLICT', 'FAIL_CLOSED'],
]) test('composition stock ' + source + ' -> ' + text, () => {
  const report = makeReport(source);
  const result = evaluateTrialGeneration({report, suggestions: makeSuggestions(text)});
  assert.equal(result.claim_gate.decision, decision);
  const field = result.claim_gate.fields.find(f => f.field === 'description');
  const claim = field.claims.find(c => c.type === 'commercial');
  assert.equal(claim.status, status);
  assert.equal(claim.fact_id, 'description');
  assert.deepEqual(claim.citation_ids, report.facts.description.citations);
  assert.equal(claim.evidence, source);
  if (status === 'REVIEW') {
    assert.equal(result.status, 'PASS_WITH_UNKNOWNS');
    assert.equal(result.claim_gate.review_status, 'REVIEW');
    assert.equal(field.review_required, true);
    assert.ok(!field.claims.some(c => c.type === 'commercial' && c.status === 'SUPPORTED'));
  } else assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.human_rubric_required, true);
});

test('normal support preserves full evidence, UNKNOWN and original inputs', () => {
  const report = makeReport('Orion is stable.');
  const suggestions = makeSuggestions('Orion is stable.');
  const before = JSON.stringify({report, suggestions});
  const result = evaluateTrialGeneration({report, suggestions});
  assert.equal(result.status, 'PASS_WITH_UNKNOWNS');
  assert.deepEqual(result.unknown_facts, ['meta_description']);
  assert.equal(result.claim_gate.decision, 'PASS_WITH_REVIEW');
  assert.equal(result.claim_gate.review_status, 'REVIEW');
  assert.equal(result.claim_gate.fields[0].claims.find(c => c.via === 'general_rewrite_needs_human_read').status, 'REVIEW');
  assert.equal(result.claim_gate.fields[2].claims.find(c => c.type === 'performance').status, 'SUPPORTED');
  assert.equal(JSON.stringify({report, suggestions}), before);
  assert.equal(result.human_rubric_required, true);
});

test('missing source evidence is UNSUPPORTED, never counterevidence', () => {
  const result = evaluateTrialGeneration({report: makeReport('Orion is maple.'),
    suggestions: makeSuggestions('Orion is stable.')});
  const claims = result.claim_gate.fields[2].claims;
  assert.ok(claims.some(c => c.status === 'UNSUPPORTED'));
  assert.ok(!claims.some(c => c.status === 'CONTRADICTED'));
  assert.equal(result.status, 'FAIL_CLOSED');
});

for (const [name, change] of [
  ['citation id used as fact id', s => {s.description.used_fact_ids = ['description:1'];}],
  ['UNKNOWN declared field', s => {s.description.used_fact_ids = ['meta_description'];}],
  ['missing usage', s => {s.description.used_fact_ids = [];}],
  ['undeclared source cannot support the claim', s => {s.description.used_fact_ids = ['title'];}],
]) test(name, () => {
  const report = makeReport('Orion is stable.');
  const suggestions = makeSuggestions('Orion is stable.');
  change(suggestions);
  const result = evaluateTrialGeneration({report, suggestions});
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.ok(result.problems.some(p => p.startsWith('description:')));
});

for (const [name, change] of [
  ['wrong fact', e => {e[0].fact_id = 'title';}],
  ['wrong citation', e => {e[0].citation_ids = ['title'];}],
  ['partial excerpt', e => {e[0].quote_excerpt = 'Orion is stable.';}],
]) test('composition evidence boundary rejects ' + name, () => {
  const report = makeReport('Orion is stable. Orion is not stable.');
  const evidence = structuredClone(evidenceFor(report));
  change(evidence);
  const result = evaluateTrialClaimField({report, field: 'geo_qa[3]', text: 'Orion is stable.', evidence});
  assert.equal(result.decision, 'FAIL_CLOSED');
  assert.equal(result.mapping_status, 'BLOCKED_INPUT_MAPPING_AMBIGUITY');
  assert.ok(result.problems.every(p => p.startsWith('geo_qa[3]:')));
  assert.deepEqual(result.evidence, evidence);
});

test('complete mixed-polarity source stays SOURCE_CONFLICT', () => {
  const report = makeReport('Orion is stable. Orion is not stable.');
  const result = evaluateTrialGeneration({report, suggestions: makeSuggestions('Orion is stable.')});
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.claim_gate.fields[2].claims.find(c => c.type === 'performance').status, 'SOURCE_CONFLICT');
});

test('legacy refusal retains veto even when all claim checks pass', () => {
  const report = makeReport('Orion is stable.');
  const suggestions = makeSuggestions('Orion is stable.');
  suggestions.geo_qa[0].question = '';
  assert.equal(evaluateGeneration({report, suggestions}).status, 'FAIL_CLOSED');
  const result = evaluateTrialGeneration({report, suggestions});
  assert.ok(result.claim_gate.fields.every(f => f.decision !== 'FAIL_CLOSED'));
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.claim_gate.decision, 'FAIL_CLOSED');
  assert.ok(result.problems.includes('geo_qa[0]: missing question'));
});

test('report-wide conflict blocks even when declared facts are unrelated', () => {
  const report = makeReport('Orion is stable.');
  report.conflicts = [{fact: 'meta_description', values: ['x', 'y'], resolution: 'UNRESOLVED'}];
  const result = evaluateTrialGeneration({report, suggestions: makeSuggestions('Orion is stable.')});
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.ok(result.claim_gate.fields.every(f => f.mapping_status === 'BLOCKED_SOURCE_CONFLICT'));
  assert.equal(result.claim_gate.fields[2].evidence[0].quote_excerpt, report.facts.description.value);
});

test('stock without source stock evidence is UNSUPPORTED, not CONTRADICTED', () => {
  const result = evaluateTrialGeneration({report: makeReport('Orion is maple.'),
    suggestions: makeSuggestions('Orion is in stock.')});
  const claim = result.claim_gate.fields[2].claims.find(c => c.type === 'commercial');
  assert.equal(claim.status, 'UNSUPPORTED');
  assert.equal(claim.evidence, null);
  assert.equal(result.status, 'FAIL_CLOSED');
});
