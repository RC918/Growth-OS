// Part C synthetic acceptance for persistent Review on isolated Staging.
// Runs ONLY against vhzryhibmpvglzcmfnaa when explicitly confirmed via env;
// contains no credentials. Live mode creates synthetic orgs/users, saves a
// reviewed First Result payload, confirms Review, verifies tenant isolation,
// then cleans up its synthetic rows and users. Offline --self-check builds
// and validates the reviewed payload with the repo's own frozen modules.
//
// Live:  CONFIRM=REVIEW_ENABLE_ACCEPTANCE SUPABASE_SERVICE_KEY=... \
//        SUPABASE_ANON_KEY=... node supabase/tests/review_enable_acceptance.mjs --payload reviewed.json
// Check: node supabase/tests/review_enable_acceptance.mjs --self-check --report report.json --emit-payload reviewed.json
import {readFile, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createResultReview} from '../../apps/web/first-result-review.mjs';
import {validateReport} from '../../apps/web/first-result-payload.mjs';

const REF = 'vhzryhibmpvglzcmfnaa';
const CHECKS = {title: true, meta_description: true, description: true, source: true, blocking_facts_clear: true};
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));

async function reviewedPayload(reportPath, emitPath) {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const review = createResultReview(report);
  for (const key of ['title', 'meta_description', 'description']) review.check(key, true);
  await review.confirm();
  const payload = await review.export();
  await validateReport(payload);
  if (emitPath) await writeFile(emitPath, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

if (args['self-check'] !== undefined || args.report) {
  const payload = await reviewedPayload(args.report, args['emit-payload']);
  console.log(JSON.stringify({self_check: 'PASS', source_digest: payload.snapshot.content_fingerprint,
    content_digest: payload.review.content_digest, emitted: args['emit-payload'] || null}, null, 2));
  process.exit(0);
}

if (process.env.CONFIRM !== 'REVIEW_ENABLE_ACCEPTANCE') { console.error('REFUSED: set CONFIRM=REVIEW_ENABLE_ACCEPTANCE'); process.exit(2); }
const service = process.env.SUPABASE_SERVICE_KEY, anon = process.env.SUPABASE_ANON_KEY;
if (!service || !anon || !args.payload) { console.error('REFUSED: SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY and --payload are required'); process.exit(2); }
const base = `https://${REF}.supabase.co`;
const payload = JSON.parse(await readFile(args.payload, 'utf8'));
await validateReport(payload);
const password = 'Synthetic-' + randomUUID();
const stamp = Date.now();
const results = [];
const step = (name, ok, detail = '') => { results.push({name, ok}); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' ' + detail : '')); if (!ok) process.exitCode = 1; };
async function call(path, {key, token, method = 'GET', body, expect} = {}) {
  const r = await fetch(base + path, {method, headers: {apikey: key, Authorization: `Bearer ${token || key}`, 'Content-Type': 'application/json', Prefer: 'return=representation'}, body: body ? JSON.stringify(body) : undefined});
  const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch {}
  if (expect !== undefined && r.status !== expect) throw Error(`${path} HTTP ${r.status}: ${text.slice(0, 200)}`);
  return {status: r.status, data};
}
const svc = {key: service};
const orgA = randomUUID(), orgB = randomUUID(), users = {};
try {
  const spec = (await call('/rest/v1/', svc)).data;
  const orgCols = Object.keys(spec.definitions?.organizations?.properties || {id: 1});
  for (const org of [orgA, orgB]) await call('/rest/v1/organizations', {...svc, method: 'POST', expect: 201, body: Object.fromEntries(orgCols.filter(k => ['id', 'name'].includes(k)).map(k => [k, k === 'id' ? org : 'Review acceptance synthetic']))});
  for (const [name, org, role] of [['owner', orgA, 'owner'], ['viewer', orgA, 'viewer'], ['foreign', orgB, 'owner']]) {
    const email = `review-acc-${name}-${stamp}@example.invalid`;
    const created = await call('/auth/v1/admin/users', {...svc, method: 'POST', expect: 200, body: {email, password, email_confirm: true}});
    users[name] = {id: created.data.id, email};
    await call('/rest/v1/organization_members', {...svc, method: 'POST', expect: 201, body: {organization_id: org, user_id: created.data.id, role}});
  }
  const signIn = async name => (await call('/auth/v1/token?grant_type=password', {key: anon, method: 'POST', expect: 200, body: {email: users[name].email, password}})).data.access_token;
  const as = async (name, path, opts = {}) => call(path, {key: anon, token: await signIn(name), ...opts});
  const requestId = randomUUID(), opportunityId = randomUUID();
  const saveBody = {p_organization_id: orgA, p_opportunity_id: opportunityId, p_request_id: requestId, p_expected_version: 0, p_payload: payload};
  const saved = await as('owner', '/rest/v1/rpc/save_url_result_draft', {method: 'POST', body: saveBody});
  step('owner save', saved.status === 200, `HTTP ${saved.status}`);
  const versionId = saved.data;
  const retry = await as('owner', '/rest/v1/rpc/save_url_result_draft', {method: 'POST', body: saveBody});
  step('idempotent save retry', retry.status === 200 && retry.data === versionId);
  const readback = await as('owner', `/rest/v1/content_versions?id=eq.${versionId}&select=id,first_result_request_digest,first_result_payload`, {});
  const row = readback.data?.[0];
  step('new-session readback', readback.status === 200 && row?.id === versionId && row.first_result_payload?.snapshot?.id === payload.snapshot.id);
  const reviewBody = {p_organization_id: orgA, p_version_id: versionId, p_request_id: randomUUID(), p_source_digest: payload.snapshot.content_fingerprint, p_content_digest: payload.review.content_digest, p_version_digest: row.first_result_request_digest, p_checks: CHECKS};
  const reviewed = await as('owner', '/rest/v1/rpc/review_url_result', {method: 'POST', body: reviewBody});
  step('owner review confirm (requires Part A enable)', reviewed.status === 200, `HTTP ${reviewed.status}`);
  const reviewRows = await as('owner', `/rest/v1/content_reviews?version_id=eq.${versionId}&select=id,decision,url_review_version_digest`, {});
  step('review readback', reviewRows.data?.length === 1 && reviewRows.data[0].decision === 'approved' && reviewRows.data[0].url_review_version_digest === row.first_result_request_digest);
  const viewerSave = await as('viewer', '/rest/v1/rpc/save_url_result_draft', {method: 'POST', body: {...saveBody, p_request_id: randomUUID()}});
  step('viewer save denied', viewerSave.status >= 400);
  const viewerReview = await as('viewer', '/rest/v1/rpc/review_url_result', {method: 'POST', body: {...reviewBody, p_request_id: randomUUID()}});
  step('viewer review denied', viewerReview.status >= 400);
  const foreignRead = await as('foreign', `/rest/v1/content_versions?id=eq.${versionId}&select=id`, {});
  step('foreign read isolated', foreignRead.status === 200 && (foreignRead.data?.length ?? 0) === 0);
  const foreignSave = await as('foreign', '/rest/v1/rpc/save_url_result_draft', {method: 'POST', body: {...saveBody, p_organization_id: orgA, p_request_id: randomUUID()}});
  step('foreign save denied', foreignSave.status >= 400);
} finally {
  for (const org of [orgA, orgB]) {
    for (const table of ['content_reviews', 'content_versions', 'growth_opportunities', 'audit_events', 'organization_members', 'organizations']) {
      const filter = table === 'organizations' ? `id=eq.${org}` : `organization_id=eq.${org}`;
      await call(`/rest/v1/${table}?${filter}`, {...svc, method: 'DELETE'}).catch(() => {});
    }
  }
  for (const user of Object.values(users)) await call(`/auth/v1/admin/users/${user.id}`, {...svc, method: 'DELETE'}).catch(() => {});
  console.log('Cleanup attempted for synthetic orgs/users');
}
console.log(JSON.stringify({acceptance: results.every(r => r.ok) ? 'PASS' : 'FAIL', steps: results.length}));
