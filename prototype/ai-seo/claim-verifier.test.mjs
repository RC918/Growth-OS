import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extractClaims, runClaimBenchmark, verifyClaims} from './claim-verifier.mjs';
import {verifySuggestions} from './ai-seo-pipeline.mjs';

const cases = JSON.parse(await readFile(new URL('./fixtures/phase3b-cases.json', import.meta.url)));
const benchmark = JSON.parse(await readFile(new URL('./fixtures/claim-benchmark.json', import.meta.url)));
const casesById = Object.fromEntries(cases.cases.map(c => [c.id, c]));

test('benchmark is honestly labelled as engineering-labelled, not human annotation', () => {
  assert.equal(benchmark.annotation_spec.human_annotation, false);
  assert.equal(benchmark.annotation_spec.status, 'engineering-labelled');
  assert.ok(benchmark.entries.length >= 12);
  const categories = new Set(benchmark.entries.flatMap(e => e.categories));
  for (const required of ['en', 'zh-TW', 'negation', 'conflict', 'unknown',
    'unit_conversion', 'performance', 'model_code', 'comparison']) {
    assert.ok(categories.has(required), 'missing category ' + required);
  }
});

test('claim extraction separates numeric, code, material and rewrite claims', () => {
  const claims = extractClaims('The Clark is a 40.2 inch twin-kick board, model BIC00001 in maple.');
  assert.ok(claims.some(c => c.type === 'numeric' && c.value === 40.2 && c.unit === 'inch'));
  assert.ok(claims.some(c => c.type === 'model_code' && c.span === 'BIC00001'));
  assert.ok(claims.some(c => c.type === 'material' && c.span === 'maple'));
  assert.ok(claims.some(c => c.type === 'specification' && c.compound === 'twin-kick'));
  assert.ok(!claims.some(c => c.type === 'numeric' && c.value === 1));
});

test('every supported claim traces to a fact, its citations and evidence', () => {
  const result = runClaimBenchmark({benchmark, casesById});
  for (const row of result.rows) {
    for (const claim of row.claims.filter(c => c.status === 'SUPPORTED')) {
      assert.ok(claim.fact_id, row.id + ' supported without fact');
      assert.ok((claim.citation_ids ?? []).length > 0, row.id + ' supported without citations');
      assert.ok(claim.evidence, row.id + ' supported without evidence');
    }
  }
  assert.equal(result.metrics.citation_coverage, 1);
});

test('benchmark matrix: prototype closes known baseline errors without new ones', () => {
  const result = runClaimBenchmark({benchmark, casesById});
  const byId = Object.fromEntries(result.rows.map(r => [r.id, r]));
  // Baseline false negative: a correct unit conversion fails the
  // flat token verifier; the claim prototype supports it by evidence.
  assert.equal(byId['cb-unit-conversion-supported'].baseline, 'FAIL_CLOSED');
  assert.equal(byId['cb-unit-conversion-supported'].prototype, 'PASS');
  // Baseline false positive: a negated material claim passes flat
  // token matching; the claim prototype contradicts it.
  assert.equal(byId['cb-negation-contradicted'].prototype, 'FAIL_CLOSED');
  assert.equal(result.metrics.prototype.false_positive, 0);
  assert.equal(result.metrics.prototype.false_negative, 0);
  assert.equal(result.metrics.exact_decision.prototype, result.metrics.entries);
  assert.ok(result.metrics.baseline.false_positive
    + result.metrics.baseline.false_negative > 0);
  assert.ok(result.metrics.review_rate > 0);
});

test('prototype never auto-passes unsupported, contradicted or UNKNOWN claims', () => {
  const report = casesById['landyachtz-the-clark'].report;
  const bad = verifyClaims({suggestions: {
    description: {text: 'The Clark is a lightweight carbon board at 30 mph.',
      used_fact_ids: ['description']}}, facts: report});
  assert.equal(bad.decision, 'FAIL_CLOSED');
  assert.ok(bad.claims.some(c => c.status === 'UNSUPPORTED'));

  const unknown = verifyClaims({suggestions: {
    description: {text: 'The Clark longboard.', used_fact_ids: ['meta_description']}},
    facts: report});
  assert.equal(unknown.decision, 'FAIL_CLOSED');
});

