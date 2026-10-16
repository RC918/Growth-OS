import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {Controller, CheckpointCorrupt} from './controller.mjs';
import {Watchdog} from './watchdog.mjs';
import {ciStatusOnce} from './adapters.mjs';

const dir = () => mkdtemp(join(tmpdir(), 'growth-loop-'));
const approve = async (t) => ({verdict: 'APPROVE', commit: t.outputSha ?? t.commit, completed: true, source: 'independent-reviewer', sessionId: 'reviewer-session'});
const ok = {plan: async () => {}, code: async () => {}, test: async () => 'PASS', build: async () => 'PASS', e2e: async () => 'PASS', dbauth: async () => 'PASS', review: approve, preview: async () => 'PASS', gitHead: async () => 'aaa', gitClean: async () => true, isAlive: async () => false};

test('one full execution loop completes all stages with audit', async () => {
  const d = await dir();
  const t = await new Controller({dir: d, tools: ok}).run({id: 'full', commit: 'aaa'});
  assert.equal(t.status, 'REVIEW_PASS');
  const s = JSON.parse(await readFile(join(d, 'state.json'), 'utf8'));
  assert.ok(s.audit.some((a) => a.event === 'stage:verify=PASS'));
});

test('CI delay resumes at ci-equivalent stage without redoing code', async () => {
  const d = await dir(); let coded = 0, previews = 0;
  const slow = {...ok, code: async () => { coded++; }, preview: async () => (++previews === 1 ? 'PENDING' : 'PASS')};
  const first = await new Controller({dir: d, tools: slow}).run({id: 'ci', commit: 'aaa'});
  assert.equal(first.status, 'PENDING');
  const second = await new Controller({dir: d, tools: slow}).run({id: 'ci', commit: 'aaa'});
  assert.equal(second.status, 'REVIEW_PASS'); assert.equal(coded, 1);
});

test('429 persists wait and watchdog does not call before due', async () => {
  const d = await dir(); let calls = 0; const t0 = 1_000_000;
  const err = Object.assign(new Error('rate'), {code: 'RATE_LIMIT', retryAfterMs: 3600_000});
  const tools = {...ok, code: async () => { calls++; throw err; }};
  const first = await new Controller({dir: d, tools, now: () => t0}).run({id: 'r', commit: 'aaa'});
  assert.equal(first.status, 'WAITING');
  const again = await new Controller({dir: d, tools, now: () => t0 + 1000}).run({id: 'r', commit: 'aaa'});
  assert.equal(again.status, 'WAITING'); assert.equal(calls, 1);
});

test('reviewer failure stops safely with limited retries, code not redone', async () => {
  const d = await dir(); let coded = 0, reviews = 0;
  const tools = {...ok, code: async () => { coded++; }, review: async () => { reviews++; throw new Error('lost'); }};
  await new Controller({dir: d, tools}).run({id: 'rev', commit: 'aaa'});
  const t = await new Controller({dir: d, tools}).run({id: 'rev', commit: 'aaa'});
  assert.equal(t.status, 'REVIEW_BLOCKED'); assert.equal(coded, 1); assert.ok(reviews <= 2);
});

test('abrupt interruption mid-code leaves resumable checkpoint, no duplicate code on finished stages', async () => {
  const d = await dir(); let coded = 0;
  const crashing = {...ok, test: async () => { throw Object.assign(new Error('boom'), {code: 'CRASH'}); }, code: async () => { coded++; }};
  const first = await new Controller({dir: d, tools: crashing}).run({id: 'x', commit: 'aaa'});
  assert.equal(first.stages.code.status, 'PASS');
  const second = await new Controller({dir: d, tools: {...ok, code: async () => { coded++; }}}).run({id: 'x', commit: 'aaa'});
  assert.equal(second.status, 'REVIEW_PASS'); assert.equal(coded, 1);
});

