import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {Controller, CheckpointCorrupt, parseRetryAfter} from './controller.mjs';
import {ciStatusOnce} from './adapters.mjs';

const dir = () => mkdtemp(join(tmpdir(), 'growth-controller-'));
const approve = async (t) => ({verdict: 'APPROVE', commit: t.outputSha ?? t.commit, completed: true, source: 'independent-reviewer', sessionId: 'reviewer-session'});
const ok = {code: async () => {}, test: async () => 'PASS', ci: async () => 'PASS', review: approve, gitHead: async () => 'aaa', gitClean: async () => true, isAlive: async () => false};

test('normal completion reaches REVIEW_PASS via bound reviewer', async () => {
  assert.equal((await new Controller({dir: await dir(), tools: ok}).run({id: 'a', commit: 'aaa'})).status, 'REVIEW_PASS');
});

test('lock competition: live holder blocks, dead expired holder is reclaimed', async () => {
  const d = await dir();
  let release; const gate = new Promise((r) => { release = r; });
  const slow = new Controller({dir: d, tools: {...ok, code: async () => gate}, runId: 'run-1'});
  const p = slow.run({id: 'b1', commit: 'aaa'});
  const other = new Controller({dir: d, tools: {...ok, isAlive: async () => true}, runId: 'run-2'});
  await assert.rejects(other.run({id: 'b2', commit: 'aaa'}), /LOCKED/);
  release(); await p;
  const dead = new Controller({dir: d, tools: ok, runId: 'run-3'}); // prior lock released; normal handover works
  assert.equal((await dead.run({id: 'b3', commit: 'aaa'})).status, 'REVIEW_PASS');
});

test('old holder cannot delete successor lock', async () => {
  const d = await dir();
  let release; const gate = new Promise((r) => { release = r; });
  const old = new Controller({dir: d, tools: {...ok, code: async () => gate}, runId: 'old-run'});
  const p = old.run({id: 'b9', commit: 'aaa'});
  await new Promise((r) => setTimeout(r, 20));
  await writeFile(join(d, 'controller.lock'), JSON.stringify({ownerId: 'o', pid: 1, runId: 'new-run', session: 's', expiresAt: Date.now() + 60000}));
  release(); await p;
  const kept = JSON.parse(await readFile(join(d, 'controller.lock'), 'utf8'));
  assert.equal(kept.runId, 'new-run');
});

test('429 saves multi-hour wait, restart does not call model before due', async () => {
  const d = await dir(); let calls = 0; const t0 = 1_000_000;
  const err = Object.assign(new Error('rate'), {code: 'RATE_LIMIT', retryAfterMs: 3 * 3600_000});
  const tools = {...ok, code: async () => { calls++; throw err; }};
  const first = await new Controller({dir: d, tools, now: () => t0}).run({id: 'c', commit: 'aaa'});
  assert.equal(first.status, 'WAITING'); assert.equal(first.waitUntil, t0 + 3 * 3600_000);
  const restarted = await new Controller({dir: d, tools, now: () => t0 + 1000}).run({id: 'c', commit: 'aaa'});
  assert.equal(restarted.status, 'WAITING'); assert.equal(calls, 1); // watchdog gate held
  assert.equal(parseRetryAfter({headers: {'retry-after': '120'}}, t0), t0 + 120000);
});

test('new commit invalidates prior test/CI/review evidence', async () => {
  const d = await dir(); let head = 'aaa';
  const tools = {...ok, gitHead: async () => head};
  await new Controller({dir: d, tools}).run({id: 'd', commit: 'aaa'});
  head = 'bbb';
  const t = await new Controller({dir: d, tools}).run({id: 'd', commit: 'bbb'});
  assert.equal(t.outputSha, 'bbb'); assert.equal(t.stages.review.commit, 'bbb');
});

test('untrusted reviewer verdicts are rejected', async () => {
  const badSource = {...ok, review: async (t) => ({verdict: 'APPROVE', commit: 'aaa', completed: true, source: 'coder', sessionId: 'reviewer-session'})};
  assert.equal((await new Controller({dir: await dir(), tools: badSource}).run({id: 'e', commit: 'aaa'})).status, 'REVIEW_BLOCKED');
  const badSha = {...ok, review: async () => ({verdict: 'APPROVE', commit: 'OLD', completed: true, source: 'independent-reviewer', sessionId: 'reviewer-session'})};
  assert.equal((await new Controller({dir: await dir(), tools: badSha}).run({id: 'e', commit: 'aaa'})).status, 'REVIEW_BLOCKED');
});

test('corrupt checkpoint stops and is preserved', async () => {
  const d = await dir(); await writeFile(join(d, 'state.json'), '{broken');
  await assert.rejects(new Controller({dir: d, tools: ok}).run({id: 'f', commit: 'aaa'}), CheckpointCorrupt);
  assert.equal(await readFile(join(d, 'state.json'), 'utf8'), '{broken');
});

test('CI adapter handles pagination, reruns, mixed and missing checks', async () => {
  const page1 = Array.from({length: 100}, (_, i) => ({name: 'other' + i, id: i, status: 'completed', conclusion: 'success'}));
  const exec = async (cmd, args) => JSON.stringify(new URLSearchParams(args[1].split('?')[1]).get('page') === '1' ? page1 : [{name: 'test', id: 1, status: 'completed', conclusion: 'failure'}, {name: 'test', id: 2, status: 'completed', conclusion: 'success'}]);
  assert.equal(await ciStatusOnce({exec, repo: 'RC918/Growth-OS', headSha: 'abc'})(), 'PASS'); // latest rerun wins
  const missing = async () => JSON.stringify([]);
  assert.equal(await ciStatusOnce({exec: missing, repo: 'R', headSha: 'x'})(), 'BLOCKED');
  const neutral = async () => JSON.stringify([{name: 'test', id: 1, status: 'completed', conclusion: 'neutral'}]);
  assert.equal(await ciStatusOnce({exec: neutral, repo: 'R', headSha: 'x'})(), 'FAIL');
  const pending = async () => JSON.stringify([{name: 'test', id: 1, status: 'queued', conclusion: null}]);
  assert.equal(await ciStatusOnce({exec: pending, repo: 'R', headSha: 'x'})(), 'PENDING');
});
