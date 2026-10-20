// Browser-level NATIVE-STACK acceptance for the First Result cross-tab
// handoff. It extends auto_handoff_isolated.mjs (synthetic transport)
// to a real ephemeral Supabase stack started inside the CI job:
// PostgreSQL 17 + GoTrue + PostgREST (pinned images, internal Docker
// network, no published ports, tmpfs storage, removed on exit).
//
// Flow proven here, in a real browser against the real derived
// Preview build, with NO application-code changes:
//   First Result -> confirm -> handoff stash -> opener-less new tab ->
//   pre-login fail-closed (stash unconsumed, zero rows in real DB) ->
//   real GoTrue password-grant session (the Magic Link equivalent for
//   tests: GoTrue itself issues the JWT; the browser receives it via
//   the same #access_token fragment a magic-link redirect produces) ->
//   bridge claim renders -> save -> real save_url_result_draft RPC
//   persists a row in PostgreSQL under real RLS -> fresh GoTrue login
//   in a new browser context reads the same version back -> viewer
//   session is read-only (save RPC 403) -> foreign tenant sees zero
//   rows and save RPC 403.
//
// Honest scope limits: the browser still targets the hardcoded
// staging-shaped origin; Playwright rewrites only the transport of
// that origin to the ephemeral stack (and swaps the publishable
// apikey header for the stack's own anon JWT). Application code,
// Auth, RLS, RPC bodies, SHA and digest checks are the real ones.
// This is NOT hosted Staging acceptance: hosted Auth/RLS/RPC
// persistence remains proven by Part C 9/9 and the Owner human
// acceptance, and the hosted browser E2E stays ENV_BLOCKED.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync, spawn} from 'node:child_process';
import {randomBytes, randomUUID, createHmac, createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {build} from '../../delivery/web-preview/build.mjs';
import {applyHandoffBridge} from '../../delivery/web-preview/handoff-bridge.mjs';
import {applyReviewFlag} from '../../delivery/web-preview/review-flag.mjs';
import {compose} from '../../prototype/internal-rc/deploy/compose.mjs';
import {nativeServiceEnv} from '../../prototype/internal-rc/deploy/native-env.mjs';
import {schema} from '../../prototype/internal-rc/deploy/schema.mjs';
import {ids} from '../../supabase/drafts/first_result_save/fixtures.mjs';

process.chdir(fileURLToPath(new URL('../../', import.meta.url))); // schema() reads supabase/migrations relative to repo root

const results = [];
const step = (name, ok, detail = '') => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' ' + String(detail).slice(0, 200) : '')); };
const LANDY = process.env.HANDOFF_VARIANT === 'landyachtz';
const TITLE = LANDY ? 'The Clark' : 'NATIVE-HANDOFF-001';
const SOURCE_URL = LANDY
  ? 'https://landyachtz.com/shop/all/skate/boards/all-skate-boards/the-clark/'
  : 'https://example.invalid/native';
const ORIGIN = 'http://127.0.0.1:4321';
const SUPABASE_ORIGIN = 'https://vhzryhibmpvglzcmfnaa.supabase.co';
const fields = ['title', 'meta_description', 'description'];

