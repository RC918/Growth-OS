import assert from 'node:assert/strict';
import test from 'node:test';
import {ciStatusOnce, reviewerGate} from './adapters.mjs';

test('CI adapter does one query and maps pending to PENDING', async () => {
  let calls = 0;
  const status = ciStatusOnce(async () => { calls++; return 'test\tpending\t0'; });
  assert.equal(await status(), 'PENDING'); assert.equal(calls, 1);
});

test('CI adapter maps pass and fail without polling', async () => {
  assert.equal(await ciStatusOnce(async () => 'test\tpass\t1m')(), 'PASS');
  assert.equal(await ciStatusOnce(async () => 'test\tfail\t1m')(), 'FAIL');
  assert.equal(await ciStatusOnce(async () => 'unknown')(), 'BLOCKED');
});

test('reviewer gate only forwards explicit APPROVE', async () => {
  assert.equal(await reviewerGate(async () => 'APPROVE')({}), 'APPROVE');
  assert.equal(await reviewerGate(async () => 'BLOCKED')({}), 'REVIEW_BLOCKED');
});
