// Browser-level ISOLATED acceptance for the First Result cross-tab
// handoff bridge. Scope is deliberately narrow and labeled: it proves,
// in a real browser against the real derived Preview build, that
//   First Result -> confirm -> handoff stash -> opener-less new tab ->
//   pre-login fail-closed (no claim, no save call, no payload leak).
// It uses synthetic transport for /api/product-source and for the
// Supabase origin (401), so it does NOT prove hosted Auth, RLS, RPC
// persistence, or readback; those stay proven by the hosted Part C
// acceptance and the Owner human acceptance. Run in CI (Chromium).
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {build} from '../../delivery/web-preview/build.mjs';
import {applyHandoffBridge} from '../../delivery/web-preview/handoff-bridge.mjs';
import {applyReviewFlag} from '../../delivery/web-preview/review-flag.mjs';

const ORIGIN = 'http://127.0.0.1:4321';
const SUPABASE_ORIGIN = 'https://vhzryhibmpvglzcmfnaa.supabase.co';
const TITLE = 'ISO-HANDOFF-001';
const fields = ['title', 'meta_description', 'description'];
const fixture = () => ({
  snapshot: {id: 'iso-a', version: 'source-a', original_url: 'https://example.invalid/iso', final_url: 'https://example.invalid/iso', citations: []},
  facts: {}, inferences: [], missing: [],
  preview: {source_snapshot_id: 'iso-a', source_version: 'source-a',
    fields: Object.fromEntries(fields.map(k => [k, {original: '原文 ' + k, suggested: k === 'title' ? TITLE : '候選 ' + k, reason: '隔離測試來源', citations: ['s1']}])),
    pending_confirmation: []},
});

const results = [];
const step = (name, ok, detail = '') => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' ' + detail : '')); };

await build();
await applyHandoffBridge(new URL('../../delivery/web-preview/dist/', import.meta.url));
await applyReviewFlag(new URL('../../delivery/web-preview/dist/', import.meta.url), {});

let browser;
try {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
  const context = await browser.newContext();
  const supabaseCalls = [];
  await context.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url());
    if (u.origin === SUPABASE_ORIGIN) {
      supabaseCalls.push(req.method() + ' ' + u.pathname);
      return route.fulfill({status: 401, contentType: 'application/json', body: '{"message":"unauthorized (isolated)"}'});
    }
    assert.equal(u.origin, ORIGIN, 'unexpected origin ' + u.origin);
    if (u.pathname === '/api/product-source') {
      assert.equal(req.method(), 'POST');
      return route.fulfill({contentType: 'application/json', body: JSON.stringify(fixture())});
    }
    assert.equal(req.method(), 'GET');
    const name = u.pathname.slice(1) || 'index.html';
    assert.ok(/^[a-z0-9-]+\.(html|mjs|css|json)$/.test(name), 'unexpected path ' + u.pathname);
    const body = await readFile(new URL('../../delivery/web-preview/dist/' + name, import.meta.url));
    return route.fulfill({contentType: name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : 'text/html', body});
  });

  const first = await context.newPage();
  await first.goto(ORIGIN + '/first-result.html', {waitUntil: 'domcontentloaded', timeout: 60000});
  await first.fill('#source-url', 'https://example.invalid/iso');
  await first.click('#source-submit');
  await first.waitForSelector('#result-section:not([hidden])', {timeout: 60000});
  step('first result produced (isolated fixture)', true);
  for (const key of fields) await first.check('#review-check-' + key);
  await first.click('#review-confirm');
  await first.waitForFunction(() => document.querySelector('#review-state')?.textContent.includes('已確認'), null, {timeout: 30000});
  step('owner confirmed current version', true);

  const [popup] = await Promise.all([context.waitForEvent('page', {timeout: 30000}), first.click('#handoff-result')]);
  await popup.waitForLoadState('domcontentloaded');
  step('workspace tab opened same-origin', popup.url().startsWith(ORIGIN + '/workspace.html'), popup.url());
  await popup.close();

  const stash = await first.evaluate(() => JSON.parse(localStorage.getItem('growth-os:pending-handoff:v1') || 'null'));
  step('bridge stash written with one-time nonce', !!stash && typeof stash.nonce === 'string' && stash.nonce.length >= 8 && Number.isFinite(stash.saved_at) && Date.now() - stash.saved_at < 30 * 60 * 1000);
  step('stash payload carries confirmed fixture', stash?.payload?.preview?.fields?.title?.suggested === TITLE);

  const bridged = await context.newPage();
  await bridged.goto(ORIGIN + '/workspace.html', {waitUntil: 'domcontentloaded', timeout: 60000});
  await bridged.waitForSelector('#sign-in:not([hidden])', {timeout: 60000});
  step('opener-less tab lands on login (no session)', true);
  step('workspace stays hidden pre-login', await bridged.evaluate(() => document.querySelector('#workspace')?.hidden === true));
  const stashAfter = await bridged.evaluate(() => JSON.parse(localStorage.getItem('growth-os:pending-handoff:v1') || 'null'));
  step('stash not claimed or consumed pre-login', stashAfter?.nonce === stash.nonce);
  step('no save RPC attempted pre-login', !supabaseCalls.some(c => c.includes('save_url_result_draft')), supabaseCalls.join(',').slice(0, 160));
  step('payload not leaked into save preview pre-login', !(await bridged.evaluate(() => document.querySelector('#url-save-preview')?.textContent || '')).includes(TITLE));
} catch (error) {
  step('isolated acceptance aborted', false, String(error?.message || error).slice(0, 240));
} finally {
  await browser?.close().catch(() => {});
}
console.log(JSON.stringify({auto_handoff_isolated: results.every(Boolean) ? 'PASS' : 'FAIL', scope: 'browser bridge layer, synthetic transport; hosted persistence not proven'}));
process.exit(results.every(Boolean) ? 0 : 1);
