// Browser-level synthetic acceptance for First Result auto handoff on the
// deployed takeover-branch Preview. Proves: First Result -> confirm ->
// handoff -> (opener tab closed) -> email-link login in a NEW tab ->
// cross-tab bridge claim -> save -> REST readback in a fresh session.
// Runs only against the branch Preview origin and isolated Staging when
// explicitly confirmed via env; creates and cleans up synthetic data only.
//
// CONFIRM=AUTO_HANDOFF_ACCEPTANCE SUPABASE_SERVICE_KEY=... SUPABASE_ANON_KEY=... \
//   node supabase/tests/auto_handoff_acceptance.mjs
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';

const REF = 'vhzryhibmpvglzcmfnaa';
const ORIGIN = 'https://growth-os-preview-git-takeover-muse-primary-20261016-morning-ai.vercel.app';
const PRODUCT_URL = 'https://woo.novamodule.com/product/happy-ninja/';
if (process.env.CONFIRM !== 'AUTO_HANDOFF_ACCEPTANCE') { console.error('REFUSED: set CONFIRM=AUTO_HANDOFF_ACCEPTANCE'); process.exit(2); }
const service = process.env.SUPABASE_SERVICE_KEY, anon = process.env.SUPABASE_ANON_KEY;
if (!service || !anon) { console.error('REFUSED: SUPABASE_SERVICE_KEY and SUPABASE_ANON_KEY are required'); process.exit(2); }
const base = `https://${REF}.supabase.co`;
const password = 'Synthetic-' + randomUUID();
const email = `auto-handoff-${Date.now()}@example.invalid`;
const org = randomUUID();
let userId = null, versionId = null;
const results = [];
const step = (name, ok, detail = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' ' + detail : '')); };
async function call(path, {key = service, token, method = 'GET', body} = {}) {
  const r = await fetch(base + path, {method, headers: {apikey: key, Authorization: `Bearer ${token || key}`, 'Content-Type': 'application/json', Prefer: 'return=representation'}, body: body ? JSON.stringify(body) : undefined});
  const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch {}
  return {status: r.status, data, text};
}
async function magicLink() {
  const r = await call('/auth/v1/admin/generate_link', {method: 'POST', body: {type: 'magiclink', email, options: {redirectTo: ORIGIN + '/workspace.html'}}});
  const link = r.data?.action_link;
  if (!link) throw Error('generate_link failed HTTP ' + r.status);
  return link;
}
let browser;
try {
  const created = await call('/auth/v1/admin/users', {method: 'POST', body: {email, password, email_confirm: true}});
  userId = created.data?.id; if (!userId) throw Error('synthetic user creation failed HTTP ' + created.status);
  const spec = (await call('/rest/v1/')).data;
  const orgCols = Object.keys(spec.definitions?.organizations?.properties || {id: 1});
  await call('/rest/v1/organizations', {method: 'POST', body: Object.fromEntries(orgCols.filter(k => ['id', 'name'].includes(k)).map(k => [k, k === 'id' ? org : 'Auto handoff synthetic']))});
  await call('/rest/v1/organization_members', {method: 'POST', body: {organization_id: org, user_id: userId, role: 'owner'}});

  browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
  const context = await browser.newContext();
  const first = await context.newPage();
  await first.goto(ORIGIN + '/first-result.html', {waitUntil: 'domcontentloaded', timeout: 60000});
  await first.fill('#source-url', PRODUCT_URL);
  await first.click('#source-submit');
  await first.waitForSelector('#result-section:not([hidden])', {timeout: 120000});
  step('first result produced', true);
  for (const key of ['title', 'meta_description', 'description']) await first.check('#review-check-' + key);
  await first.click('#review-confirm');
  await first.waitForFunction(() => document.querySelector('#review-state')?.textContent.includes('已確認'), null, {timeout: 30000});
  step('owner confirmed current version', true);
  const [workspaceTab] = await Promise.all([context.waitForEvent('page', {timeout: 30000}), first.click('#handoff-result')]);
  await workspaceTab.waitForLoadState('domcontentloaded');
  step('workspace tab opened same-origin', workspaceTab.url().startsWith(ORIGIN));
  await workspaceTab.close();
  const bridged = await context.newPage();
  await bridged.goto(await magicLink(), {waitUntil: 'domcontentloaded', timeout: 60000});
  await bridged.waitForSelector('#workspace:not([hidden])', {timeout: 60000});
  step('synthetic login completed in opener-less tab', true);
  await bridged.waitForFunction(() => document.querySelector('#url-save-preview')?.textContent.includes('BIC00001'), null, {timeout: 60000});
  step('bridge auto-claimed handoff payload', true);
  await bridged.click('#save-url-result');
  await bridged.waitForFunction(() => /已保存|保存完成|待審草稿/.test(document.querySelector('#url-save-feedback')?.textContent || ''), null, {timeout: 60000});
  step('save confirmed in workspace UI', true);
  const signIn = await call('/auth/v1/token?grant_type=password', {key: anon, method: 'POST', body: {email, password}});
  const rows = await call(`/rest/v1/content_versions?organization_id=eq.${org}&select=id,title&order=created_at.desc&limit=1`, {key: anon, token: signIn.data?.access_token});
  versionId = rows.data?.[0]?.id || null;
  step('fresh-session REST readback', !!versionId && rows.data[0].title?.includes('BIC00001'), versionId || '');
} catch (error) {
  step('acceptance aborted', false, String(error?.message || error).slice(0, 240));
} finally {
  await browser?.close().catch(() => {});
  for (const table of ['content_reviews', 'content_versions', 'growth_opportunities', 'audit_events', 'organization_members']) await call(`/rest/v1/${table}?organization_id=eq.${org}`, {method: 'DELETE'}).catch(() => {});
  await call(`/rest/v1/organizations?id=eq.${org}`, {method: 'DELETE'}).catch(() => {});
  if (userId) await call(`/auth/v1/admin/users/${userId}`, {method: 'DELETE'}).catch(() => {});
  console.log('Cleanup attempted for synthetic org/user');
}
console.log(JSON.stringify({auto_handoff_acceptance: results.every(Boolean) ? 'PASS' : 'FAIL', version_id: versionId}));
process.exit(results.every(Boolean) ? 0 : 1);
