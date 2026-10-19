// Browser-level ISOLATED acceptance for the First Result cross-tab
// handoff bridge. Scope is deliberately narrow and labeled: it proves,
// in a real browser against the real derived Preview build, that
//   First Result -> confirm -> handoff stash -> opener-less new tab ->
//   pre-login fail-closed (no claim, no save call, no payload leak) ->
//   synthetic owner session -> bridge claim renders the confirmed
//   payload -> save issues the real RPC request shape -> readback
//   reconciliation feedback renders the returned version.
// It uses synthetic transport for /api/product-source and for the
// Supabase origin, so it does NOT prove hosted Auth, RLS, RPC
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

let browser, supabaseCalls = [];
try {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
  const context = await browser.newContext();
  const USER = '11111111-1111-4111-8111-111111111111';
  const ORG = '22222222-2222-4222-8222-222222222222';
  const VERSION = '33333333-3333-4333-8333-333333333333';
  let authed = false, saveBody = null;
  const savedRow = () => ({organization_id: ORG, id: VERSION, opportunity_id: saveBody.p_opportunity_id,
    version_number: 1, title: TITLE, draft_body: '候選 description', status: 'draft',
    created_at: new Date().toISOString(), first_result_request_id: saveBody.p_request_id,
    first_result_expected_version: saveBody.p_expected_version,
    first_result_request_digest: 'pg-jsonb-sha256:' + 'a'.repeat(64), first_result_payload: saveBody.p_payload});
  await context.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url());
    if (u.origin === SUPABASE_ORIGIN) {
      supabaseCalls.push(req.method() + ' ' + u.pathname);
      const json = (status, value) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(value)});
      if (!authed) return json(401, {message: 'unauthorized (isolated)'});
      if (u.pathname === '/auth/v1/user') return json(200, {id: USER, email: 'iso@example.invalid'});
      if (req.method() === 'POST' && u.pathname === '/rest/v1/rpc/save_url_result_draft') {
        saveBody = JSON.parse(req.postData() || '{}');
        return json(200, VERSION);
      }
      if (req.method() === 'POST' && u.pathname.startsWith('/rest/v1/rpc/')) return json(200, null);
      if (u.pathname === '/rest/v1/organization_members') return json(200, [{organization_id: ORG, role: 'owner'}]);
      if (u.pathname === '/rest/v1/organizations') return json(200, [{id: ORG, name: 'ISO ORG', business_model: 'ecommerce'}]);
      if (u.pathname === '/rest/v1/content_versions') return json(200, saveBody ? [savedRow()] : []);
      if (u.pathname.startsWith('/rest/v1/')) return json(200, []);
      return json(401, {message: 'unexpected (isolated)'});
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

  authed = true;
  // A fresh page is required: re-navigating the same document with only
  // a new fragment does not re-run the module boot that consumes it.
  const bridged2 = await context.newPage();
  await bridged2.goto(ORIGIN + '/workspace.html#access_token=iso-token&token_type=bearer&expires_in=3600', {waitUntil: 'domcontentloaded', timeout: 60000});
  await bridged2.waitForSelector('#workspace:not([hidden])', {timeout: 60000});
  step('synthetic owner session opens workspace', true);
  await bridged2.waitForFunction(t => (document.querySelector('#url-save-preview')?.textContent || '').includes(t), TITLE, {timeout: 30000});
  step('bridge claim renders confirmed payload after login', true);
  await bridged2.waitForFunction(() => localStorage.getItem('growth-os:pending-handoff:v1') === null, null, {timeout: 30000});
  step('stash consumed exactly once after claim', true);
  await bridged2.click("#save-url-result");
  await bridged2.waitForFunction(v => (document.querySelector('#url-save-feedback')?.textContent || '').includes('已保存第 1 版') && (document.querySelector('#url-save-feedback')?.textContent || '').includes(v), VERSION, {timeout: 60000});
  step('save readback feedback renders returned version', true);
  step('save RPC request shape (org, expected version, payload)', !!saveBody && saveBody.p_organization_id === ORG && saveBody.p_expected_version === 0 && saveBody.p_payload?.preview?.fields?.title?.suggested === TITLE);
} catch (error) {
  step('isolated acceptance aborted', false, String(error?.message || error).slice(0, 240));
  console.log('DIAG supabaseCalls=' + supabaseCalls.join(',').slice(0, 400));
} finally {
  await browser?.close().catch(() => {});
}
console.log(JSON.stringify({auto_handoff_isolated: results.every(Boolean) ? 'PASS' : 'FAIL', scope: 'browser bridge+claim+save wiring, synthetic transport; hosted persistence not proven'}));
process.exit(results.every(Boolean) ? 0 : 1);
