import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import test from 'node:test';
import {applyReviewFlag} from './review-flag.mjs';

const CONFIG = 'export const urlSaveEnabled=true;\nexport const urlReviewEnabled=false;\n';

async function fixture(content = CONFIG) {
  const dir = await mkdtemp(tmpdir() + '/review-flag-');
  await writeFile(new URL('url-result-config.mjs', `file://${dir}/`), content);
  return new URL(`file://${dir}/`);
}

test('review flag defaults off and only flips when explicitly enabled', async () => {
  const off = await fixture();
  try {
    assert.deepEqual(await applyReviewFlag(off, {}), {review_ui: 'disabled'});
    assert.deepEqual(await applyReviewFlag(off, {REVIEW_UI_ENABLED: 'yes'}), {review_ui: 'disabled'});
    assert.equal(await readFile(new URL('url-result-config.mjs', off), 'utf8'), CONFIG);
    assert.deepEqual(await applyReviewFlag(off, {REVIEW_UI_ENABLED: 'true'}), {review_ui: 'enabled'});
    const enabled = await readFile(new URL('url-result-config.mjs', off), 'utf8');
    assert.match(enabled, /export const urlReviewEnabled=true;/);
    assert.match(enabled, /export const urlSaveEnabled=true;/);
    assert.deepEqual(await applyReviewFlag(off, {REVIEW_UI_ENABLED: 'true'}), {review_ui: 'already_enabled'});
  } finally { await rm(new URL('.', off).pathname, {recursive: true, force: true}); }
});

test('review flag fails loud on anchor drift and never touches frozen sources', async () => {
  const drifted = await fixture('export const urlReviewEnabled=void 0;\n');
  try {
    await assert.rejects(applyReviewFlag(drifted, {REVIEW_UI_ENABLED: 'true'}), /anchor drift/);
  } finally { await rm(new URL('.', drifted).pathname, {recursive: true, force: true}); }
  const source = await readFile(new URL('review-flag.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /access_token|service_role|password/i);
});
