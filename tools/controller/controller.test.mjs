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
