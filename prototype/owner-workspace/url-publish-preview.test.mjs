import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createWorkspaceApi} from './workspace-api.mjs';
import {urlPublishPreview} from './url-publish-preview.mjs';
import {fixtures,ids,parent,request,checks} from '../../supabase/drafts/url_review/fixture.mjs';
const payload=(await fixtures())[0],fragment='#access_token=synthetic&token_type=bearer&expires_in=3600';
const row={id:parent(40),organization_id:ids.org,opportunity_id:parent(20),version_number:2,title:payload.preview.fields.title.suggested,draft_body:payload.preview.fields.description.suggested,status:'draft',created_at:'2026-10-04T00:00:00Z',first_result_request_id:request(20),first_result_expected_version:1,first_result_request_digest:'pg-jsonb-sha256:'+'1'.repeat(64),first_result_payload:payload};
const review={id:parent(50),organization_id:ids.org,version_id:row.id,actor_user_id:ids.owner,decision:'approved',url_review_request_id:request(50),url_review_source_digest:payload.snapshot.content_fingerprint,url_review_content_digest:payload.review.content_digest,url_review_version_digest:row.first_result_request_digest,url_review_checks:checks};
async function fixture({role='owner',confirmed=false}={}){
 const calls=[],state={row:structuredClone(row),latest:structuredClone(row),review:confirmed?structuredClone(review):null,role,actor:ids.owner,onRead:()=>{}};
 const api=createWorkspaceApi({origin:'https://synthetic.supabase.co',key:'sb_publishable_synthetic',redirectOrigin:'https://offline.invalid',urlResultSchemaEnabled:true,urlReviewSchemaEnabled:true,urlReviewEnabled:false,reviewMarker:{read:()=>null},fetchImpl:async(url,options)=>{
  const u=new URL(url);calls.push({u,options});assert.equal(options.method,'GET','preview must never dispatch a write');await state.onRead(u);let value;
  if(u.pathname.endsWith('/user'))value={id:state.actor};
  else if(u.pathname.endsWith('/organization_members'))value=[{organization_id:ids.org,role:state.role}];
  else {assert.equal(u.searchParams.get('organization_id'),'eq.'+ids.org);
   if(u.pathname.endsWith('/growth_opportunities'))value=[{id:row.opportunity_id,entry_kind:'url_result'}];
   else if(u.pathname.endsWith('/content_reviews'))value=state.review?[state.review]:[];
   else if(u.pathname.endsWith('/content_versions'))value=[u.searchParams.has('id')?state.row:state.latest];
   else assert.fail(u.pathname);
  }return {ok:true,json:async()=>structuredClone(value)};
 }});await api.completeMagicLink(fragment);return {api,state,calls,run:(options={isCurrent:()=>true})=>api.previewUrlPublication(row,options)};
}
test('unconfirmed and exact reviewed versions show accurate three-field snapshot differences, never publication authority',async()=>{
 for(const confirmed of [false,true]){
  const f=await fixture({confirmed}),result=await f.run();assert.equal(result.target_url,payload.snapshot.final_url);assert.equal(result.binding.version_id,row.id);assert.equal(result.binding.review_id,confirmed?review.id:null);
  assert.equal(result.review_status,confirmed?'exact_version_confirmed':'review_required');assert.equal(result.can_publish,false);assert.equal(result.published,false);assert.equal(result.status,'preview_only');
  assert.deepEqual(result.blockers.map(x=>x.code),[...confirmed?[]:['REVIEW_REQUIRED'],'PUBLICATION_CONFIRMATION_REQUIRED','PLATFORM_UNSELECTED','SITE_UNAUTHORIZED','LIVE_BASELINE_UNKNOWN','PUBLISH_UNAVAILABLE']);
  for(const key of ['title','meta_description','description'])assert.deepEqual(result.fields[key],{before:payload.preview.fields[key].original,after:payload.preview.fields[key].suggested,changed:payload.preview.fields[key].original!==payload.preview.fields[key].suggested});
  assert.ok(Object.isFrozen(result.fields.title));assert.ok(f.calls.every(c=>c.options.method==='GET'));assert.deepEqual(f.state.row,row);
 }
});
test('viewer/editor, missing current callback and foreign/mismatched version are denied',async()=>{
 for(const role of ['viewer','editor']){const f=await fixture({role}),before=f.calls.length;await assert.rejects(f.run());assert.equal(f.calls.length,before);}
 const f=await fixture();await assert.rejects(f.run({}));f.state.row.organization_id=ids.other;await assert.rejects(f.run());
});
test('historical versions, source drift, Review digest/identity/check mismatch and revoked Owner are rejected',async()=>{
 const changes=[f=>f.state.latest.id=parent(99),f=>f.state.row.first_result_payload.snapshot.final_url='https://different.example/page',f=>f.state.review.url_review_source_digest='sha256:'+'0'.repeat(64),f=>f.state.review.version_id=parent(99),f=>f.state.review.url_review_checks.blocking_facts_clear=false,f=>f.state.role='viewer',f=>f.state.actor=ids.owner2];
 for(const change of changes){const f=await fixture({confirmed:true});change(f);await assert.rejects(f.run());}
});
test('changes during reads and cancellation/logout/replaced session cannot return a stale preview',async()=>{
 for(const mode of ['latest','role','source','cancel','logout','replace']){
  const f=await fixture();let live=true,changed=false;
  f.state.onRead=async u=>{if(changed||!u.pathname.endsWith('/content_reviews'))return;changed=true;
   if(mode==='latest')f.state.latest={...f.state.latest,id:parent(99),version_number:3};
   if(mode==='role')f.state.role='viewer';
   if(mode==='source')f.state.row.first_result_payload.snapshot.final_url='https://changed.example/page';
   if(mode==='cancel')live=false;
   if(['logout','replace'].includes(mode)){f.api.signOut();if(mode==='replace')await f.api.completeMagicLink(fragment);}
  };await assert.rejects(f.run({isCurrent:()=>live}));assert.ok(changed);
 }
});
test('panel clears prior preview on edit/error and ignores a late session response; unsafe text stays text',async()=>{
 const dom=new JSDOM('<main></main>');globalThis.document=dom.window.document;
 try{
  const f=await fixture(),value=structuredClone(await f.run());value.fields.title.after='<img src=x onerror=alert(1)>';
  let session={role:'owner'},release,fail=false;
  const api={context:()=>session,previewUrlPublication:()=>fail?Promise.reject(Error('drift')):new Promise(r=>release=r)};
  const panel=urlPublishPreview({api,version:row,isCurrent:()=>true,latest:true});document.querySelector('main').append(panel.root);
  const button=panel.root.querySelector('.publish-preview-read'),body=panel.root.querySelector('.publish-preview-body'),tick=()=>new Promise(r=>setTimeout(r,0));
  button.click();release(value);await tick();assert.ok(body.textContent.includes('<img'));assert.equal(body.querySelector('img'),null);assert.equal(panel.root.querySelector('.publish-unavailable').disabled,true);
  panel.setEditing(true);assert.equal(body.textContent,'');assert.equal(button.disabled,true);panel.setEditing(false);assert.equal(button.disabled,false);
  button.click();panel.setEditing(true);release(value);await tick();assert.equal(body.textContent,'');panel.setEditing(false);
  button.click();session={role:'owner'};release(value);await tick();assert.equal(body.textContent,'');
  panel.root.remove();const next=urlPublishPreview({api,version:row,isCurrent:()=>true,latest:true});document.querySelector('main').append(next.root);fail=true;next.root.querySelector('button').click();await tick();assert.match(next.root.querySelector('.publish-preview-status').textContent,/無法核對/);assert.equal(next.root.querySelector('.publish-preview-body').textContent,'');
 }finally{delete globalThis.document;dom.window.close();}
});
