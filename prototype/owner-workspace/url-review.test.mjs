import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createWorkspaceApi} from './workspace-api.mjs';
import {createRevisionMarker} from './url-result-trial-marker.mjs';
import {fixtures,ids,parent,request,checks} from '../../supabase/drafts/url_review/fixture.mjs';
const payload=(await fixtures())[0],fragment='#access_token=synthetic&token_type=bearer&expires_in=3600',key='growth-os:url-review-attempt:v1';
const row={id:parent(40),organization_id:ids.org,opportunity_id:parent(20),version_number:2,title:payload.preview.fields.title.suggested,draft_body:payload.preview.fields.description.suggested,status:'draft',created_at:'2026-10-04T00:00:00Z',first_result_request_id:request(20),first_result_expected_version:1,first_result_request_digest:'pg-jsonb-sha256:'+'1'.repeat(64),first_result_payload:payload};
async function fixture({role='owner',enabled=true,values=new Map(),actor=ids.owner,hold=false}={}){
 let release,started,stored=null;const startedPromise=new Promise(r=>started=r),calls=[];
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},marker=createRevisionMarker(()=>storage,key);
 const api=createWorkspaceApi({origin:'https://synthetic.supabase.co',key:'sb_publishable_synthetic',redirectOrigin:'https://offline.invalid',urlResultSchemaEnabled:true,urlReviewEnabled:enabled,reviewMarker:marker,fetchImpl:async(url,options)=>{
  const u=new URL(url);calls.push({u,options});let value;
  if(u.pathname.endsWith('/user'))value={id:actor};
  else if(u.pathname.endsWith('/organization_members'))value=[{organization_id:ids.org,role}];
  else if(options.method==='POST'){
   assert.equal(u.pathname,'/rest/v1/rpc/review_url_result');const body=JSON.parse(options.body);assert.equal(marker.read().request_id,body.p_request_id);
   stored={id:parent(50),organization_id:ids.org,version_id:row.id,actor_user_id:actor,decision:'approved',url_review_request_id:body.p_request_id,url_review_source_digest:body.p_source_digest,url_review_content_digest:body.p_content_digest,url_review_version_digest:body.p_version_digest,url_review_checks:body.p_checks};value=stored.id;
  }else{
   assert.equal(u.searchParams.get('organization_id'),'eq.'+ids.org);
   if(u.pathname.endsWith('/growth_opportunities'))value=[{id:row.opportunity_id,entry_kind:'url_result'}];
   else if(u.pathname.endsWith('/content_reviews'))value=stored?[stored]:[];
   else{if(hold&&u.searchParams.has('id')){started();await new Promise(r=>release=r);}value=[row];}
  }
  return {ok:true,json:async()=>structuredClone(value)};
 }});await api.completeMagicLink(fragment);return {api,values,storage,marker,calls,startedPromise,release:()=>release(),setReview:r=>stored=r};
}
const posts=f=>f.calls.filter(c=>c.options.method==='POST');
test('historical closed fixture retains exact bytes; absent schema/false Review gate cannot read or POST',async()=>{
 assert.equal(createHash('sha256').update(await readFile(new URL('../../supabase/drafts/url_result/revision-bound/owner-candidate-20261004T060000Z/preview-closed-config.mjs',import.meta.url))).digest('hex'),'fe8bfa6ea7070d89059fa591ed68aec11624a4b4553b380589071473f0bcf38b');
 const f=await fixture({enabled:false}),before=f.calls.length;assert.equal(f.api.urlReviewAvailable(),false);await assert.rejects(f.api.readUrlReview(row),/尚未開放/);await assert.rejects(f.api.confirmUrlReview(row,checks,{isCurrent:()=>true}),/尚未開放/);assert.equal(f.calls.length,before);
});
test('viewer/editor, missing current callback and incomplete checks never dispatch',async()=>{
 for(const role of ['viewer','editor']){const f=await fixture({role});await assert.rejects(f.api.confirmUrlReview(row,checks,{isCurrent:()=>true}));assert.equal(posts(f).length,0);}
 for(const args of [[checks,{}],[{...checks,blocking_facts_clear:false},{isCurrent:()=>true}],[{...checks,extra:true},{isCurrent:()=>true}]]){const f=await fixture();await assert.rejects(f.api.confirmUrlReview(row,...args));assert.equal(posts(f).length,0);}
});
test('metadata persist-before-dispatch and fail-closed storage; revision marker remains separate',async()=>{
 for(const mode of ['denied','noop','corrupt']){
  const f=await fixture();f.api.reviewRecovery();
  if(mode==='corrupt')f.values.set(key,'broken');else f.storage.setItem=mode==='denied'?()=>{throw Error('denied');}:()=>{};
  await assert.rejects(f.api.confirmUrlReview(row,checks,{isCurrent:()=>true}));assert.equal(posts(f).length,0);
 }
 const f=await fixture();f.values.set('growth-os:url-revision-attempt:v1','unrelated fixture marker');await f.api.confirmUrlReview(row,checks,{isCurrent:()=>true});assert.equal(posts(f).length,1);assert.equal(f.values.get('growth-os:url-revision-attempt:v1'),'unrelated fixture marker');assert.equal(Object.values(f.api.reviewRecovery()).some(v=>v&&typeof v==='object'),false);
});
test('overlapping confirmation cannot allocate a second POST; recovery is original request GET only',async()=>{
 const f=await fixture();const results=await Promise.allSettled([f.api.confirmUrlReview(row,checks,{isCurrent:()=>true}),f.api.confirmUrlReview(row,checks,{isCurrent:()=>true})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(posts(f).length,1);
 const expected=await f.api.readUrlReview(row);assert.equal(expected.id,parent(50));assert.equal(f.marker.read().resolved,true);
 await assert.rejects(f.api.confirmUrlReview(row,checks,{isCurrent:()=>true}));
 const unknown=await fixture({values:f.values});assert.equal(await unknown.api.readUrlReview(row),null);assert.equal(posts(unknown).length,0);
 for(const patch of [{id:parent(99)},{organization_id:ids.other},{version_id:parent(99)},{actor_user_id:ids.owner2},{url_review_request_id:request(99)},{url_review_source_digest:'sha256:'+'f'.repeat(64)},{url_review_version_digest:'pg-jsonb-sha256:'+'f'.repeat(64)},{url_review_checks:{...checks,source:false}}]){
  unknown.setReview({...expected,...patch});await assert.rejects(unknown.api.readUrlReview(row));assert.equal(posts(unknown).length,0);
 }
 unknown.setReview(expected);assert.equal((await unknown.api.readUrlReview(row)).id,expected.id);
});
test('cancellation, logout and replacement session during preflight prevent POST and late read success',async()=>{
 for(const kind of ['cancel','logout','replace']){
  const f=await fixture({hold:true});let live=true;const pending=f.api.confirmUrlReview(row,checks,{isCurrent:()=>live});await f.startedPromise;
  if(kind==='cancel')live=false;else{f.api.signOut();if(kind==='replace')await f.api.completeMagicLink(fragment);}f.release();await assert.rejects(pending);assert.equal(posts(f).length,0);
 }
 const f=await fixture({hold:true}),pending=f.api.readUrlReview(row);await f.startedPromise;f.api.signOut();await f.api.completeMagicLink(fragment);f.release();await assert.rejects(pending);assert.equal(posts(f).length,0);
});
