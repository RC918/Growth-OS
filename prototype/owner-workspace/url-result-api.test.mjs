import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceApi} from './workspace-api.mjs';
import {fixtures,ids,parent,request} from '../../supabase/drafts/first_result_save/fixtures.mjs';
import {orderOpportunities} from './opportunity-order.mjs';
const payload=(await fixtures())[0],intent={organization_id:ids.org,opportunity_id:parent(20),request_id:request(20),expected_version:0,payload};
const saved={organization_id:ids.org,id:parent(30),opportunity_id:parent(20),version_number:1,title:payload.preview.fields.title.suggested,draft_body:payload.preview.fields.description.suggested,status:'draft',created_at:'2026-10-03T00:00:00Z',first_result_payload:payload,first_result_request_id:request(20),first_result_expected_version:0,first_result_request_digest:'pg-jsonb-sha256:'+'a'.repeat(64)};
const fragment='#access_token=synthetic&token_type=bearer&expires_in=3600';
function fixture({role='owner',enabled=true,members=1,schema=true}={}){
 let rows=[saved],release,hold=false;const calls=[];
 const api=createWorkspaceApi({origin:'https://synthetic.supabase.co',key:'sb_publishable_synthetic',redirectOrigin:'https://example.com',urlSaveEnabled:enabled,urlResultSchemaEnabled:schema,fetchImpl:async(url,options)=>{
  const u=new URL(url);calls.push({u,options});let value;
  if(u.pathname.endsWith('/user'))value={id:ids.owner};else if(u.pathname.endsWith('/organization_members'))value=Array.from({length:members},()=>({organization_id:ids.org,role}));
  else if(u.pathname.endsWith('/rpc/save_url_result_draft')){value=saved.id;if(hold)await new Promise(r=>release=r);}
  else {assert.equal(u.pathname,'/rest/v1/content_versions');value=structuredClone(rows);if(hold)await new Promise(r=>release=r);}
  return {ok:true,json:async()=>value};
 }});return {api,calls,setRows:r=>rows=r,hold:()=>hold=true,release:()=>release()};
}
test('URL API default gate/roles/membership fail closed before POST',async()=>{
 for(const role of ['owner','editor','viewer']){const f=fixture({role,enabled:role!=='owner'});await f.api.completeMagicLink(fragment);await assert.rejects(f.api.saveUrlResult(intent),/尚未開放|只有/);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);assert.ok(Object.isFrozen(f.api.context()));}
 const noSchema=fixture({schema:false});await noSchema.api.completeMagicLink(fragment);await assert.rejects(noSchema.api.saveUrlResult(intent),/尚未開放/);
 for(const members of [0,2]){const f=fixture({members});await assert.rejects(f.api.completeMagicLink(fragment),/既有工作區/);await assert.rejects(f.api.saveUrlResult(intent),/只有/);}
});
test('URL API exact frozen dispatch and org/request readback; corruption rejected',async()=>{
 const f=fixture();await f.api.completeMagicLink(fragment);await assert.rejects(f.api.saveUrlResult(intent),/保存意圖檢查/);assert.equal(await f.api.saveUrlResult(intent,{isCurrent:()=>true}),saved.id);const post=f.calls.at(-1);assert.deepEqual(JSON.parse(post.options.body),{p_organization_id:ids.org,p_opportunity_id:parent(20),p_request_id:request(20),p_expected_version:0,p_payload:payload});
 assert.deepEqual(await f.api.reconcileUrlResult(intent,saved.id),saved);const read=f.calls.at(-1);assert.equal(read.options.method,'GET');assert.equal(read.u.searchParams.get('organization_id'),'eq.'+ids.org);assert.equal(read.u.searchParams.get('first_result_request_id'),'eq.'+request(20));assert.equal(read.u.searchParams.get('limit'),'2');
 for(const [key,value] of [['organization_id',ids.other],['opportunity_id',parent(99)],['id',parent(99)],['first_result_request_id',request(99)],['first_result_expected_version',8],['first_result_payload',{}]]){f.setRows([{...saved,[key]:value}]);await assert.rejects(f.api.reconcileUrlResult(intent,saved.id),/不一致/);}
 f.setRows([]);assert.equal(await f.api.reconcileUrlResult(intent),null);f.setRows([saved,saved]);await assert.rejects(f.api.reconcileUrlResult(intent),/不一致/);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
});
test('URL API pending result cannot cross a signed-out/replaced session',async()=>{
 const f=fixture();await f.api.completeMagicLink(fragment);f.hold();const pending=f.api.reconcileUrlResult(intent);f.api.signOut();await f.api.completeMagicLink(fragment);f.release();await assert.rejects(pending,/工作區已變更/);
});
test('URL ordering never invents missing approved sources and unknown kinds do not rank as approved',()=>{
 const item={id:parent(20),entry_kind:'url_result',status:'url_pending_review',created_at:'2026-10-03T00:00:00Z'};
 assert.match(orderOpportunities([item],[],[])[0].reason,/URL 成果待專用審核/);assert.match(orderOpportunities([{...item,entry_kind:'bad'}],[],[])[0].reason,/類型未知/);
});

test('URL API requires a synchronous live intent immediately before dispatch',async()=>{
 const f=fixture();await f.api.completeMagicLink(fragment);let dispatched=0;
 for(const isCurrent of [()=>false,()=>undefined,()=>Promise.resolve(true)])await assert.rejects(f.api.saveUrlResult(intent,{isCurrent,onDispatch:()=>dispatched++}),/保存意圖或工作區已失效/);
 assert.equal(dispatched,0);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
});
