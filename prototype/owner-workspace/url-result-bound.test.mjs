import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as historicalConfig from '../../supabase/drafts/url_result/bound/owner-candidate-20261003T193000Z/preview-closed-config.mjs';
import * as deployedConfig from '../../apps/web/url-result-config.mjs';
import {createWorkspaceApi} from './workspace-api.mjs';
import {frozen,renderBound} from '../../supabase/drafts/url_result/bound/generate.mjs';
const {manifest:m,payload}=await frozen(),pack=await renderBound({expiresAt:'2099-01-01T00:00:00Z',previewURL:'https://offline.invalid/workspace.html'});
const intent={organization_id:m.organization_id,opportunity_id:m.opportunity_id,request_id:m.request_id,expected_version:0,payload};
const row={id:'00000000-0000-4000-8000-000000000099',organization_id:m.organization_id,created_by:m.actor_id,opportunity_id:m.opportunity_id,version_number:1,status:'draft',created_at:'2026-10-03T00:00:00Z',title:payload.preview.fields.title.suggested,draft_body:payload.preview.fields.description.suggested,first_result_request_id:m.request_id,first_result_expected_version:0,first_result_request_digest:m.request_digest,first_result_payload:payload};
const fragment='#access_token=synthetic&token_type=bearer&expires_in=3600';
function fixture({config=pack.config,actor=m.actor_id,role='owner',org=m.organization_id,redirectOrigin='https://offline.invalid',enabled=true}={}){
 let rows=[row],release,hold=false;const calls=[];
 const api=createWorkspaceApi({origin:'https://synthetic.supabase.co',key:'sb_publishable_synthetic',redirectOrigin,urlSaveEnabled:enabled,urlResultSchemaEnabled:true,urlSaveTrial:config,fetchImpl:async(url,options)=>{
  const u=new URL(url);calls.push({u,options});let value;
  if(u.pathname.endsWith('/user'))value={id:actor};else if(u.pathname.endsWith('/organization_members'))value=[{organization_id:org,role}];
  else if(options.method==='POST')value=row.id;
  else{value=structuredClone(rows);if(hold)await new Promise(r=>release=r);}
  return {ok:true,json:async()=>value};
 }});return {api,calls,setRows:r=>rows=r,hold:()=>hold=true,release:()=>release()};
}
test('historical first-trial fixture retains reviewed bytes, fixed owner/tenant/target and exact cutoff (synthetic GET only)',async t=>{
 const candidate='../../supabase/drafts/url_result/bound/owner-candidate-20261003T193000Z/';
 for(const [mode,hash]of Object.entries({open:'053fa4ac47224c64cb0cebf345519bf669e53c225417955f95d717b620e66f45',closed:'c37e2db6efbc8079f05109435fe5a3930de49be77402a1d5e66a1513a55e5511'}))assert.equal(createHash('sha256').update(await readFile(new URL(candidate+`preview-${mode}-config.mjs`,import.meta.url))).digest('hex'),hash);
 assert.equal(historicalConfig.urlResultSchemaEnabled,true);
 const config=historicalConfig.urlSaveTrial;
 assert.equal(config.actor_id,m.actor_id);assert.equal(config.organization_id,m.organization_id);
 assert.equal(config.expected_version,0);assert.equal(config.expires_at,'2026-10-03T19:30:00.000Z');
 const cutoff=Date.parse(config.expires_at),redirectOrigin=new URL(config.workspace_url).origin;
 t.mock.timers.enable({apis:['Date'],now:cutoff-1000});
 const opts={config,redirectOrigin,enabled:historicalConfig.urlSaveEnabled};
 for(const patch of [{},{actor:row.id},{org:row.id},{role:'viewer'},{redirectOrigin:'https://wrong.invalid'}]){
  const f=fixture({...opts,...patch});await f.api.completeMagicLink(fragment);
  assert.equal(f.api.boundSaveAvailable(),Object.keys(patch).length===0);
  assert.equal(f.calls.every(c=>c.options.method==='GET'),true);
 }
 const f=fixture(opts);await f.api.completeMagicLink(fragment);
 t.mock.timers.setTime(cutoff);assert.equal(f.api.boundSaveAvailable(),false);
 assert.equal(f.calls.every(c=>c.options.method==='GET'),true);
});
test('actual runtime exactly mirrors frozen revision open or closed bytes; both gates and drift rejection remain strict',async t=>{
 const root=new URL('../../supabase/drafts/url_result/revision-bound/owner-candidate-20261004T060000Z/',import.meta.url),candidates=[];
 for(const [mode,hash]of Object.entries({open:'0d17a06519bd28d7f86443b31d453e18762ce4106bdf523e173e1c73693d1d82',closed:'fe8bfa6ea7070d89059fa591ed68aec11624a4b4553b380589071473f0bcf38b'})){
  const url=new URL(`preview-${mode}-config.mjs`,root),source=await readFile(url,'utf8'),config=await import(url);
  assert.equal(createHash('sha256').update(source).digest('hex'),hash);assert.equal(config.urlSaveEnabled,mode==='open');assert.equal(config.urlResultSchemaEnabled,true);
  assert.equal(config.urlSaveTrial.kind,'revision');assert.equal(config.urlSaveTrial.expected_version,1);assert.equal(config.urlSaveTrial.request_id,'a326f6ce-03c7-4d3e-9fce-c22b2849cb48');assert.equal(config.urlSaveTrial.expires_at,'2026-10-04T06:00:00.000Z');candidates.push({source,config});
 }
 const exact=(source,mirror)=>{assert.equal(mirror,source,'runtime mirror bytes');const match=candidates.find(c=>c.source===source);assert.ok(match,'runtime must equal one complete reviewed revision freeze');return match.config;};
 const source=await readFile(new URL('../../apps/web/url-result-config.mjs',import.meta.url),'utf8'),mirror=await readFile(new URL('./url-result-config.mjs',import.meta.url),'utf8');assert.deepEqual(deployedConfig,exact(source,mirror));
 for(const candidate of candidates){
  assert.equal(exact(candidate.source,candidate.source),candidate.config);
  for(const altered of [candidate.source+'\n',candidate.source.replace('2026-10-04T06:00:00.000Z','2026-10-04T07:00:00.000Z'),candidate.source.replace('"expected_version": 1','"expected_version": 0'),candidate.source.replace('"kind": "revision"','"kind": null')])assert.throws(()=>exact(altered,altered));
 }
 assert.throws(()=>exact(candidates[0].source,candidates[1].source));
 const cutoff=Date.parse('2026-10-04T06:00:00.000Z');t.mock.timers.enable({apis:['Date'],now:cutoff-1000});
 for(const {config:exports}of candidates){
  const config=exports.urlSaveTrial,opts={config,redirectOrigin:new URL(config.workspace_url).origin,enabled:exports.urlSaveEnabled};
  for(const patch of [{},{actor:row.id},{org:row.id},{role:'viewer'},{redirectOrigin:'https://wrong.invalid'}]){const f=fixture({...opts,...patch});await f.api.completeMagicLink(fragment);assert.equal(f.api.boundSaveAvailable(),Object.keys(patch).length===0);assert.ok(f.calls.every(c=>c.options.method==='GET'));}
  const f=fixture(opts);await f.api.completeMagicLink(fragment);assert.equal(f.api.revisionTrialAvailable({id:config.base_version_id,opportunity_id:config.opportunity_id,version_number:1}),exports.urlSaveEnabled);t.mock.timers.setTime(cutoff);assert.equal(f.api.boundSaveAvailable(),false);assert.equal(f.api.revisionTrialAvailable({id:config.base_version_id,opportunity_id:config.opportunity_id,version_number:1}),false);t.mock.timers.setTime(cutoff-1000);assert.ok(f.calls.every(c=>c.options.method==='GET'));
 }
});
test('bound API fixed actor, request, payload, target and literal deadline reject before dispatch',async()=>{
 for(const opts of [{actor:row.id},{role:'editor'},{config:{...pack.config,expires_at:'2000-01-01T00:00:00Z'}},{config:{...pack.config,workspace_url:'https://wrong.invalid/workspace.html'}}]){
  const f=fixture(opts);await f.api.completeMagicLink(fragment);assert.equal(f.api.boundSaveAvailable(),false);await assert.rejects(f.api.saveUrlResult(intent,{isCurrent:()=>true}));assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
 }
 const f=fixture();await f.api.completeMagicLink(fragment);
 for(const patch of [{opportunity_id:row.id},{request_id:row.id},{expected_version:1},{payload:{...payload,extra:'changed'}}])await assert.rejects(f.api.saveUrlResult({...intent,...patch},{isCurrent:()=>true}));
 assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
 assert.equal(await f.api.saveUrlResult(intent,{isCurrent:()=>true}),row.id);assert.deepEqual(JSON.parse(f.calls.at(-1).options.body).p_payload,payload);
});
test('bound GET verifies known UUID, full frozen artifact and request hash; session changes invalidate read',async()=>{
 const f=fixture();await f.api.completeMagicLink(fragment);assert.deepEqual(await f.api.readBoundUrlResult(row.id),row);
 const get=f.calls.at(-1);assert.equal(get.options.method,'GET');assert.equal(get.u.searchParams.get('first_result_request_id'),'eq.'+m.request_id);
 for(const patch of [{id:m.actor_id},{created_by:row.id},{first_result_request_digest:'pg-jsonb-sha256:'+'0'.repeat(64)},{first_result_payload:{...payload,extra:'changed'}},{version_number:2},{status:'approved'}]){
  f.setRows([{...row,...patch}]);await assert.rejects(f.api.readBoundUrlResult(row.id));
 }
 f.setRows([]);assert.equal(await f.api.readBoundUrlResult(row.id),null);f.setRows([row,row]);await assert.rejects(f.api.readBoundUrlResult());
 f.setRows([row]);f.hold();const read=f.api.readBoundUrlResult(row.id);f.api.signOut();await f.api.completeMagicLink(fragment);f.release();await assert.rejects(read,/工作區已變更/);
 assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
});

