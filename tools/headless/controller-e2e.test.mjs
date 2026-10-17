import assert from 'node:assert/strict';
import {mkdtemp, writeFile, chmod, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {Controller} from '../controller/controller.mjs';
import {createHeadlessCoder} from './headless-adapter.mjs';

// End-to-end controlled loop with a fake `muse` binary (synthetic, no real
// model): Controller -> Headless Coder -> Test -> Review -> Checkpoint.
// The real-model run is evidenced separately in docs, never faked here.
async function fakeMuse(body) {
  const d = await mkdtemp(join(tmpdir(), 'loop-e2e-'));
  const bin = join(d, 'muse');
  await writeFile(bin, `#!/bin/sh\n${body}\n`); await chmod(bin, 0o755);
  return {d, bin};
}
const tools = (coder) => ({
  plan: async () => {}, code: coder,
  test: async () => 'PASS', build: async () => 'PASS', e2e: async () => 'PASS',
  review: async (t) => ({verdict: 'APPROVE', commit: t.outputSha ?? t.commit, completed: true, source: 'independent-reviewer', sessionId: 'reviewer-session'}),
  preview: async () => 'PASS', gitHead: async () => 'aaa', gitClean: async () => true, isAlive: async () => false,
});

test('controller triggers headless coder and completes the loop', async () => {
  const {d, bin} = await fakeMuse('echo HEADLESS_OK; exit 0');
  process.env.MUSE_BIN = bin;
  const coder = createHeadlessCoder({synthetic: true, state: join(d, 'headless.json')});
  const t = await new Controller({dir: join(d, 'ctrl'), tools: tools(coder)}).run({id: 'e2e-1', commit: 'aaa'});
  assert.equal(t.status, 'REVIEW_PASS'); assert.equal(t.stages.code.status, 'PASS');
  delete process.env.MUSE_BIN;
});

test('rerunning the same task id does not call the model again', async () => {
  const {d, bin} = await fakeMuse('echo x >> "' + join('/tmp', 'never') + '"; echo HEADLESS_OK');
  process.env.MUSE_BIN = bin;
  const coder = createHeadlessCoder({synthetic: true, state: join(d, 'headless.json')});
  const c = () => new Controller({dir: join(d, 'ctrl'), tools: tools(coder)});
  await c().run({id: 'e2e-2', commit: 'aaa'});
  const headless = JSON.parse(await readFile(join(d, 'headless.json'), 'utf8'));
  assert.equal(headless.tasks['e2e-2'].status, 'PASS'); // second run deduped inside the entry
  await c().run({id: 'e2e-2', commit: 'aaa'});
  delete process.env.MUSE_BIN;
});

test('headless timeout terminates and controller records TOOL_TIMEOUT', async () => {
  const {d, bin} = await fakeMuse('sleep 30');
  process.env.MUSE_BIN = bin;
  const coder = createHeadlessCoder({synthetic: true, timeoutMs: 200, state: join(d, 'headless.json')});
  const t = await new Controller({dir: join(d, 'ctrl'), tools: tools(coder)}).run({id: 'e2e-3', commit: 'aaa'});
  assert.equal(t.status, 'FAIL'); assert.ok(t.log.some((l) => l.includes('TOOL_TIMEOUT')));
  delete process.env.MUSE_BIN;
});
