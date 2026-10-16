import assert from 'node:assert/strict';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {Controller} from './controller.mjs';

const dir = () => mkdtemp(join(tmpdir(), 'growth-controller-'));
const ok = {code: async () => {}, test: async () => 'PASS', review: async () => 'APPROVE'};

test('normal completion reaches REVIEW_PASS only via reviewer', async () => {
  const c = new Controller({dir: await dir(), tools: ok});
  const t = await c.run({id: 't1', commit: 'aaa'});
  assert.equal(t.status, 'REVIEW_PASS'); assert.equal(t.attempts, 1);
});

test('task failure is FAIL with checkpoint on disk', async () => {
  const d = await dir();
  const c = new Controller({dir: d, tools: {...ok, test: async () => 'FAIL'}});
  const t = await c.run({id: 't2', commit: 'aaa'});
  assert.equal(t.status, 'FAIL');
  const saved = JSON.parse(await readFile(join(d, 'state.json'), 'utf8'));
  assert.equal(saved.tasks['t2@aaa'].status, 'FAIL');
});

test('API 429 retries at most twice then stops', async () => {
  let calls = 0;
  const err = () => { const e = new Error('rate'); e.code = 'RATE_LIMIT'; return e; };
  const c = new Controller({dir: await dir(), tools: {...ok, code: async () => { calls++; throw err(); }}});
  const t = await c.run({id: 't3', commit: 'aaa'});
  assert.equal(calls, 2); assert.equal(t.status, 'FAIL'); assert.match(t.log.at(-1), /retry limit/);
});

test('reviewer startup failure is REVIEW_BLOCKED, never self-approved', async () => {
  const c = new Controller({dir: await dir(), tools: {...ok, review: async () => { throw new Error('lost'); }}});
  const t = await c.run({id: 't4', commit: 'aaa'});
  assert.equal(t.status, 'REVIEW_BLOCKED');
});

test('CI long PENDING does not block or loop', async () => {
  const c = new Controller({dir: await dir(), tools: {...ok, test: async () => 'PENDING'}});
  const t = await c.run({id: 't5', commit: 'aaa'});
  assert.equal(t.status, 'PENDING'); assert.equal(t.attempts, 1);
});

test('interruption resumes from checkpoint without redoing finished task', async () => {
  const d = await dir();
  let coded = 0;
  const first = new Controller({dir: d, tools: {...ok, code: async () => { coded++; }}});
  await first.run({id: 't6', commit: 'aaa'});
  const second = new Controller({dir: d, tools: ok}); // simulated restart, same state dir
  const t = await second.run({id: 't6', commit: 'aaa'});
  assert.equal(t.deduped, true); assert.equal(coded, 1);
});

test('duplicate task id+commit never re-executes', async () => {
  let coded = 0;
  const c = new Controller({dir: await dir(), tools: {...ok, code: async () => { coded++; }}});
  await c.run({id: 't7', commit: 'bbb'});
  const again = await c.run({id: 't7', commit: 'bbb'});
  assert.equal(again.deduped, true); assert.equal(coded, 1);
});

test('concurrent run is BLOCKED by execution lock', async () => {
  const d = await dir();
  let release; const gate = new Promise((r) => { release = r; });
  const slow = new Controller({dir: d, tools: {...ok, code: async () => gate}});
  const p = slow.run({id: 't8', commit: 'aaa'});
  const other = new Controller({dir: d, tools: ok});
  await assert.rejects(other.run({id: 't9', commit: 'aaa'}), /LOCKED/);
  release(); await p;
});