// Same fully valid producer-shaped fixture as the isolated acceptance.
const SNAP_ID = '55555555-5555-4555-8555-555555555555';
const fixture = () => {
  const html = `<!doctype html><html><head><title>${TITLE}</title></head><body><h1>${TITLE}</h1><p>NATIVE product description</p></body></html>`;
  const bytes = Buffer.from(html, 'utf8');
  const version = createHash('sha256').update(bytes).digest('hex');
  const fact = (value, scoped = false) => scoped
    ? {kind: 'fact', verification: 'source_asserted', value, citations: ['s1'], product_scope: {locator: 'h1', name_locator: 'h1', product_name: TITLE}}
    : {kind: 'fact', verification: 'source_asserted', value, citations: ['s1']};
  const facts = {product_name: fact(TITLE), title: fact(TITLE), meta_description: fact('NATIVE meta'),
    description: fact('NATIVE product description', true), features: [fact('NATIVE feature', true)], use: fact('NATIVE use')};
  const missing = ['specifications', 'price', 'certifications', 'performance', 'comparisons', 'guarantees'];
  const field = (key, suggested) => ({original: facts[key].value, suggested, reason: '隔離測試來源', citations: ['s1']});
  return {
    snapshot: {schema_version: 1, id: SNAP_ID, version, original_url: 'https://example.invalid/native',
      final_url: 'https://example.invalid/native', fetched_at: new Date().toISOString(),
      content_base64: bytes.toString('base64'), content_fingerprint: 'sha256:' + version,
      encoding: 'utf-8-with-replacement', html,
      citations: [{id: 's1', snapshot_id: SNAP_ID, source_version: version, url: 'https://example.invalid/native', locator: 'h1', quote: TITLE}],
      limitations: ['NATIVE limitation']},
    page_type: 'product', extraction: {method: 'explicit_product_microdata', limitations: ['NATIVE limitation']},
    facts, inferences: [{kind: 'inference', value: 'NATIVE inference', basis: 'NATIVE basis', citations: ['s1']}], missing,
    preview: {source_snapshot_id: SNAP_ID, source_version: version, published: false, generation: 'extractive_rules',
      status: 'awaiting_review',
      pending_confirmation: ['Confirm source assertions and suitability before applying.', ...missing],
      fields: {title: field('title', TITLE), meta_description: field('meta_description', '候選 meta_description'), description: field('description', '候選 description')}},
  };
};

