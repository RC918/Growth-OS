import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html = await readFile(new URL('./annotation/review.html', import.meta.url), 'utf8');
const blind = JSON.parse(await readFile(new URL('./fixtures/claim-holdout-blind-v1.json', import.meta.url)));

test('review page embeds exactly the 30 blind cases and no labels', () => {
  for (const entry of blind.entries) {
    assert.ok(html.includes(entry.id), 'missing case ' + entry.id);
    assert.ok(html.includes(entry.text), 'missing text for ' + entry.id);
  }
  for (const forbidden of ['expected_decision', 'label_rationale', 'engineering-prelabelled',
    'used_fact_ids', 'supported_rewrite', 'unsupported_or_contradictory',
    'PASS_WITH_REVIEW', 'FAIL_CLOSED', 'prototype decision', 'claim-verifier']) {
    assert.ok(!html.includes(forbidden), 'page leaks: ' + forbidden);
  }
});

test('review page offers the three plain-language decisions and per-annotator export', () => {
  for (const option of ['正確', '錯誤', '無法判定']) assert.ok(html.includes(option));
  assert.ok(html.includes('exportCsv'));
  assert.ok(html.includes('case_id,annotator_code,decision,reason'));
  assert.ok(html.includes('exportAdj'), 'adjudication export missing');
  assert.ok(!html.includes('api.github.com') && !html.includes('github.com/login'),
    'page must not require GitHub');
});
