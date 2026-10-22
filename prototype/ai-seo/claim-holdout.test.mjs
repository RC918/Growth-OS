import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Structural validation only. This test deliberately does NOT
// import or run the claim prototype: the holdout set must stay
// independent of prototype behaviour until independent annotation
// is complete, otherwise it stops being a holdout.
const holdout = JSON.parse(await readFile(new URL('./fixtures/claim-holdout-v1.json', import.meta.url)));
const benchmark = JSON.parse(await readFile(new URL('./fixtures/claim-benchmark.json', import.meta.url)));
const cases = JSON.parse(await readFile(new URL('./fixtures/phase3b-cases.json', import.meta.url)));
const casesById = Object.fromEntries(cases.cases.map(c => [c.id, c]));

test('holdout has 30 independent cases in three balanced groups', () => {
  assert.equal(holdout.entries.length, 30);
  const groups = {};
  for (const entry of holdout.entries) groups[entry.group] = (groups[entry.group] ?? 0) + 1;
  assert.deepEqual(groups, {supported_rewrite: 10, unsupported_or_contradictory: 10, complex: 10});
  const ids = new Set(holdout.entries.map(e => e.id));
  assert.equal(ids.size, 30);
  const texts = new Set(holdout.entries.map(e => e.text));
  assert.equal(texts.size, 30);
});

test('holdout sentences are disjoint from the 13 benchmark sentences', () => {
  // Punctuation-insensitive token comparison: changing only dashes
  // or full stops does not make a sentence independent.
  const tokens = (s) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/).filter(Boolean));
  const benchTexts = benchmark.entries.map(e => tokens(e.text));
  for (const entry of holdout.entries) {
    const mine = tokens(entry.text);
    for (const bench of benchTexts) {
      const intersection = [...mine].filter(w => bench.has(w)).length;
      const union = new Set([...mine, ...bench]).size;
      const jaccard = union === 0 ? 0 : intersection / union;
      assert.ok(jaccard < 0.85,
        entry.id + ' is a punctuation-level duplicate of a benchmark sentence (jaccard ' + jaccard.toFixed(2) + ')');
    }
  }
});

test('every holdout case carries traceable evidence and an honest label state', () => {
  assert.equal(holdout.annotation_spec.human_annotation, false);
  assert.equal(holdout.annotation_spec.human_labelled_count, 0);
  assert.equal(holdout.status, 'AWAITING_INDEPENDENT_ANNOTATION');
  for (const entry of holdout.entries) {
    const testCase = casesById[entry.fact_case];
    assert.ok(testCase, entry.id + ': unknown fact case');
    assert.ok(entry.label_rationale, entry.id + ': missing rationale');
    assert.ok(['PASS', 'PASS_WITH_REVIEW', 'FAIL_CLOSED', 'REVIEW_ADJUDICATION']
      .includes(entry.expected_decision), entry.id + ': bad expected decision');
    assert.ok(Array.isArray(entry.evidence) && entry.evidence.length > 0, entry.id + ': no evidence');
    for (const ev of entry.evidence) {
      const fact = testCase.report.facts[ev.fact_id];
      assert.ok(fact, entry.id + ': unknown fact ' + ev.fact_id);
      for (const citationId of ev.citation_ids) {
        assert.ok((fact.citations ?? []).includes(citationId),
          entry.id + ': citation ' + citationId + ' not bound to fact ' + ev.fact_id);
      }
      if (ev.quote_excerpt === 'UNKNOWN') {
        assert.equal(fact.value, null, entry.id + ': UNKNOWN marker on a valued fact');
      } else {
        assert.ok(String(fact.value ?? '').includes(ev.quote_excerpt),
          entry.id + ': excerpt not in fact value: ' + ev.quote_excerpt);
      }
    }
  }
});
