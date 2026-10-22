import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Blind-package leak check. This test never imports or runs the
// claim prototype: the holdout must stay independent until the
// independent annotation is frozen.
const blind = JSON.parse(await readFile(new URL('./fixtures/claim-holdout-blind-v1.json', import.meta.url)));
const labelled = JSON.parse(await readFile(new URL('./fixtures/claim-holdout-v1.json', import.meta.url)));

test('blind package contains all 30 cases with evidence but no labels', () => {
  assert.equal(blind.entries.length, 30);
  assert.equal(blind.status, 'FOR_INDEPENDENT_ANNOTATION');
  const raw = JSON.stringify(blind);
  for (const forbidden of ['expected_decision', 'label_rationale', 'engineering-prelabelled',
    'supported_rewrite', 'unsupported_or_contradictory', '"used_fact_ids"', '"group"']) {
    assert.ok(!raw.includes(forbidden), 'blind package leaks: ' + forbidden);
  }
  const labelledById = Object.fromEntries(labelled.entries.map(e => [e.id, e]));
  for (const entry of blind.entries) {
    const source = labelledById[entry.id];
    assert.ok(source, entry.id + ': not in the labelled holdout');
    assert.equal(entry.text, source.text, entry.id + ': text drifted from labelled holdout');
    assert.deepEqual(entry.evidence, source.evidence, entry.id + ': evidence drifted');
    assert.deepEqual(Object.keys(entry).sort(), ['evidence', 'id', 'language', 'text']);
  }
});

test('blind order does not follow the labelled group order', () => {
  const labelledOrder = labelled.entries.map(e => e.id);
  const blindOrder = blind.entries.map(e => e.id);
  assert.notDeepEqual(blindOrder, labelledOrder);
  assert.deepEqual([...blindOrder].sort(), [...labelledOrder].sort());
});
