import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createWorkspaceApi, contentVersionKind } from './workspace-api.mjs';

const origin = 'https://vhzryhibmpvglzcmfnaa.supabase.co';
const key = 'sb_publishable_test';
const orgA = '93a88055-0a0b-40c0-b22f-a6d312320001';
const orgB = '93a88055-0a0b-40c0-b22f-a6d312320002';
const redirectTo = 'https://growth-os-preview.vercel.app/workspace.html';
const fragment = role => `#access_token=synthetic-${role}-token&token_type=bearer&expires_in=3600&refresh_token=unused`;

function fixture(role = 'owner', verified = true, probeStatus = 403, leakForeign = false, excessSources = false) {
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
      if (parsed.searchParams.get('user_id') !== `eq.synthetic-${role}`) {
        return { ok: true, json: async () => [
          { organization_id: orgA, role: 'owner' },
          { organization_id: orgA, role: 'viewer' },
        ] };
      }
      return { ok: true, json: async () => [{ organization_id: role === 'owner' ? orgA : orgB, role }] };
    }
    if (parsed.pathname.endsWith('/organizations')) {
      if (parsed.searchParams.get('id') === `eq.${orgA}` && role === 'viewer') {
        return { ok: true, json: async () => leakForeign ? [{ id: orgA }] : [] };
      }
      return { ok: true, json: async () => [{ id: role === 'owner' ? orgA : orgB, name: 'Synthetic workspace' }] };
    }
    if (parsed.pathname.endsWith('/search_observation_versions')) {
      return {ok:true,json:async()=>parsed.searchParams.has('id')?[{id:'synthetic-observation',payload:{version:2},created_at:'2026-09-30T00:00:00Z'}]:[{id:'synthetic-observation',created_at:'2026-09-30T00:00:00Z'}]};
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
    if (parsed.pathname.endsWith('/opportunity_sources')) {
      if (excessSources) return { ok: true, json: async () => Array(500).fill({ opportunity_id: 'synthetic-opportunity' }) };
      return { ok: true, json: async () => [{ opportunity_id: 'synthetic-opportunity', source_kind: 'owner_question', evidence_note: 'Synthetic note', observed_at: '2026-09-29T00:00:00Z' }] };
    }
    if (parsed.pathname.endsWith('/opportunity_decisions')) {
      return { ok: true, json: async () => [{ opportunity_id: 'synthetic-opportunity', decision: 'approved', reason: 'Synthetic review', decided_at: '2026-09-29T00:00:00Z' }] };
    }
    if (parsed.pathname.endsWith('/content_versions')) {
      return { ok: true, json: async () => [{ first_result_request_id:null,first_result_expected_version:null,first_result_request_digest:null,id: 'synthetic-version', opportunity_id: 'synthetic-opportunity', version_number: 1, title: 'Synthetic draft', draft_body: 'A test body', status: 'draft',created_at:'2026-10-03T00:00:00Z' }] };
    }
    if (parsed.pathname.endsWith('/content_reviews')) {
      return { ok: true, json: async () => [{ version_id: 'synthetic-version', decision: 'approved', reason: 'Checked synthetic claims', reviewed_at: '2026-09-29T00:00:00Z' }] };
    }
    if (parsed.pathname.endsWith('/content_action_plans')) {
      return { ok: true, json: async () => [{ version_id: 'synthetic-version', proposed_path: '/synthetic-page', success_signal: 'GSC clicks', rollback_plan: 'Remove page', created_at: '2026-09-29T00:00:00Z' }] };
    }
    if (parsed.pathname.endsWith('/rpc/review_growth_opportunity') && role === 'viewer') {
      return { ok: false, status: probeStatus };
    }
    if (parsed.pathname.includes('/rpc/')) return { ok: true, json: async () => 'synthetic-id' };
    throw new Error(`Unexpected path: ${parsed.pathname}`);
  }
  return { api: createWorkspaceApi({ origin, key, redirectOrigin: new URL(redirectTo).origin, fetchImpl }), calls };
}

