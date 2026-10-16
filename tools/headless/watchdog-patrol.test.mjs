import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
import {mkdtemp, readFile, writeFile, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';
const run = promisify(execFile);
const entry = new URL('./watchdog-patrol.mjs', import.meta.url).pathname;

async function setup() {
  const d = await mkdtemp(join(tmpdir(), 'patrol-'));
  const bin = join(d, 'muse');
  await writeFile(bin, '#!/bin/sh\necho HEADLESS_OK\n'); await chmod(bin, 0o755);
  return {d, bin, state: join(d, 'state')};
}

test('patrol ticks on interval, logs persistently, and auto-stops at expiry', async () => {
  const {d, bin, state} = await setup();
  const {stdout} = await run('node', [entry, '--synthetic', '--state-dir', state, '--interval-ms', '50', '--duration-ms', '230'], {env: {...process.env, MUSE_BIN: bin}, timeout: 10_000});
  const rows = stdout.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(rows[0].event, 'patrol:start');
  assert.ok(rows.filter((r) => r.event === 'patrol:tick').length >= 3);
  assert.equal(rows.at(-1).event, 'patrol:stop'); assert.equal(rows.at(-1).reason, 'expired-24h');
  const logged = (await readFile(join(state, 'patrol-log.jsonl'), 'utf8')).trim().split('\n').length;
  assert.ok(logged >= 4); // persistent JSONL evidence survives the process
});

test('second patrol instance is blocked by single-instance lock', async () => {
  const {bin, state} = await setup();
  const first = spawn('node', [entry, '--synthetic', '--state-dir', state, '--interval-ms', '50', '--duration-ms', '2000'], {env: {...process.env, MUSE_BIN: bin}, stdio: 'pipe'});
  await new Promise((r) => setTimeout(r, 200));
  const {stdout} = await run('node', [entry, '--synthetic', '--state-dir', state, '--interval-ms', '50', '--duration-ms', '100'], {env: {...process.env, MUSE_BIN: bin}}).catch((e) => ({stdout: e.stdout}));
  assert.match(stdout, /single-instance lock held/);
  first.kill('SIGTERM');
  await new Promise((r) => first.on('close', r));
});

test('formal mode rejects too-short interval; any mode rejects invalid and over-long times', async () => {
  const {state} = await setup();
  const bad = [
    ['--interval-ms', '50'], // formal: below 600000
    ['--synthetic', '--interval-ms', 'abc'],
    ['--synthetic', '--interval-ms', '0'],
    ['--synthetic', '--interval-ms', '-5'],
    ['--synthetic', '--duration-ms', '86400001'],
    ['--synthetic', '--duration-ms', 'NaN'],
  ];
  for (const args of bad) {
    const r = await run('node', [entry, '--state-dir', state, ...args], {env: process.env}).catch((e) => ({stdout: e.stdout, code: e.code}));
    assert.equal(r.code, 2, args.join(' ')); assert.match(r.stdout, /patrol:blocked/);
  }
});

test('restart reuses the persisted deadline instead of recalculating 24h', async () => {
  const {bin, state} = await setup();
  const env = {...process.env, MUSE_BIN: bin};
  await run('node', [entry, '--synthetic', '--state-dir', state, '--interval-ms', '50', '--duration-ms', '300'], {env, timeout: 10_000});
  const deadline = JSON.parse(await readFile(join(state, 'patrol-deadline.json'), 'utf8'));
  const t0 = Date.now();
  const {stdout} = await run('node', [entry, '--synthetic', '--state-dir', state, '--interval-ms', '50', '--duration-ms', '86400000'], {env, timeout: 10_000});
  assert.ok(Date.now() - t0 < 5000); // expired original deadline stops at once
  assert.match(stdout, /expired-24h/);
  const again = JSON.parse(await readFile(join(state, 'patrol-deadline.json'), 'utf8'));
  assert.equal(again.stopAt, deadline.stopAt); // unchanged by restart
});
