import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {Controller, CheckpointCorrupt} from './controller.mjs';
import {ciStatusOnce} from './adapters.mjs';

const dir = () => mkdtemp(join(tmpdir(), 'growth-controller-'));
const approve = async (t) => ({verdict: 'APPROVE', commit: t.commit, completed: true, sessionId: 'reviewer-session'});
const ok = {code: async () => {}, test: async () => 'PASS', ci: async () => 'PASS', review: approve};

test('normal completion reaches REVIEW_PASS only via bound reviewer', async () => {
  const t = await new Controller({dir: await dir(), tools: ok}).run({id: 't1', commit: 'aaa'});
  assert.equal(t.status, 'REVIEW_PASS');
});

test('resume continues from last successful stage, code not redone', async () => {
  const d = await dir(); let coded = 0;
  const tools = {...ok, code: async () => { coded++; }, test: async () => 'FAIL'};
  const first = await new Controller({dir: d, tools}).run({id: 't2', commit: 'aaa'});
  assert.equal(first.status, 'FAIL');
  const second = await new Controller({dir: d, tools: {...ok, code: async () => { coded++; }}}).run({id: 't2', commit: 'aaa'});
  assert.equal(coded, 1); assert.equal(second.status, 'REVIEW_PASS'); // test stage retried, code skipped
});

test('corrupt checkpoint stops and is never overwritten', async () => {
  const d = await dir(); await writeFile(join(d, 'state.json'), '{broken');
  await assert.rejects(new Controller({dir: d, tools: ok}).run({id: 't3', commit: 'aaa'}), CheckpointCorrupt);
  assert.equal(await readFile(join(d, 'state.json'), 'utf8'), '{broken');
});

test('interrupted write leaves no partial state (atomic rename)', async () => {
  const d = await dir();
  const t = await new Controller({dir: d, tools: ok}).run({id: 't4', commit: 'aaa'});
  const saved = JSON.parse(await readFile(join(d, 'state.json'), 'utf8')); // parses: never torn
  assert.equal(saved.tasks['t4@aaa'].status, 'REVIEW_PASS'); assert.equal(t.status, 'REVIEW_PASS');
});

test('stale lock is reclaimed, fresh lock blocks', async () => {
  const d = await dir();
  await writeFile(join(d, 'controller.lock'), '{}');
  const old = new Date(Date.now() - 120000); await utimes(join(d, 'controller.lock'), old, old);
  const t = await new Controller({dir: d, tools: ok}).run({id: 't5', commit: 'aaa'});
  assert.equal(t.status, 'REVIEW_PASS');
});

test('API 429 on code retries at most twice', async () => {
  let calls = 0; const err = () => Object.assign(new Error('rate'), {code: 'RATE_LIMIT'});
  const tools = {...ok, code: async () => { calls++; throw err(); }};
  const t = await new Controller({dir: await dir(), tools}).run({id: 't6', commit: 'aaa'});
  assert.equal(calls, 2); assert.equal(t.status, 'FAIL');
});

test('stale reviewer verdict for another commit is invalid', async () => {
  const tools = {...ok, review: async () => ({verdict: 'APPROVE', commit: 'OLD', completed: true, sessionId: 'reviewer-session'})};
  const t = await new Controller({dir: await dir(), tools}).run({id: 't7', commit: 'NEW'});
  assert.equal(t.status, 'REVIEW_BLOCKED');
});

test('same-session or incomplete reviewer verdict is invalid', async () => {
  const same = {...ok, review: async (t) => ({verdict: 'APPROVE', commit: t.commit, completed: true, sessionId: 'coder-session'})};
  assert.equal((await new Controller({dir: await dir(), tools: same}).run({id: 't8', commit: 'aaa'})).status, 'REVIEW_BLOCKED');
  const incomplete = {...ok, review: async (t) => ({verdict: 'APPROVE', commit: t.commit, completed: false, sessionId: 'reviewer-session'})};
  assert.equal((await new Controller({dir: await dir(), tools: incomplete}).run({id: 't9', commit: 'aaa'})).status, 'REVIEW_BLOCKED');
});

test('CI adapter: mixed results fail, pending pends, wrong HEAD blocked', async () => {
  const runs = (list) => async () => JSON.stringify(list);
  const base = {repo: 'RC918/Growth-OS', pr: 31, headSha: 'abc'};
  assert.equal(await ciStatusOnce({...base, exec: runs([{name: 'test', id: 2, status: 'completed', conclusion: 'failure'}])})(), 'FAIL');
  assert.equal(await ciStatusOnce({...base, exec: runs([{name: 'test', id: 2, status: 'in_progress', conclusion: null}])})(), 'PENDING');
  assert.equal(await ciStatusOnce({...base, exec: runs([])})(), 'BLOCKED');
  assert.equal(await ciStatusOnce({...base, exec: runs([{name: 'test', id: 2, status: 'completed', conclusion: 'success'}])})(), 'PASS');
});

test('duplicate finished task never re-executes', async () => {
  const d = await dir(); let coded = 0;
  const tools = {...ok, code: async () => { coded++; }};
  await new Controller({dir: d, tools}).run({id: 't10', commit: 'bbb'});
  await new Controller({dir: d, tools}).run({id: 't10', commit: 'bbb'});
  assert.equal(coded, 1);
});