test('owner session scopes dashboard reads and sends mutations with the authenticated organization', async () => {
  const { api, calls } = fixture();
  await api.completeMagicLink(fragment('owner'));
  assert.equal(calls.find(call => call.path.endsWith('/organization_members')).query.get('user_id'), 'eq.synthetic-owner');
  const dashboard = await api.dashboard();
  assert.equal(dashboard.sources[0].evidence_note, 'Synthetic note');
  assert.equal(dashboard.decisions[0].reason, 'Synthetic review');
  assert.equal(dashboard.versions[0].title, 'Synthetic draft');
  assert.equal(calls.find(call=>call.path.endsWith('/content_versions')).query.get('select'),'id,opportunity_id,version_number,title,draft_body,status,created_at,first_result_request_id,first_result_expected_version,first_result_request_digest');
  assert.equal(dashboard.reviews[0].reason, 'Checked synthetic claims');
  assert.equal(dashboard.actionPlans[0].proposed_path, '/synthetic-page');
  const reads = calls.filter(call => ['/rest/v1/organizations', '/rest/v1/business_profiles', '/rest/v1/growth_opportunities'].includes(call.path));
  assert.equal(reads.length, 3);
  assert.equal(reads[0].query.get('id'), `eq.${orgA}`);
  for (const call of reads.slice(1)) assert.equal(call.query.get('organization_id'), `eq.${orgA}`);
  for (const table of ['sites', 'opportunity_sources', 'opportunity_decisions', 'content_versions', 'content_reviews', 'content_action_plans']) {
    assert.equal(calls.find(call => call.path.endsWith(`/${table}`)).query.get('organization_id'), `eq.${orgA}`);
  }
  await api.saveProfile({ display_name: 'A', audience_summary: 'B', offering_summary: 'C', primary_outcome: 'order', target_market: 'TW' });
  await api.approveProfile();
  await api.createOpportunity({ channel: 'organic_search', audience_need: 'Need', proposed_action: 'Action', rationale: 'Reason', source_kind: 'owner_question', evidence_note: 'Evidence' });
  await api.reviewOpportunity('synthetic-opportunity', 'approved', 'Reviewed');
  await api.createContentDraft('synthetic-opportunity', 'Title', 'Draft body');
  await api.reviewContentDraft('synthetic-version', 'approved', 'Claims checked');
  await api.planContentAction('synthetic-version', '/synthetic-page', 'GSC clicks', 'Remove page');
  const mutations = calls.filter(call => call.path.includes('/rpc/'));
  assert.equal(mutations.length, 7);
  for (const call of mutations) {
    assert.equal(call.options.method, 'POST');
    assert.equal(JSON.parse(call.options.body).p_organization_id, orgA);
  }
  assert.equal(JSON.parse(mutations[0].options.body).p_site_id, 'fixture-site');
  const draft = mutations.find(call => call.path.endsWith('/rpc/create_content_draft'));
  assert.deepEqual(JSON.parse(draft.options.body), { p_organization_id: orgA,
    p_opportunity_id: 'synthetic-opportunity', p_title: 'Title', p_draft_body: 'Draft body' });
  const review = mutations.find(call => call.path.endsWith('/rpc/review_content_draft'));
  assert.deepEqual(JSON.parse(review.options.body), { p_organization_id: orgA,
    p_version_id: 'synthetic-version', p_decision: 'approved', p_reason: 'Claims checked' });
  const action = mutations.find(call => call.path.endsWith('/rpc/plan_content_action'));
  assert.deepEqual(JSON.parse(action.options.body), { p_organization_id: orgA,
    p_version_id: 'synthetic-version', p_proposed_path: '/synthetic-page',
    p_success_signal: 'GSC clicks', p_rollback_plan: 'Remove page' });
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
  const dashboard = await api.dashboard();
  assert.equal(dashboard.sources.length, 1);
  assert.equal(dashboard.decisions.length, 1);
  assert.equal(calls.find(call => call.path.endsWith('/organizations')).query.get('id'), `eq.${orgB}`);
  for (const table of ['opportunity_sources', 'opportunity_decisions', 'content_versions', 'content_reviews', 'content_action_plans']) {
    assert.equal(calls.find(call => call.path.endsWith(`/${table}`)).query.get('organization_id'), `eq.${orgB}`);
  }
  assert.throws(() => api.approveProfile(), /只有企業擁有者/);
  assert.throws(() => api.reviewOpportunity('x', 'approved', 'y'), /只有企業擁有者/);
  assert.throws(() => api.createContentDraft('x', 'Title', 'Body'), /只有企業擁有者/);
  assert.throws(() => api.reviewContentDraft('x', 'approved', 'Reason'), /只有企業擁有者/);
  assert.throws(() => api.planContentAction('x', '/test', 'Clicks', 'Remove'), /只有企業擁有者/);
  assert.equal(calls.filter(call => call.path.includes('/rpc/')).length, 0);
});

