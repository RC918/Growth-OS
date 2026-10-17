import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, writeFile, chmod, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
const script = new URL('./headless-verify.mjs', import.meta.url).pathname;
async function fakeBin(body) {
  const d = await mkdtemp(join(tmpdir(), 'headless-fake-'));
  const bin = join(d, 'muse');
  await writeFile(bin, `#!/bin/sh\n${body}\n`); await chmod(bin, 0o755);
  return {bin, state: join(d, 'checkpoint.json')};
}
const exec = (bin, state, extra = []) => run('node', [script, '--synthetic', '--state', state, ...extra], {env: {...process.env, MUSE_BIN: bin}});

test('synthetic normal completion records checkpoint with exit code and elapsed', async () => {
  const {bin, state} = await fakeBin('echo HEADLESS_OK; exit 0');
  const {stdout} = await exec(bin, state);
  const r = JSON.parse(stdout.trim());
  assert.equal(r.status, 'PASS'); assert.equal(r.exitCode, 0); assert.ok(r.elapsedMs >= 0); assert.equal(r.childGone, true);
  const saved = JSON.parse(await readFile(state, 'utf8'));
  assert.equal(saved.tasks['headless-readonly-001'].status, 'PASS');
});

test('same task never calls the model twice', async () => {
  const {bin, state} = await fakeBin('echo called >> "$FAKE_COUNT"; echo HEADLESS_OK');
  const env = {...process.env, FAKE_COUNT: state + '.count'};
  await exec(bin, state);
  const {stdout} = await run('node', [script, '--synthetic', '--state', state], {env: {...env, MUSE_BIN: bin}});
  assert.equal(JSON.parse(stdout.trim()).deduped, true);
});

test('timeout really terminates the child process', async () => {
  const {bin, state} = await fakeBin('sleep 30');
  await assert.rejects(exec(bin, state, ['--timeout-ms', '200']));
  const saved = JSON.parse(await readFile(state, 'utf8'));
  assert.equal(saved.tasks['headless-readonly-001'].status, 'TIMEOUT');
});
