import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, writeFile, chmod, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';
const run = promisify(execFile);
test('one-shot watchdog runs one synthetic task and never self-approves', async () => {
  const d = await mkdtemp(join(tmpdir(), 'wd-once-'));
  const bin = join(d, 'muse');
  await writeFile(bin, '#!/bin/sh\necho HEADLESS_OK\n'); await chmod(bin, 0o755);
  const entry = new URL('./watchdog-once.mjs', import.meta.url).pathname;
  // Synthetic state lives only in a temp dir; the real .watchdog-state is never touched.
  const stateDir = join(d, 'state');
  const {stdout} = await run('node', [entry, '--synthetic', '--state-dir', stateDir], {env: {...process.env, MUSE_BIN: bin}}).catch((e) => ({stdout: e.stdout})); // exit 1 by design until external review
  const r = JSON.parse(stdout.trim().split('\n').at(-1));
  assert.equal(r.task, 'watchdog-synthetic-001');
  assert.equal(r.stages.code, 'PASS');
  assert.equal(r.status, 'REVIEW_BLOCKED'); // independent reviewer is external by design
  const saved = JSON.parse(await readFile(join(stateDir, 'state.json'), 'utf8'));
  assert.equal(saved.tasks['watchdog-synthetic-001@controlled-trial'].status, 'REVIEW_BLOCKED');
});