test('real-token diagnostic checks cross-tenant RLS and a harmless owner-only RPC', async () => {
  const { api, calls } = fixture('viewer');
  await assert.rejects(api.verifyViewerIsolation(), /僅供 Fixture B/);
  await api.completeMagicLink(fragment('viewer'));
  assert.deepEqual(await api.verifyViewerIsolation(), {
    scopeDenied: true, ownerActionDenied: true, ownerActionStatus: 403,
  });
  const foreign = calls.find(call => call.path.endsWith('/organizations'));
  assert.equal(foreign.query.get('id'), `eq.${orgA}`);
  const rpc = calls.find(call => call.path.endsWith('/rpc/review_growth_opportunity'));
  assert.equal(rpc.options.method, 'POST');
  assert.equal(JSON.parse(rpc.options.body).p_decision, 'invalid_probe_never_write');
  assert.equal(JSON.parse(rpc.options.body).p_opportunity_id, '00000000-0000-0000-0000-000000000000');
  assert.equal(rpc.options.headers.Authorization, 'Bearer synthetic-viewer-token');
  api.signOut();
  await assert.rejects(api.verifyViewerIsolation(), /僅供 Fixture B/);
});

test('diagnostic reports a leak or a validation response instead of passing', async () => {
  const { api } = fixture('viewer', true, 400, true);
  await api.completeMagicLink(fragment('viewer'));
  assert.deepEqual(await api.verifyViewerIsolation(), {
    scopeDenied: false, ownerActionDenied: false, ownerActionStatus: 400,
  });
  const owner = fixture('owner').api;
  await owner.completeMagicLink(fragment('owner'));
  await assert.rejects(owner.verifyViewerIsolation(), /僅供 Fixture B/);
});

test('workspace rejects truncated evidence rather than presenting an incomplete chain', async () => {
  const { api } = fixture('owner', true, 403, false, true);
  await api.completeMagicLink(fragment('owner'));
  await assert.rejects(api.dashboard(), /證據、版本或執行方案筆數超過/);
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
  for (const name of ['url-result-review.mjs','saved-result-review.mjs','url-result-trial-marker.mjs','typed-draft.mjs','url-result-save.mjs','url-result-config.mjs','first-result-payload.mjs','first-result-review.mjs','workspace.html', 'workspace.mjs', 'workspace-api.mjs', 'workspace.css', 'opportunity-order.mjs','workspace-observations.mjs','baseline-snapshot.mjs','baseline-report.mjs','baseline-actions.mjs','search-baseline.mjs','goal-intake.mjs','workspace-goals.mjs']) {
    const source = await readFile(new URL(name, import.meta.url), 'utf8');
    const preview = await readFile(new URL(`../../apps/web/${name}`, import.meta.url), 'utf8');
    assert.equal(preview, source, `${name} differs from the reviewed source`);
  }
});


test('observation reads and writes are scoped by authenticated membership; viewer and signed-out writes fail',async()=>{
 const {api,calls}=fixture(); await api.completeMagicLink(fragment('owner'));
 await api.listObservations(); await api.readObservation('synthetic-observation');
 const requestId='00000000-0000-4000-8000-000000000001',payload={version:2};
 await api.saveObservation(requestId,payload);
 const reads=calls.filter(c=>c.path.endsWith('/search_observation_versions'));
 assert.equal(reads[0].query.get('organization_id'),`eq.${orgA}`);
 assert.equal(reads[0].query.get('select'),'id,created_at'); // Never fetch every payload in the version list.
 assert.equal(reads[1].query.get('organization_id'),`eq.${orgA}`);
 assert.equal(reads[1].query.get('id'),'eq.synthetic-observation');
 const rpc=calls.find(c=>c.path.endsWith('/rpc/save_search_observation'));
 assert.deepEqual(JSON.parse(rpc.options.body),{p_organization_id:orgA,p_request_id:requestId,p_payload:payload});
 const viewer=fixture('viewer'); await viewer.api.completeMagicLink(fragment('viewer'));
 await viewer.api.listObservations();
 assert.equal(viewer.calls.at(-1).query.get('organization_id'),`eq.${orgB}`);
 assert.throws(()=>viewer.api.saveObservation(requestId,payload),/只有企業擁有者/);
 api.signOut(); assert.throws(()=>api.listObservations(),/工作區/); assert.throws(()=>api.saveObservation(requestId,payload),/只有企業擁有者/);
});