// ---- Ephemeral native stack (pattern reused from
// prototype/internal-rc/native-http-regression.mjs) ----
const run = 'growth-handoff-native-' + randomUUID();
const network = run + '-net';
const label = 'growth.native_handoff';
const names = ['db', 'auth', 'rest'].map(n => run + '-' + n);
const deadline = Date.now() + 9 * 60 * 1000;
const redactions = new Set();
const hide = v => (redactions.add(v), v);
const dbPassword = hide(randomBytes(32).toString('hex'));
const jwtSecret = hide(randomBytes(40).toString('hex'));
const env = nativeServiceEnv({db: dbPassword, jwt: jwtSecret});
const images = (await compose()).services;
let stage = 'preflight', authOrigin, restOrigin;
const bounded = () => { if (Date.now() >= deadline) throw Error('Native handoff deadline expired at ' + stage); };
function docker(args, input, environment) {
  try {
    return execFileSync('docker', args, {input, env: environment ? {...process.env, ...environment} : process.env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000}).trim();
  } catch (e) {
    let detail = String(e.stderr ?? '');
    for (const v of redactions) if (v) detail = detail.replaceAll(v, '[REDACTED]');
    throw Error('Docker ' + args[0] + ' failed in ' + stage + ': ' + detail.slice(-800));
  }
}
const sql = body => docker(['exec', '-i', '--user', 'postgres', names[0], 'psql', '-XAtq', '-w', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], body);
async function wait(check, message) { for (let i = 0; i < 120; i++) { bounded(); try { if (await check()) return; } catch {} await new Promise(r => setTimeout(r, 250)); } throw Error(message); }
function start(service, extra = []) {
  bounded();
  const environment = Object.fromEntries(env[service === 'db' ? 'pg' : service].trim().split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  return docker(['run', '-d', '--rm', '--pull=never', '--name', run + '-' + service, '--label', label + '=' + run, '--network', network,
    ...(service === 'db' ? ['--network-alias', 'db'] : ['--read-only', '--tmpfs', '/tmp']), ...extra,
    ...Object.keys(environment).flatMap(k => ['--env', k]), images[service].image], undefined, environment);
}
function origin(service, port) {
  const name = run + '-' + service;
  const ip = docker(['inspect', '-f', '{{with index .NetworkSettings.Networks "' + network + '"}}{{.IPAddress}}{{end}}', name]);
  assert.match(ip, /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/);
  return 'http://' + ip + ':' + port;
}
const signJwt = claims => {
  const b64 = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  const unsigned = b64({alg: 'HS256', typ: 'JWT'}) + '.' + b64(claims);
  return hide(unsigned + '.' + createHmac('sha256', jwtSecret).update(unsigned).digest('base64url'));
};
const adminToken = () => signJwt({role: 'service_role', aud: 'authenticated', exp: Math.floor(deadline / 1000)});
const anonToken = () => signJwt({role: 'anon', aud: 'anon', exp: Math.floor(deadline / 1000)});

let browser, landyServer;
const credentials = {};
async function stackCall(originUrl, path, {method = 'GET', token, body} = {}) {
  bounded();
  const r = await fetch(originUrl + path, {method, redirect: 'error',
    headers: {...(token ? {authorization: 'Bearer ' + token} : {}), ...(body ? {'content-type': 'application/json'} : {})},
    ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(8000)});
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  return {status: r.status, data};
}
async function login(actor) {
  const r = await stackCall(authOrigin, '/token?grant_type=password', {method: 'POST', body: credentials[actor]});
  assert.equal(r.status, 200, 'GoTrue password login ' + actor);
  hide(r.data.access_token); hide(r.data.refresh_token);
  assert.equal(r.data.user.id, ids[actor], 'GoTrue user id ' + actor);
  return r.data;
}
const restCall = (path, token, opts = {}) => stackCall(restOrigin, path, {token, ...opts});
const versionCount = () => Number(sql('select count(*) from public.content_versions;'));

try {
  stage = 'stack startup';
  docker(['network', 'create', '--internal', '--label', label + '=' + run, network]);
  start('db', ['--tmpfs', '/var/lib/postgresql/data', '--tmpfs', '/var/run/postgresql']);
  await wait(() => { docker(['exec', names[0], 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); return true; }, 'PG readiness failed');
  sql(await readFile(new URL('../../prototype/internal-rc/deploy/roles.sql', import.meta.url), 'utf8'));
  start('auth'); authOrigin = origin('auth', 9999);
  start('rest'); restOrigin = origin('rest', 3000);
  await wait(async () => (await stackCall(authOrigin, '/health')).status === 200, 'GoTrue startup failed');
  sql(await readFile(new URL('../../prototype/internal-rc/deploy/auth-ready.sql', import.meta.url), 'utf8'));
  step('ephemeral PG/GoTrue/PostgREST stack up (internal network, tmpfs)', true);

  stage = 'identities';
  for (const actor of ['owner', 'viewer', 'foreign']) {
    credentials[actor] = {email: actor + '@handoff.example.invalid', password: hide(randomBytes(32).toString('hex'))};
    const u = await stackCall(authOrigin, '/admin/users', {method: 'POST', token: adminToken(), body: {id: ids[actor], ...credentials[actor], email_confirm: true}});
    assert.equal(u.status, 200, 'create ' + actor); assert.equal(u.data.id, ids[actor]);
  }
  const ownerSession = await login('owner');
  step('real GoTrue identities created and owner session issued', true);

  stage = 'business schema';
  sql(await schema());
  await wait(async () => (await restCall('/content_versions?select=id', ownerSession.access_token)).status === 200, 'PostgREST schema reload failed');
  step('business schema applied and PostgREST reloaded', true);
  assert.equal(versionCount(), 0);

  stage = 'preview build';
  await build();
  await applyHandoffBridge(new URL('../../delivery/web-preview/dist/', import.meta.url));
  await applyReviewFlag(new URL('../../delivery/web-preview/dist/', import.meta.url), {REVIEW_UI_ENABLED: 'true'});
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
  if (LANDY) {
    landyServer = spawn('python3', ['supabase/tests/landy_fixture_server.py'], {cwd: fileURLToPath(new URL('../../', import.meta.url)), stdio: 'ignore'});
    await wait(async () => {
      const r = await fetch('http://127.0.0.1:18765/', {method: 'POST', body: '{}', signal: AbortSignal.timeout(2000)}).catch(() => null);
      return r !== null;
    }, 'Landyachtz fixture server failed to start');
    step('real adapter pipeline serves Landyachtz fixture', true);
  }

  // Transport rewrite: only the hardcoded Supabase origin is forwarded
  // to the ephemeral stack. Everything else behaves as in production.
  async function installRoutes(context) {
    await context.route('**/*', async route => {
      const req = route.request(), u = new URL(req.url());
      if (u.origin === SUPABASE_ORIGIN) {
        const isAuth = u.pathname.startsWith('/auth/v1');
        const target = (isAuth ? authOrigin : restOrigin) + u.pathname.replace(/^\/(auth|rest)\/v1/, '') + u.search;
        const headers = {};
        for (const [k, v] of Object.entries(req.headers())) { if (!['host', 'content-length'].includes(k.toLowerCase())) headers[k] = v; }
        headers.apikey = anonToken(); // stack's own anon key; user JWT passes through untouched
        const resp = await fetch(target, {method: req.method(), headers, ...(req.postDataBuffer() ? {body: req.postDataBuffer()} : {}), signal: AbortSignal.timeout(15000)});
        const respHeaders = {};
        resp.headers.forEach((v, k) => { if (!['content-length', 'content-encoding'].includes(k.toLowerCase())) respHeaders[k] = v; });
        if (!respHeaders['access-control-allow-origin']) respHeaders['access-control-allow-origin'] = '*';
        return route.fulfill({status: resp.status, headers: respHeaders, body: Buffer.from(await resp.arrayBuffer())});
      }
      assert.equal(u.origin, ORIGIN, 'unexpected origin ' + u.origin);
      if (u.pathname === '/api/product-source') {
        assert.equal(req.method(), 'POST');
        if (LANDY) {
          const resp = await fetch('http://127.0.0.1:18765/', {method: 'POST',
            headers: {'content-type': 'application/json'}, body: req.postDataBuffer() || Buffer.from('{}'),
            signal: AbortSignal.timeout(30000)});
          return route.fulfill({status: resp.status, contentType: 'application/json', body: Buffer.from(await resp.arrayBuffer())});
        }
        return route.fulfill({contentType: 'application/json', body: JSON.stringify(fixture())});
      }
      assert.equal(req.method(), 'GET');
      const name = u.pathname.slice(1) || 'index.html';
      assert.ok(/^[a-z0-9-]+\.(html|mjs|css|json)$/.test(name), 'unexpected path ' + u.pathname);
      const body = await readFile(new URL('../../delivery/web-preview/dist/' + name, import.meta.url));
      return route.fulfill({contentType: name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : 'text/html', body});
    });
  }
  const fragment = s => '#access_token=' + s.access_token + '&refresh_token=' + s.refresh_token + '&token_type=bearer&expires_in=300';

  stage = 'browser handoff';
  const context = await browser.newContext();
  await installRoutes(context);
  const first = await context.newPage();
  await first.goto(ORIGIN + '/first-result.html', {waitUntil: 'domcontentloaded', timeout: 60000});
  await first.fill('#source-url', SOURCE_URL);
  await first.click('#source-submit');
  await first.waitForSelector('#result-section:not([hidden])', {timeout: 60000});
  step('first result produced (native fixture)', true);
  for (const key of fields) await first.check('#review-check-' + key);
  await first.click('#review-confirm');
  await first.waitForFunction(() => document.querySelector('#review-state')?.textContent.includes('已確認'), null, {timeout: 30000});
  step('owner confirmed current version', true);
  const [popup] = await Promise.all([context.waitForEvent('page', {timeout: 30000}), first.click('#handoff-result')]);
  await popup.waitForLoadState('domcontentloaded');
  step('workspace tab opened same-origin', popup.url().startsWith(ORIGIN + '/workspace.html'), popup.url());
  await popup.close();
  const stash = await first.evaluate(() => JSON.parse(localStorage.getItem('growth-os:pending-handoff:v1') || 'null'));
  step('bridge stash written with one-time nonce', !!stash && stash.payload?.preview?.fields?.title?.suggested === TITLE);
  if (LANDY) step('adapter provenance is declared_product_dom', stash?.payload?.extraction?.method === 'declared_product_dom', stash?.payload?.extraction?.method);

  const bridged = await context.newPage();
  await bridged.goto(ORIGIN + '/workspace.html', {waitUntil: 'domcontentloaded', timeout: 60000});
  await bridged.waitForSelector('#sign-in:not([hidden])', {timeout: 60000});
  step('opener-less tab lands on login (no session)', true);
  const stashAfter = await bridged.evaluate(() => JSON.parse(localStorage.getItem('growth-os:pending-handoff:v1') || 'null'));
  step('stash not claimed or consumed pre-login', stashAfter?.nonce === stash.nonce);
  step('no save reached real DB pre-login', versionCount() === 0);

  const claimed = await context.newPage();
  await claimed.goto(ORIGIN + '/workspace.html' + fragment(ownerSession), {waitUntil: 'domcontentloaded', timeout: 60000});
  await claimed.waitForSelector('#workspace:not([hidden])', {timeout: 60000});
  step('real GoTrue session opens workspace', true);
  await claimed.waitForFunction(t => (document.querySelector('#url-save-preview')?.textContent || '').includes(t), TITLE, {timeout: 30000});
  step('bridge claim renders confirmed payload after real login', true);
  await claimed.waitForFunction(() => localStorage.getItem('growth-os:pending-handoff:v1') === null, null, {timeout: 30000});
  step('stash consumed exactly once after claim', true);

  stage = 'real save';
  await claimed.click('#save-url-result');
  try {
    await claimed.waitForFunction(() => /已保存第 1 版/.test(document.querySelector('#url-save-feedback')?.textContent || ''), null, {timeout: 60000});
  } catch (e) {
    const fb = await claimed.evaluate(() => document.querySelector('#url-save-feedback')?.textContent || '').catch(() => '');
    step('save feedback renders persisted version', false, 'save feedback after timeout: ' + fb);
    throw e;
  }
  const feedback = await claimed.evaluate(() => document.querySelector('#url-save-feedback')?.textContent || '');
  const versionId = feedback.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
  step('save feedback renders persisted version', !!versionId, feedback);
  const saved = await restCall('/content_versions?select=*&id=eq.' + versionId, ownerSession.access_token);
  step('real DB readback: one row, payload title matches',
    saved.status === 200 && saved.data.length === 1 && saved.data[0].first_result_payload?.preview?.fields?.title?.suggested === TITLE);
  step('real DB row count is exactly one', versionCount() === 1);

  stage = 'browser review persistence';
  const reviewSection = claimed.locator('.typed-version[data-version-id="' + versionId + '"]');
  await reviewSection.locator('summary').click();
  await reviewSection.locator('.url-review-confirm').waitFor({timeout: 30000});
  const checkKeys = await reviewSection.locator('[data-review-check]').evaluateAll(els => els.map(e => e.dataset.reviewCheck));
  step('review panel offers all five fact checks', ['title', 'meta_description', 'description', 'source', 'blocking_facts_clear'].every(k => checkKeys.includes(k)), checkKeys.join(','));
  for (const box of await reviewSection.locator('[data-review-check]').all()) await box.check();
  await reviewSection.locator('.url-review-confirm').click();
  await reviewSection.locator('.url-review-status').getByText(/已確認/).waitFor({timeout: 30000}).catch(() => {});
  const reviewRows = await restCall('/content_reviews?select=*&version_id=eq.' + versionId, ownerSession.access_token);
  step('real DB review readback: one approved review for saved version',
    reviewRows.status === 200 && reviewRows.data.length === 1 && reviewRows.data[0].decision === 'approved');
  step('review status renders in browser', /已確認|確認/.test(await reviewSection.locator('.url-review-status').textContent() || ''));

  stage = 'publish preview and measurement preparation';
  await reviewSection.locator('.publish-preview-read').click();
  await reviewSection.locator('.publish-preview-status').getByText(/預覽已讀取 · 實際發布仍被阻擋 · 未發布/).waitFor({timeout: 30000});
  step('publish preview loads for reviewed version and stays unpublished', true);
  step('publish preview shows exact-version confirmation (not publish authorization)',
    /此版本已有確認/.test(await reviewSection.locator('.publish-preview-body').textContent() || ''));
  await reviewSection.locator('.measurement-read').click();
  await reviewSection.locator('.measurement-status').getByText(/量測準備已讀取/).waitFor({timeout: 30000});
  const measurementText = await reviewSection.locator('.measurement-body').textContent() || '';
  step('measurement preparation reports baseline unknown (not zero)',
    measurementText.includes('基線未知') && measurementText.includes('不是零'));
  step('no real publication or measurement rows created by previews',
    Number(sql('select count(*) from public.content_reviews;')) === 1 && versionCount() === 1);

  stage = 'new session readback';
  const freshSession = await login('owner');
  const freshContext = await browser.newContext();
  await installRoutes(freshContext);
  const freshPage = await freshContext.newPage();
  await freshPage.goto(ORIGIN + '/workspace.html' + fragment(freshSession), {waitUntil: 'domcontentloaded', timeout: 60000});
  await freshPage.waitForSelector('#workspace:not([hidden])', {timeout: 60000});
  step('fresh GoTrue session opens workspace in new browser context', true);
  // The dashboard does not expand version lists by default, so the
  // fresh-session readback is proven at the data layer below with the
  // fresh token; here we assert the new session is accepted in the UI.
  step('fresh session accepted by workspace UI (no login wall)',
    await freshPage.evaluate(() => document.querySelector('#sign-in')?.hidden === true));
  const freshRows = await restCall('/content_versions?select=id&id=eq.' + versionId, freshSession.access_token);
  step('fresh session API readback returns same version', freshRows.status === 200 && freshRows.data.length === 1);
  const freshReviews = await restCall('/content_reviews?select=id&version_id=eq.' + versionId, freshSession.access_token);
  step('fresh session API readback returns the review', freshReviews.status === 200 && freshReviews.data.length === 1);

  stage = 'tenant denials';
  const viewerSession = await login('viewer');
  const viewerRows = await restCall('/content_versions?select=id&organization_id=eq.' + ids.org, viewerSession.access_token);
  step('viewer can read org versions (read-only)', viewerRows.status === 200 && viewerRows.data.length === 1);
  const viewerSave = await restCall('/rpc/save_url_result_draft', viewerSession.access_token, {method: 'POST', body: {
    p_organization_id: ids.org, p_opportunity_id: randomUUID(), p_request_id: randomUUID(), p_expected_version: 1, p_payload: fixture()}});
  step('viewer save RPC denied by real RLS/RPC', viewerSave.status === 403, 'HTTP ' + viewerSave.status);
  const viewerReview = await restCall('/rpc/review_url_result', viewerSession.access_token, {method: 'POST', body: {
    p_organization_id: ids.org, p_version_id: versionId, p_request_id: randomUUID(),
    p_source_digest: saved.data[0].first_result_payload.snapshot.content_fingerprint,
    p_content_digest: saved.data[0].first_result_payload.review.content_digest,
    p_version_digest: saved.data[0].first_result_request_digest,
    p_checks: {title: true, meta_description: true, description: true, source: true, blocking_facts_clear: true}}});
  step('viewer review RPC denied by real RLS/RPC', viewerReview.status === 403, 'HTTP ' + viewerReview.status);
  const foreignSession = await login('foreign');
  const foreignRows = await restCall('/content_versions?select=id&organization_id=eq.' + ids.org, foreignSession.access_token);
  step('foreign tenant reads zero org rows', foreignRows.status === 200 && foreignRows.data.length === 0);
  const foreignSave = await restCall('/rpc/save_url_result_draft', foreignSession.access_token, {method: 'POST', body: {
    p_organization_id: ids.org, p_opportunity_id: randomUUID(), p_request_id: randomUUID(), p_expected_version: 0, p_payload: fixture()}});
  step('foreign save RPC denied by real RLS/RPC', foreignSave.status === 403, 'HTTP ' + foreignSave.status);
  step('denied writes left DB unchanged', versionCount() === 1);
} catch (error) {
  step('native handoff acceptance aborted', false, String(error?.message || error).slice(0, 240));
} finally {
  landyServer?.kill('SIGTERM');
  await browser?.close().catch(() => {});
  stage = 'cleanup';
  const leftovers = [];
  try {
    for (const name of [...names].reverse()) {
      const existing = docker(['ps', '-a', '--filter', 'name=^/' + name + '$', '--format', '{{.Names}}']);
      if (existing) docker(['rm', '-f', name]);
    }
    if (docker(['network', 'ls', '--filter', 'name=^' + network + '$', '--format', '{{.Name}}'])) docker(['network', 'rm', network]);
    const remaining = docker(['ps', '-a', '--filter', 'label=' + label + '=' + run, '--format', '{{.Names}}']);
    if (remaining) leftovers.push(remaining);
  } catch (e) { leftovers.push(String(e.message).slice(0, 120)); }
  step('ephemeral stack removed (containers and network)', leftovers.length === 0, leftovers.join(','));
}
console.log(JSON.stringify({auto_handoff_native: results.every(Boolean) ? 'PASS' : 'FAIL', variant: LANDY ? 'landyachtz' : 'synthetic',
  scope: (LANDY ? 'real Python adapter + Landyachtz recorded HTML -> ' : '') + 'browser bridge+claim+save+review against ephemeral GoTrue/PostgREST/PostgreSQL in CI; transport of staging-shaped origin rewritten to stack; hosted Staging not proven'}));
process.exit(results.every(Boolean) ? 0 : 1);