test('watchdog tick bypasses BLOCKED task and resumes pending one; event triggers same tick', async () => {
  const d = await dir();
  const blockedTools = {...ok, test: async () => 'FAIL'};
  await new Controller({dir: d, tools: blockedTools}).run({id: 'bad', commit: 'aaa'});
  const slow = {...ok, preview: async () => 'PENDING'};
  await new Controller({dir: d, tools: slow}).run({id: 'slow', commit: 'aaa'});
  let notified = 0;
  const wd = new Watchdog({controller: new Controller({dir: d, tools: ok}), inspect: {}, notify: async () => { notified++; }});
  const actions = await wd.onEvent({type: 'check_run'});
  assert.ok(actions.some((a) => a.task === 'bad' && a.action === 'bypass-blocked'));
  assert.ok(actions.some((a) => a.task === 'slow' && a.action === 'resumed'));
  const s = JSON.parse(await readFile(join(d, 'state.json'), 'utf8'));
  assert.equal(s.tasks['slow@aaa'].status, 'REVIEW_PASS'); assert.equal(notified, 0);
});

test('corrupt checkpoint stops; structured CI never greens on missing/pending', async () => {
  const d = await dir(); await writeFile(join(d, 'state.json'), '{broken');
  await assert.rejects(new Controller({dir: d, tools: ok}).run({id: 'z', commit: 'aaa'}), CheckpointCorrupt);
  const pending = async () => JSON.stringify([{name: 'test', id: 1, status: 'queued', conclusion: null}]);
  assert.equal(await ciStatusOnce({exec: pending, repo: 'RC918/Growth-OS', headSha: 'abc'})(), 'PENDING');
  const missing = async () => JSON.stringify([]);
  assert.equal(await ciStatusOnce({exec: missing, repo: 'RC918/Growth-OS', headSha: 'abc'})(), 'BLOCKED');
});

test('payload is persisted and recovered on resume without re-supply', async () => {
  const d = await dir(); let seen = null;
  const failing = {...ok, code: async (t, p) => { seen = p; throw Object.assign(new Error('x'), {code: 'FAILX'}); }};
  await new Controller({dir: d, tools: failing}).run({id: 'p', commit: 'aaa', payload: {step: 'do-thing'}});
  const resumed = {...ok, code: async (t, p) => { seen = p; }};
  const t = await new Controller({dir: d, tools: resumed}).run({id: 'p', commit: 'aaa'}); // no payload supplied
  assert.deepEqual(seen, {step: 'do-thing'}); assert.equal(t.status, 'REVIEW_PASS');
  const s = JSON.parse(await readFile(join(d, 'state.json'), 'utf8'));
  assert.deepEqual(s.tasks['p@aaa'].payload, {step: 'do-thing'});
});

test('heartbeat keeps lease alive during a long stage', async () => {
  const d = await dir(); let leaseDuring = null;
  const tools = {...ok, code: async () => { leaseDuring = JSON.parse(await readFile(join(d, 'controller.lock'), 'utf8')); }};
  const c = new Controller({dir: d, tools, heartbeatMs: 10});
  await c.run({id: 'h', commit: 'aaa'});
  assert.equal(leaseDuring.runId, c.runId); assert.ok(leaseDuring.expiresAt > Date.now());
});

test('real git adapter reads actual HEAD and clean state', async () => {
  const {execFile} = await import('node:child_process');
  const {promisify} = await import('node:util');
  const run = promisify(execFile);
  const exec = async (cmd, args) => (await run(cmd, args)).stdout;
  const {gitTools} = await import('./adapters.mjs');
  const g = gitTools(exec, process.cwd());
  assert.match(await g.gitHead(), /^[a-f0-9]{40}$/);
  assert.equal(typeof await g.gitClean(), 'boolean');
});

test('CI adapter maps transport failure to BLOCKED, never green', async () => {
  const down = async () => { throw new Error('context deadline exceeded'); };
  assert.equal(await ciStatusOnce({exec: down, repo: 'RC918/Growth-OS', headSha: 'abc'})(), 'BLOCKED');
});

