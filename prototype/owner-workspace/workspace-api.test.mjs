import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createWorkspaceApi } from './workspace-api.mjs';

const origin = 'https://vhzryhibmpvglzcmfnaa.supabase.co';
const key = 'sb_publishable_test';
const orgA = '93a88055-0a0b-40c0-b22f-a6d312320001';
const orgB = '93a88055-0a0b-40c0-b22f-a6d312320002';
const redirectTo = 'https://growth-os-preview.vercel.app/workspace.html';
const fragment = role => `#access_token=synthetic-${role}-token&token_type=bearer&expires_in=3600&refresh_token=unused`;

function fixture(role = 'owner', verified = true) {
  const calls = [];
  async function fetchImpl(url, options) {
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, query: parsed.searchParams, options });
    if (parsed.pathname === '/auth/v1/otp') {
      assert.equal(options.headers.Authorization, undefined);
      return { ok: true, json: async () => ({}) };
    }
    const expected = `Bearer synthetic-${role}-token`;
    assert.equal(options.headers.Authorization, expected);
    if (parsed.pathname === '/auth/v1/user') return { ok: true, json: async () => ({ id: `synthetic-${role}` }) };
    if (parsed.pathname.endsWith('/organization_members')) {
      return { ok: true, json: async () => [{ organization_id: role === 'owner' ? orgA : orgB, role }] };
    }
    if (parsed.pathname.endsWith('/organizations')) {
      return { ok: true, json: async () => [{ id: role === 'owner' ? orgA : orgB, name: 'Synthetic workspace' }] };
    }
    if (parsed.pathname.endsWith('/business_profiles')) {
      return { ok: true, json: async () => [{ site_id: 'fixture-site', review_status: 'owner_approved' }] };
    }
    if (parsed.pathname.endsWith('/sites')) {
      return { ok: true, json: async () => [{ id: 'fixture-site', origin: 'https://example.com', verified_at: verified ? '2026-09-29T00:00:00Z' : null }] };
    }
    if (parsed.pathname.endsWith('/growth_opportunities')) {
      return { ok: true, json: async () => [] };
    }
    if (parsed.pathname.includes('/rpc/')) return { ok: true, json: async () => 'synthetic-id' };
    throw new Error(`Unexpected path: ${parsed.pathname}`);
  }
  return { api: createWorkspaceApi({ origin, key, redirectOrigin: new URL(redirectTo).origin, fetchImpl }), calls };
}

test('owner session scopes dashboard reads and sends mutations with the authenticated organization', async () => {
  const { api, calls } = fixture();
  await api.completeMagicLink(fragment('owner'));
  await api.dashboard();
  const reads = calls.filter(call => ['/rest/v1/organizations', '/rest/v1/business_profiles', '/rest/v1/growth_opportunities'].includes(call.path));
  assert.equal(reads.length, 3);
  assert.equal(reads[0].query.get('id'), `eq.${orgA}`);
  for (const call of reads.slice(1)) assert.equal(call.query.get('organization_id'), `eq.${orgA}`);
  assert.equal(calls.find(call => call.path.endsWith('/sites')).query.get('organization_id'), `eq.${orgA}`);
  await api.saveProfile({ display_name: 'A', audience_summary: 'B', offering_summary: 'C', primary_outcome: 'order', target_market: 'TW' });
  await api.approveProfile();
  await api.createOpportunity({ channel: 'organic_search', audience_need: 'Need', proposed_action: 'Action', rationale: 'Reason', source_kind: 'owner_question', evidence_note: 'Evidence' });
  await api.reviewOpportunity('synthetic-opportunity', 'approved', 'Reviewed');
  const mutations = calls.filter(call => call.path.includes('/rpc/'));
  assert.equal(mutations.length, 4);
  for (const call of mutations) {
    assert.equal(call.options.method, 'POST');
    assert.equal(JSON.parse(call.options.body).p_organization_id, orgA);
  }
  assert.equal(JSON.parse(mutations[0].options.body).p_site_id, 'fixture-site');
  api.signOut();
  await assert.rejects(api.dashboard(), /請先選擇工作區/);
});

