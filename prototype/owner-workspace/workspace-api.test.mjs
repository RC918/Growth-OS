import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceApi } from './workspace-api.mjs';

const origin = 'https://vhzryhibmpvglzcmfnaa.supabase.co';
const key = 'sb_publishable_test';
const orgA = '93a88055-0a0b-40c0-b22f-a6d312320001';
const orgB = '93a88055-0a0b-40c0-b22f-a6d312320002';

function fixture(role = 'owner') {
  const calls = [];
  async function fetchImpl(url, options) {
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, query: parsed.searchParams, options });
    if (parsed.pathname === '/auth/v1/token') {
      return { ok: true, json: async () => ({ access_token: `synthetic-${role}-token` }) };
    }
    const expected = `Bearer synthetic-${role}-token`;
    assert.equal(options.headers.Authorization, expected);
    if (parsed.pathname.endsWith('/organization_members')) {
      return { ok: true, json: async () => [{ organization_id: role === 'owner' ? orgA : orgB, role }] };
    }
    if (parsed.pathname.endsWith('/organizations')) {
      return { ok: true, json: async () => [{ id: role === 'owner' ? orgA : orgB, name: 'Synthetic workspace' }] };
    }
    if (parsed.pathname.endsWith('/business_profiles')) {
      return { ok: true, json: async () => [{ review_status: 'owner_approved' }] };
    }
    if (parsed.pathname.endsWith('/growth_opportunities')) {
      return { ok: true, json: async () => [] };
    }
    if (parsed.pathname.includes('/rpc/')) return { ok: true, json: async () => 'synthetic-id' };
    throw new Error(`Unexpected path: ${parsed.pathname}`);
  }
  return { api: createWorkspaceApi({ origin, key, fetchImpl }), calls };
}

test('owner session scopes dashboard reads and sends mutations with the authenticated organization', async () => {
  const { api, calls } = fixture();
  await api.signIn('test1@example.com', 'local-only-password');
  await api.dashboard();
  const reads = calls.filter(call => ['/rest/v1/organizations', '/rest/v1/business_profiles', '/rest/v1/growth_opportunities'].includes(call.path));
  assert.equal(reads.length, 3);
  assert.equal(reads[0].query.get('id'), `eq.${orgA}`);
  for (const call of reads.slice(1)) assert.equal(call.query.get('organization_id'), `eq.${orgA}`);
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
  api.signOut();
  await assert.rejects(api.dashboard(), /請先選擇工作區/);
});

test('viewer can read only their workspace, and cannot invoke owner mutations', async () => {
  const { api, calls } = fixture('viewer');
  await api.signIn('test2@example.com', 'local-only-password');
  await api.dashboard();
  assert.equal(calls.find(call => call.path.endsWith('/organizations')).query.get('id'), `eq.${orgB}`);
  assert.throws(() => api.approveProfile(), /只有企業擁有者/);
  assert.throws(() => api.reviewOpportunity('x', 'approved', 'y'), /只有企業擁有者/);
  assert.equal(calls.filter(call => call.path.includes('/rpc/')).length, 0);
});

test('untrusted destinations and HTTP error bodies never enter UI error text', async () => {
  assert.throws(() => createWorkspaceApi({ origin: 'https://evil.example', key }), /Staging 設定/);
  const secret = 'DO-NOT-LEAK';
  const api = createWorkspaceApi({ origin, key, fetchImpl: async () => ({
    ok: false, status: 401, text: async () => secret,
  }) });
  await assert.rejects(api.signIn('test1@example.com', secret), error => {
    assert.equal(error.message, '登入失敗（HTTP 401）');
    assert.ok(!error.message.includes(secret));
    return true;
  });
});
