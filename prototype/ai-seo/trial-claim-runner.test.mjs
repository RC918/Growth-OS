import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createMockFetch, runTrial} from './run-phase3b-trial.mjs';
import {evaluateGeneration} from './quality-eval.mjs';

const {cases} = JSON.parse(await readFile(new URL('./fixtures/phase3b-cases.json', import.meta.url)));
const landy = cases.find(c => c.id === 'landyachtz-the-clark');
const credentialProvider = async () => 'offline-test-only';

// Existing fetch seam and existing source: no fixture mutation or source remapping.
for (const field of ['title', 'meta_description', 'description', 'description-full', 'geo_qa[0]', 'geo_qa[1]']) {
  test('true mock runner blocks opposite stable polarity in ' + field, async () => {
    let legacy;
    const mock = createMockFetch();
    const result = await runTrial({mode: 'mock', credentialProvider,
      caseId: landy.id, language: 'en', fetchImpl: async (url, options) => {
        const response = await mock(url, options);
        const payload = await response.json();
        const suggestions = JSON.parse(payload.output_text);
        const actualField = field === 'description-full' ? 'description' : field;
        const opposite = {text: field === 'description-full'
          ? suggestions.description.text.replaceAll('long, stable platform', 'long, not stable platform')
          : 'The Clark is not stable.', used_fact_ids: ['description']};
        if (field.startsWith('geo_qa')) {
          const index = field === 'geo_qa[1]' ? 1 : 0;
          suggestions.geo_qa[index] = {question: 'Is it stable?', answer: opposite.text,
            used_fact_ids: opposite.used_fact_ids};
        } else suggestions[actualField] = opposite;
        legacy = evaluateGeneration({report: landy.report, suggestions});
        return {...response, json: async () => ({...payload, output_text: JSON.stringify(suggestions)})};
      }});
    assert.equal(legacy.status, 'PASS_WITH_UNKNOWNS', JSON.stringify(legacy));
    assert.equal(result.status, 'MOCK_FAIL_CLOSED');
    const row = result.results[0];
    assert.equal(row.status, 'FAIL_CLOSED');
    assert.equal(row.human_rubric_required, true);
    const actualField = field === 'description-full' ? 'description' : field;
    const check = row.claim_gate.fields.find(f => f.field === actualField);
    const contradiction = check.claims.find(c => c.status === 'CONTRADICTED');
    assert.equal(contradiction.field, actualField);
    assert.equal(contradiction.fact_id, 'description');
    assert.deepEqual(contradiction.citation_ids, landy.report.facts.description.citations);
    assert.equal(contradiction.evidence, landy.report.facts.description.value);
    assert.ok(row.problems.some(p => p.startsWith(actualField + ':')));
    assert.equal(result.real_api_calls, 0);
  });
}

test('normal mock preserves UNKNOWN and does not upgrade human review', async () => {
  const result = await runTrial({mode: 'mock', credentialProvider, caseId: landy.id, language: 'en'});
  assert.equal(result.status, 'MOCK_PASS');
  const row = result.results[0];
  assert.equal(row.status, 'PASS_WITH_UNKNOWNS');
  assert.ok(row.unknown_facts.includes('meta_description'));
  assert.equal(row.human_rubric_required, true);
  assert.equal(row.claim_gate.fields.length, 4);
  assert.equal(row.claim_gate.review_status, 'REVIEW');
  assert.equal(row.claim_gate.decision, 'PASS_WITH_REVIEW');
});

test('original conflict fixture is rejected even when generation avoids conflicting field', async () => {
  const result = await runTrial({mode: 'mock', credentialProvider,
    caseId: 'conflicting-facts-negative', language: 'en'});
  const row = result.results[0];
  assert.equal(result.status, 'MOCK_FAIL_CLOSED');
  assert.equal(row.claim_gate.legacy_status, 'PASS_WITH_UNKNOWNS');
  assert.ok(row.claim_gate.fields.every(f => f.mapping_status === 'BLOCKED_SOURCE_CONFLICT'));
  assert.ok(row.claim_gate.fields.every(f => f.decision === 'FAIL_CLOSED'));
  assert.ok(row.problems.some(p => p.includes('unresolved report conflicts')));
});

test('real mock CLI exits 1 for conservative full six-result aggregate', () => {
  const child = spawnSync(process.execPath, [new URL('./run-phase3b-trial.mjs', import.meta.url).pathname,
    '--mock'], {encoding: 'utf8', timeout: 15000});
  assert.equal(child.status, 1, child.stderr);
  const summary = JSON.parse(child.stdout);
  assert.equal(summary.status, 'MOCK_FAIL_CLOSED');
  assert.equal(summary.results.length, 6);
  assert.equal(summary.results.filter(r => r.status === 'FAIL_CLOSED').length, 2);
  assert.equal(summary.real_api_calls, 0);
});
