import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import test from 'node:test';
import {applyHandoffBridge} from './handoff-bridge.mjs';

const root = new URL('../../', import.meta.url);
const sha = async path => createHash('sha256').update(await readFile(new URL(path, root))).digest('hex');

test('bridge patches derived dist only, is idempotent, and fails loud on drift', async () => {
  execFileSync(process.execPath, ['delivery/web-preview/build.mjs'], {cwd: new URL('.', root).pathname, stdio: 'pipe'});
  const frozenBefore = await sha('apps/web/first-result-handoff.mjs');
  const dist = new URL('delivery/web-preview/dist/', root);
  const work = await mkdtemp(tmpdir() + '/handoff-bridge-');
  try {
    await cp(dist, work, {recursive: true});
    const workUrl = new URL(`file://${work}/`);
    const first = await applyHandoffBridge(workUrl);
    assert.equal(first.applied, true);
    const handoff = await readFile(new URL('first-result-handoff.mjs', workUrl), 'utf8');
    const save = await readFile(new URL('url-result-save.mjs', workUrl), 'utf8');
    assert.match(handoff, /localStorage\.setItem\('growth-os:pending-handoff:v1'/);
    assert.match(handoff, /localStorage\.removeItem\('growth-os:pending-handoff:v1'\)/);
    assert.match(save, /localStorage\.getItem\('growth-os:pending-handoff:v1'\)/);
    assert.match(save, /accept\(stash\.payload,stash\.nonce,own\)/);
    assert.match(save, /1800000/);
    const second = await applyHandoffBridge(workUrl);
    assert.deepEqual(second, {applied: false, reason: 'already patched'});
    assert.equal(await sha('apps/web/first-result-handoff.mjs'), frozenBefore);
    const driftWork = await mkdtemp(tmpdir() + '/handoff-bridge-drift-');
    try {
      await cp(dist, driftWork, {recursive: true});
      const driftUrl = new URL(`file://${driftWork}/`);
      const drifted = (await readFile(new URL('url-result-save.mjs', driftUrl), 'utf8')).replace("if(trial){void probeTrial()", 'if(trial){void drifted()');
      await writeFile(new URL('url-result-save.mjs', driftUrl), drifted);
      await assert.rejects(applyHandoffBridge(driftUrl), /anchor drift/);
    } finally {
      await rm(driftWork, {recursive: true, force: true});
    }
  } finally {
    await rm(work, {recursive: true, force: true});
  }
});

test('bridge never stashes credentials and keeps origin checks intact', async () => {
  const source = await readFile(new URL('handoff-bridge.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /access_token|service_role|password/i);
  assert.match(source, /accept\(stash\.payload,stash\.nonce,own\)/);
});