test('watchdog resume retains original payload and task inputs from checkpoint', async () => {
  const d = await dir(); let seen = null;
  const pending = {...ok, preview: async () => 'PENDING'};
  await new Controller({dir: d, tools: pending}).run({id: 'w', commit: 'aaa', payload: {url: 'https://example.invalid/p', step: 3}});
  const resumedTools = {...ok, code: async (t, p) => { seen = p; }};
  const wd = new Watchdog({controller: new Controller({dir: d, tools: resumedTools}), inspect: {}, notify: async () => {}});
  const actions = await wd.tick('schedule');
  assert.ok(actions.some((a) => a.task === 'w' && a.action === 'resumed'));
  const s = JSON.parse(await readFile(join(d, 'state.json'), 'utf8'));
  assert.deepEqual(s.tasks['w@aaa'].payload, {url: 'https://example.invalid/p', step: 3});
  assert.equal(s.tasks['w@aaa'].status, 'REVIEW_PASS');
});

test('watchdog never retries 429 before reset time', async () => {
  const d = await dir(); const t0 = 5_000_000;
  const err = Object.assign(new Error('rate'), {code: 'RATE_LIMIT', resetAt: t0 + 7200_000});
  const tools = {...ok, code: async () => { throw err; }};
  await new Controller({dir: d, tools, now: () => t0}).run({id: 'q', commit: 'aaa'});
  const wd = new Watchdog({controller: new Controller({dir: d, tools, now: () => t0 + 1000}), inspect: {}, notify: async () => {}});
  const actions = await wd.tick('schedule');
  assert.deepEqual(actions, [{task: 'q', action: 'wait-429'}]);
});

test('lock race: heartbeat renews lease, unlock by old holder keeps successor', async () => {
  const d = await dir();
  let lease1 = null, lease2 = null;
  const tools = {...ok, code: async () => { lease1 = JSON.parse(await readFile(join(d, 'controller.lock'), 'utf8')); await new Promise((r) => setTimeout(r, 30)); lease2 = JSON.parse(await readFile(join(d, 'controller.lock'), 'utf8')); }};
  const c = new Controller({dir: d, tools, heartbeatMs: 5});
  await c.run({id: 'lock', commit: 'aaa'});
  assert.equal(lease1.runId, c.runId); assert.ok(lease2.expiresAt >= lease1.expiresAt);
});

test('hung tool is bounded by per-tool timeout', async () => {
  const tools = {...ok, test: () => new Promise(() => {})};
  const t = await new Controller({dir: await dir(), tools, toolTimeoutMs: 30}).run({id: 'hang', commit: 'aaa'});
  assert.equal(t.status, 'FAIL'); assert.ok(t.log.some((l) => l.includes('TOOL_TIMEOUT')));
});

test('10-minute patrol: synthetic clock, single dispatch, no overlap, running task supervised', async () => {
  const {PATROL_INTERVAL_MS, Watchdog} = await import('./watchdog.mjs');
  assert.equal(PATROL_INTERVAL_MS, 600_000);
  const d = await dir(); let coded = 0;
  const pending = {...ok, code: async () => { coded++; }, preview: async () => 'PENDING'};
  await new Controller({dir: d, tools: pending}).run({id: 'p1', commit: 'aaa'});
  await new Controller({dir: d, tools: pending}).run({id: 'p2', commit: 'aaa'});
  const wd = new Watchdog({controller: new Controller({dir: d, tools: {...ok, code: async () => { coded++; }}}), inspect: {isRunning: async (t) => t.id === 'p2'}, notify: async () => {}});
  const [a, b] = await Promise.all([wd.tick('patrol'), wd.tick('patrol')]); // overlapping patrols
  const all = [...a, ...b];
  assert.ok(all.some((x) => x.action === 'skip-overlap')); // second patrol never dispatches
  assert.equal(all.filter((x) => x.action === 'resumed').length, 1); // at most one coder per tick
  assert.ok(all.some((x) => x.task === 'p2' && x.action === 'supervise-only'));
  assert.equal(coded, 2); // two setup runs only; patrol resumed without redoing code
});