test('same-tab bounded marker persists attempt before dispatch; failures never restore eligibility',async()=>{
 const {createTrialMarker,trialMarkerKey}=await import('./url-result-trial-marker.mjs');
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 let marker=createTrialMarker(pack.config,()=>storage);assert.equal(marker.read().attempted,false);
 marker.attempt();assert.equal(JSON.parse(values.get(trialMarkerKey)).attempted,true);
 marker=createTrialMarker(pack.config,()=>storage);assert.equal(marker.read().attempted,true);assert.throws(()=>marker.attempt());
 marker=createTrialMarker(pack.config,()=>storage);marker.remember(row.id);
 marker=createTrialMarker(pack.config,()=>storage);assert.equal(marker.read().version_id,row.id);assert.throws(()=>marker.remember(m.actor_id));
 for(const config of [{...pack.config,expires_at:'2000-01-01T00:00:00Z'},{...pack.config,request_id:row.id},{...pack.config,organization_id:row.id}])assert.throws(()=>createTrialMarker(config,()=>storage).read());
 values.set(trialMarkerKey,'broken');assert.throws(()=>createTrialMarker(pack.config,()=>storage).read());
 values.clear();marker=createTrialMarker(pack.config,()=>storage);marker.read();storage.setItem=()=>{throw Error('quota');};assert.throws(()=>marker.attempt());storage.setItem=(key,value)=>values.set(key,value);assert.throws(()=>marker.read(),'failure is sticky in this module');
 values.clear();marker=createTrialMarker(pack.config,()=>storage);marker.read();values.delete(trialMarkerKey);assert.throws(()=>marker.attempt(),'disappearance after initialization is not a fresh trial');
});