test('reviewer counterexamples can never auto-pass', () => {
  const report = casesById['landyachtz-the-clark'].report;
  const decisionFor = (text, facts = report, ids = ['description']) =>
    verifyClaims({suggestions: {description: {text, used_fact_ids: ids}}, facts}).decision;
  assert.equal(decisionFor('The Clark is not a 40.2 inch skateboard.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark is a 40.6 inch skateboard.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark is a 102.9 cm skateboard.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark levitates and teleports riders uphill effortlessly.'), 'PASS_WITH_REVIEW');
  assert.equal(decisionFor('The Clark is designed for inspiring limits.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark is not designed for skateparks.'), 'FAIL_CLOSED');
  const untrusted = structuredClone(report);
  untrusted.facts.description = {value: 'The Clark is a titanium board.',
    citations: ['s4'], verification: 'UNKNOWN'};
  assert.equal(decisionFor('The Clark is a titanium board.', untrusted), 'FAIL_CLOSED');
});

test('an affirmative sentence cannot mask a later negated duplicate', () => {
  const report = casesById['landyachtz-the-clark'].report;
  const decisionFor = (text) =>
    verifyClaims({suggestions: {description: {text, used_fact_ids: ['description']}}, facts: report}).decision;
  assert.equal(decisionFor('The Clark is designed for skateparks. The Clark is not designed for skateparks.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark is a twin-kick board. The Clark is not a twin-kick board.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark has a stable platform. The Clark is not stable.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark is a 40.2 inch skateboard. The Clark is not a 40.2 inch skateboard.'), 'FAIL_CLOSED');
});

test('spaced compounds and morphological negation cannot smuggle contradictions', () => {
  const report = casesById['landyachtz-the-clark'].report;
  const decisionFor = (text) =>
    verifyClaims({suggestions: {description: {text, used_fact_ids: ['description']}}, facts: report}).decision;
  assert.equal(decisionFor('The Clark is a twin-kick board. The Clark is not a twin kick board.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark has a stable platform. The Clark is unstable.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark is designed for skateparks. The Clark is unsuitable for skateparks.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark is unsuitable for skateparks.'), 'FAIL_CLOSED');
});

test('whitespace variants and prefixed-adjective negations cannot smuggle contradictions', () => {
  const report = casesById['landyachtz-the-clark'].report;
  const decisionFor = (text) =>
    verifyClaims({suggestions: {description: {text, used_fact_ids: ['description']}}, facts: report}).decision;
  assert.equal(decisionFor('The Clark is a twin-kick board. The Clark is not a twin  kick board.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark is unsuited for skateparks.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark is inappropriate for skateparks.'), 'FAIL_CLOSED');
});

test('typographic apostrophes and dashes cannot hide a negation', () => {
  const report = casesById['landyachtz-the-clark'].report;
  const decisionFor = (text) =>
    verifyClaims({suggestions: {description: {text, used_fact_ids: ['description']}}, facts: report}).decision;
  assert.equal(decisionFor('The Clark isn’t a twin-kick board.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark isnt a twin-kick board.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark isn’t a twin‑kick board.'), 'FAIL_CLOSED');
});

test('unicode apostrophe and dash variants cannot hide a negation, solo or paired', () => {
  const report = casesById['landyachtz-the-clark'].report;
  const decisionFor = (text) =>
    verifyClaims({suggestions: {description: {text, used_fact_ids: ['description']}}, facts: report}).decision;
  assert.equal(decisionFor('The Clark isnʼt a twin-kick board.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark is a 40.2 inch longboard. It isn’t a twin−kick board.'), 'FAIL_CLOSED');
  assert.equal(decisionFor('The Clark is a 40.2 inch longboard. It is not a twin－kick board.'), 'FAIL_CLOSED');
});

test('baseline verifier is untouched and still gates identically', () => {
  // The prototype must not have loosened the formal verifier: an
  // invented token still fails the Baseline exactly as before.
  const facts = {
    product_name: {value: 'The Clark', citations: ['s1'], verification: 'source_asserted'},
    title: {value: 'The Clark', citations: ['s1'], verification: 'source_asserted'},
    meta_description: {value: null, citations: [], verification: 'UNKNOWN'},
    description: {value: 'The Clark. Maple complete with 54mm wheels.', citations: ['s3'], verification: 'source_asserted'},
  };
  const problems = verifySuggestions({
    title: {text: 'The Clark titanium edition', used_fact_ids: ['product_name']},
    meta_description: {text: 'Maple complete', used_fact_ids: ['description']},
    description: {text: 'Maple complete with 54mm wheels.', used_fact_ids: ['description']},
  }, facts);
  assert.ok(problems.some(p => p.includes('titanium')));
});