test('unverified linked site is preserved unless the owner explicitly detaches it', async () => {
  const { api, calls } = fixture('owner', false);
  await api.completeMagicLink(fragment('owner'));
  await api.dashboard();
  const values = { display_name: 'A', audience_summary: 'B', offering_summary: 'C', primary_outcome: 'order', target_market: 'TW' };
  assert.throws(() => api.saveProfile(values), /網站尚未驗證/);
  assert.equal(calls.filter(call => call.path.includes('/rpc/')).length, 0);
  await api.saveProfile({ ...values, detach_site: true });
  const save = calls.find(call => call.path.endsWith('/rpc/save_business_profile'));
  assert.equal(JSON.parse(save.options.body).p_site_id, null);
});

test('viewer can read only their workspace, and cannot invoke owner mutations', async () => {
  const { api, calls } = fixture('viewer');
  await api.completeMagicLink(fragment('viewer'));
  await api.dashboard();
  assert.equal(calls.find(call => call.path.endsWith('/organizations')).query.get('id'), `eq.${orgB}`);
  assert.throws(() => api.approveProfile(), /只有企業擁有者/);
  assert.throws(() => api.reviewOpportunity('x', 'approved', 'y'), /只有企業擁有者/);
  assert.equal(calls.filter(call => call.path.includes('/rpc/')).length, 0);
});

test('magic link request cannot create a user or redirect outside this workspace', async () => {
  const { api, calls } = fixture();
  await api.requestMagicLink('test@example.com', redirectTo);
  const otp = calls.find(call => call.path === '/auth/v1/otp');
  assert.equal(otp.options.method, 'POST');
  assert.equal(otp.query.get('redirect_to'), redirectTo);
  assert.deepEqual(JSON.parse(otp.options.body), { email: 'test@example.com', create_user: false });
  await assert.rejects(api.requestMagicLink('test@example.com', 'https://evil.example/workspace.html'), /返回網址/);
  await assert.rejects(api.requestMagicLink('test@example.com', 'http://growth-os-preview.vercel.app/workspace.html'), /返回網址/);
  await assert.rejects(api.requestMagicLink('test@example.com', `${redirectTo}?next=evil`), /返回網址/);
  assert.equal(calls.filter(call => call.path === '/auth/v1/otp').length, 1);
});

test('invalid callback and rejected Auth response clear the in-memory session', async () => {
  assert.throws(() => createWorkspaceApi({ origin: 'https://evil.example', key }), /Staging 設定/);
  const secret = 'DO-NOT-LEAK';
  const api = createWorkspaceApi({ origin, key, redirectOrigin: new URL(redirectTo).origin, fetchImpl: async () => ({
    ok: false, status: 401, text: async () => secret,
  }) });
  await assert.rejects(api.completeMagicLink(`#access_token=${secret}&token_type=bearer&expires_in=3600`), error => {
    assert.equal(error.message, '登入失敗（HTTP 401）');
    assert.ok(!error.message.includes(secret));
    return true;
  });
  await assert.rejects(api.dashboard(), /請先選擇工作區/);
  await assert.rejects(api.completeMagicLink('#error=access_denied&error_description=DO-NOT-LEAK'), /登入連結無效/);
  await assert.rejects(api.completeMagicLink('#access_token=x&token_type=bearer&expires_in=0'), /缺少有效工作階段/);
});

test('preview publishes the exact reviewed workspace files', async () => {
  for (const name of ['workspace.html', 'workspace.mjs', 'workspace-api.mjs', 'workspace.css']) {
    const source = await readFile(new URL(name, import.meta.url), 'utf8');
    const preview = await readFile(new URL(`../../apps/web/${name}`, import.meta.url), 'utf8');
    assert.equal(preview, source, `${name} differs from the reviewed source`);
  }
});