const typedMetadata={id:'40000000-0000-4000-8000-000000000001',opportunity_id:'20000000-0000-4000-8000-000000000001',version_number:2,title:'Typed title',draft_body:'Body',status:'draft',created_at:'2026-10-03T00:00:00Z',first_result_request_id:'30000000-0000-4000-8000-000000000001',first_result_expected_version:1,first_result_request_digest:'pg-jsonb-sha256:'+'a'.repeat(64)};
function typedReadFixture(role='owner') {
 let org=orgA,rows=[{organization_id:org,...typedMetadata,first_result_payload:{synthetic:true}}],hold=false,release,status=200;
 const calls=[];
 const api=createWorkspaceApi({origin,key,redirectOrigin:new URL(redirectTo).origin,fetchImpl:async(url,options)=>{
  const u=new URL(url);calls.push({url:u,options});assert.equal(options.method,'GET');
  if(u.pathname.endsWith('/user'))return {ok:true,json:async()=>({id:'synthetic-user'})};
  if(u.pathname.endsWith('/organization_members'))return {ok:true,json:async()=>[{organization_id:org,role}]};
  assert.equal(u.pathname,'/rest/v1/content_versions');
  const value=structuredClone(rows),code=status;
  if(hold)await new Promise(resolve=>{release=resolve;});
  return {ok:code===200,status:code,json:async()=>value};
 }});
 return {api,calls,setRows:value=>rows=value,setStatus:value=>status=value,setOrg:value=>org=value,hold:()=>{hold=true;},release:()=>release()};
}
test('version discriminator requires all explicit metadata and fails closed on partial markers',()=>{
 assert.equal(contentVersionKind(typedMetadata),'typed');
 const legacy={...typedMetadata,first_result_request_id:null,first_result_expected_version:null,first_result_request_digest:null};
 assert.equal(contentVersionKind(legacy),'legacy');
 for(const key of ['first_result_request_id','first_result_expected_version','first_result_request_digest']){
  const missing={...legacy};delete missing[key];assert.equal(contentVersionKind(missing),'invalid');
  const partial={...typedMetadata,[key]:null};assert.equal(contentVersionKind(partial),'invalid');
 }
 assert.equal(contentVersionKind({...legacy,first_result_payload:{}}),'invalid');
 assert.equal(contentVersionKind({...typedMetadata,version_number:99}),'invalid');
});
test('owner/viewer read one typed version with exact org/id/projection and reject mismatches or missing payload',async()=>{
 for(const role of ['owner','viewer']){
  const f=typedReadFixture(role);await f.api.completeMagicLink(fragment(role));
  const row=await f.api.readContentVersion(typedMetadata);assert.deepEqual(row.first_result_payload,{synthetic:true});
  const call=f.calls.at(-1);assert.equal(call.url.searchParams.get('organization_id'),`eq.${orgA}`);assert.equal(call.url.searchParams.get('id'),`eq.${typedMetadata.id}`);assert.equal(call.url.searchParams.get('limit'),'1');
  assert.equal(call.url.searchParams.get('select'),'organization_id,id,opportunity_id,version_number,title,draft_body,status,created_at,first_result_request_id,first_result_expected_version,first_result_request_digest,first_result_payload');
  for(const [field,value] of [['organization_id',orgB],['id',orgB],['opportunity_id',orgB],['version_number',3],['first_result_request_id',orgB],['first_result_expected_version',0],['first_result_request_digest','bad']]){
   f.setRows([{...row,[field]:value}]);await assert.rejects(f.api.readContentVersion(typedMetadata),/不一致/);
  }
  for(const field of ['first_result_request_id','first_result_expected_version','first_result_request_digest']){
   const damaged={...row};delete damaged[field];f.setRows([damaged]);await assert.rejects(f.api.readContentVersion(typedMetadata),/不一致/);
  }
  for(const bad of [null,[],undefined]){f.setRows([{...row,first_result_payload:bad}]);await assert.rejects(f.api.readContentVersion(typedMetadata),/資料缺漏/);}
  f.setRows([]);await assert.rejects(f.api.readContentVersion(typedMetadata),/找不到/);
  f.setRows([row,row]);await assert.rejects(f.api.readContentVersion(typedMetadata),/找不到/);
  for(const status of [401,403]){f.setStatus(status);await assert.rejects(f.api.readContentVersion(typedMetadata),new RegExp(`HTTP ${status}`));}
  f.api.signOut();const count=f.calls.length;await assert.rejects(f.api.readContentVersion(typedMetadata),/工作區/);assert.equal(f.calls.length,count);
 }
});
test('late typed read rejects after signout or replacement session even with the same token',async()=>{
 for(const switchOrg of [false,true]){
  const f=typedReadFixture();await f.api.completeMagicLink(fragment('owner'));f.hold();
  const pending=f.api.readContentVersion(typedMetadata);f.api.signOut();
  if(switchOrg){f.setOrg(orgB);await f.api.completeMagicLink(fragment('owner'));}
  f.release();await assert.rejects(pending,/工作區已變更/);
 }
});

