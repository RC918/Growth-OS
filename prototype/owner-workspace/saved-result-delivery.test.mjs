import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createWorkspaceApi} from './workspace-api.mjs';
import {savedResultDelivery,savedDeliveryText} from './saved-result-delivery.mjs';
import {fixtures,ids,parent,request} from '../../supabase/drafts/url_review/fixture.mjs';
const payload=(await fixtures())[0],fragment='#access_token=synthetic&token_type=bearer&expires_in=3600';
const row={id:parent(40),organization_id:ids.org,opportunity_id:parent(20),version_number:2,title:payload.preview.fields.title.suggested,draft_body:payload.preview.fields.description.suggested,status:'draft',created_at:'2026-10-04T00:00:00Z',first_result_request_id:request(20),first_result_expected_version:1,first_result_request_digest:'pg-jsonb-sha256:'+'1'.repeat(64),first_result_payload:payload};
async function fixture(role='owner'){
 const calls=[],state={row:structuredClone(row),latest:{id:row.id,version_number:row.version_number},role,actor:ids.owner,org:ids.org,missing:false,onRead:()=>{}};
 const api=createWorkspaceApi({origin:'https://synthetic.supabase.co',key:'sb_publishable_synthetic',redirectOrigin:'https://offline.invalid',urlResultSchemaEnabled:true,fetchImpl:async(url,options)=>{
  const u=new URL(url);calls.push({u,options});assert.equal(options.method,'GET');await state.onRead(u);let value;
  if(u.pathname.endsWith('/user'))value={id:state.actor};
  else if(u.pathname.endsWith('/organization_members'))value=state.missing?[]:[{organization_id:state.org,role:state.role}];
  else{assert.equal(u.searchParams.get('organization_id'),'eq.'+ids.org);
   if(u.pathname.endsWith('/growth_opportunities'))value=[{id:row.opportunity_id,entry_kind:'url_result'}];
   else if(u.pathname.endsWith('/content_versions'))value=[u.searchParams.has('id')?state.row:state.latest];else assert.fail(u.pathname);
  }return {ok:true,json:async()=>structuredClone(value)};
 }});await api.completeMagicLink(fragment);return {api,state,calls,run:(options={latest:true,isCurrent:()=>true})=>api.readSavedUrlDelivery(row,options)};
}
test('latest and explicitly historical exports retain exact payload/source/three fields and no approval claim',async()=>{
 for(const role of ['owner','viewer','editor'])for(const historical of [false,true]){
  const f=await fixture(role);if(historical)f.state.latest={id:parent(99),version_number:3};
  const out=await f.run({latest:!historical,isCurrent:()=>true});assert.deepEqual(out.payload,payload);assert.equal(out.version.id,row.id);assert.equal(out.version.organization_id,ids.org);assert.equal(out.version.position,historical?'historical':'latest_at_read');assert.equal(out.source.candidate_url,payload.snapshot.final_url);
  for(const key of ['title','meta_description','description'])assert.equal(out.fields[key],payload.preview.fields[key].suggested);
  assert.equal(out.published,false);assert.equal(out.publication_authorized,false);assert.equal(out.review_attested_by_export,false);assert.ok(Object.isFrozen(out.payload));assert.deepEqual(f.state.row,row);
  const text=savedDeliveryText(out);assert.ok(text.includes(row.id));assert.ok(text.includes(ids.org));assert.ok(text.includes(out.version.payload_digest));assert.ok(text.includes(historical?'歷史':'讀取時最新'));assert.ok(text.includes('未發布'));assert.ok(f.calls.every(c=>c.options.method==='GET'));
 }
});
test('missing current/classification, stale latest, false history, foreign scope and changed full payload refuse output',async()=>{
 for(const patch of [f=>f.state.latest={id:parent(99),version_number:3},f=>f.state.row.organization_id=ids.other,f=>f.state.row.first_result_request_digest='pg-jsonb-sha256:'+'0'.repeat(64),f=>f.state.row.first_result_payload.snapshot.final_url='https://different.example/page',f=>f.state.missing=true,f=>f.state.role='viewer',f=>f.state.org=ids.other,f=>f.state.actor=ids.owner2]){
  const f=await fixture();patch(f);await assert.rejects(f.run());
 }
 const f=await fixture();await assert.rejects(f.run({latest:true}));await assert.rejects(f.run({isCurrent:()=>true}));await assert.rejects(f.run({latest:false,isCurrent:()=>true}));
});
test('cancel, logout/replacement, role revocation and content drift during reads reject before delivery',async()=>{
 for(const mode of ['cancel','logout','replace','role','content']){
  const f=await fixture();let live=true,seen=0;
  f.state.onRead=async u=>{if(!u.pathname.endsWith('/content_versions')||!u.searchParams.has('id')||++seen!==2)return;
   if(mode==='cancel')live=false;
   if(mode==='role')f.state.role='viewer';
   if(mode==='content')f.state.row.first_result_payload.snapshot.final_url='https://changed.example/page';
   if(['logout','replace'].includes(mode)){f.api.signOut();if(mode==='replace')await f.api.completeMagicLink(fragment);}
  };await assert.rejects(f.run({latest:true,isCurrent:()=>live}));assert.equal(seen,2);
 }
});
test('late prepared output never reaches clipboard after edit/session/visibility change; denied clipboard offers cleared safe fallback',async()=>{
 const dom=new JSDOM('<main></main>'),descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');globalThis.document=dom.window.document;
 let writes=0,denied=false;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async()=>{if(denied)throw Error('denied');writes++;}}}});
 try{
  const f=await fixture(),out=structuredClone(await f.run());out.fields.title='<img src=x onerror=alert(1)>';
  const tick=()=>new Promise(r=>setTimeout(r,0));
  for(const mode of ['edit','session','hidden'])for(const action of ['.saved-copy','.saved-download']){
   let session={},visible=true,release;
   const api={context:()=>session,readSavedUrlDelivery:()=>new Promise(r=>release=r)};
   const panel=savedResultDelivery({api,version:row,isCurrent:()=>visible,latest:true});document.querySelector('main').replaceChildren(panel.root);panel.root.querySelector(action).click();
   if(mode==='edit')panel.setEditing(true);if(mode==='session')session={};if(mode==='hidden')visible=false;
   release(out);await tick();assert.equal(writes,0);assert.equal(panel.root.querySelector('textarea'),null);
  }
  const session={},api={context:()=>session,readSavedUrlDelivery:async()=>out},panel=savedResultDelivery({api,version:row,isCurrent:()=>true,latest:true});document.querySelector('main').replaceChildren(panel.root);
  denied=true;panel.root.querySelector('.saved-copy').click();await tick();const area=panel.root.querySelector('textarea');assert.equal(area.value,savedDeliveryText(out));assert.equal(area.hidden,false);assert.equal(panel.root.querySelector('img'),null);
  panel.setEditing(true);assert.equal(area.value,'');assert.equal(area.isConnected,false);assert.equal(panel.root.querySelector('.saved-copy').disabled,true);
 }finally{delete globalThis.document;if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;dom.window.close();}
});