test('fixed Owner tenant GET: positive/negative controls, errors, identity/gates and stale session; zero POST',async()=>{
 const actor='e85f1a90-3565-4fc1-a7e0-3b7d08830d0e',parentA='9bafbb2f-eea7-48ea-bc23-3896897f19c3',parentB='93a88055-0a0b-40c0-b22f-a6d3123c0002';
 const good=[{id:parentA,organization_id:orgA}];
 async function make({user=actor,org=orgA,role='owner',schema=true,save=false,positive=good,negative=[],status=200,network=false,hold=false}={}){
  const calls=[];let release,started;
  const pending=new Promise(r=>started=r);
  const api=createWorkspaceApi({origin,key,redirectOrigin:'https://offline.invalid',urlResultSchemaEnabled:schema,urlSaveEnabled:save,fetchImpl:async(url,options)=>{
   const u=new URL(url);calls.push({u,options});assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer synthetic-owner-token');
   let value;
   if(u.pathname.endsWith('/user'))value={id:user};
   else if(u.pathname.endsWith('/organization_members'))value=[{organization_id:org,role}];
   else {
    assert.equal(u.pathname,'/rest/v1/growth_opportunities');assert.equal(u.searchParams.get('select'),'id,organization_id');assert.equal(u.searchParams.get('limit'),'2');
    const own=u.searchParams.get('organization_id')==='eq.'+orgA;
    assert.equal(u.searchParams.get('organization_id'),'eq.'+(own?orgA:orgB));assert.equal(u.searchParams.get('id'),'eq.'+(own?parentA:parentB));
    if(hold && !own){started();await new Promise(r=>release=r);}
    if(!own && network)throw Error('network');
    if(!own && status!==200)return {ok:false,status,json:async()=>({})};
    value=own?positive:negative;
   }
   return {ok:true,json:async()=>value};
  }});
  await api.completeMagicLink(fragment('owner'));
  return {api,calls,pending,release:()=>release()};
 }
 const f=await make();const result=await f.api.verifyOwnerTenantRead();assert.equal(result.positiveCount,1);assert.equal(result.negativeCount,0);assert.equal(result.positiveId,parentA);assert.equal(result.negativeId,parentB);assert.ok(Number.isFinite(Date.parse(result.checkedAt)));assert.equal(f.calls.length,4);
 for(const opts of [{positive:[]},{positive:[...good,...good]},{positive:[{id:parentB,organization_id:orgA}]},{positive:[null]},{positive:{}},{negative:[{id:parentB,organization_id:orgB}]},{negative:{}},{status:401},{status:403},{status:500},{network:true}]){
  const f=await make(opts);await assert.rejects(f.api.verifyOwnerTenantRead());assert.ok(f.calls.every(c=>c.options.method==='GET'));
 }
 for(const opts of [{user:'wrong'},{org:orgB},{role:'viewer'},{role:'editor'},{schema:false},{save:true}]){
  const f=await make(opts);assert.equal(f.api.tenantDiagnosticAvailable(),false);await assert.rejects(f.api.verifyOwnerTenantRead());assert.equal(f.calls.length,2);
 }
 for(const replace of [false,true]){
  const f=await make({hold:true});const read=f.api.verifyOwnerTenantRead();await f.pending;f.api.signOut();if(replace)await f.api.completeMagicLink(fragment('owner'));f.release();await assert.rejects(read,/已變更/);
 }
});
