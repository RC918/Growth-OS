import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceApi} from './workspace-api.mjs';
import {createRevisionMarker} from './url-result-trial-marker.mjs';
import {manifest,source,checks} from '../../supabase/drafts/url_review/bound/candidate.mjs';
const m=await manifest(),{payload}=await source(),bound={...m,enabled:true,expires_at:'2099-01-01T00:00:00.000Z'},fragment='#access_token=synthetic&token_type=bearer&expires_in=3600',key='growth-os:url-review-attempt:v1';
const parent=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row={id:m.version_id,organization_id:m.organization_id,opportunity_id:m.opportunity_id,version_number:2,title:payload.preview.fields.title.suggested,draft_body:payload.preview.fields.description.suggested,status:'draft',created_at:'2026-10-04T05:06:20.121475Z',first_result_request_id:m.save_request_id,first_result_expected_version:1,first_result_request_digest:m.version_digest,first_result_payload:payload};
async function fixture({role='owner',enabled=true,values=new Map(),actor=m.actor_id,hold=false,trial=bound,origin='https://vhzryhibmpvglzcmfnaa.supabase.co',redirectOrigin=new URL(m.workspace_url).origin}={}){
 let release,started,stored=null;const startedPromise=new Promise(r=>started=r),calls=[];
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},marker=createRevisionMarker(()=>storage,key);
 const api=createWorkspaceApi({origin,key:'sb_publishable_synthetic',redirectOrigin,urlResultSchemaEnabled:true,urlReviewEnabled:false,urlReviewSchemaEnabled:true,urlReviewTrial:trial,reviewMarker:marker,fetchImpl:async(url,options)=>{
  const u=new URL(url);calls.push({u,options});let value;
  if(u.pathname.endsWith('/user'))value={id:actor};
  else if(u.pathname.endsWith('/organization_members'))value=[{organization_id:m.organization_id,role}];
  else if(options.method==='POST'){
   assert.equal(u.pathname,'/rest/v1/rpc/review_url_result');const body=JSON.parse(options.body);assert.equal(marker.read().request_id,body.p_request_id);
   stored={id:parent(50),organization_id:m.organization_id,version_id:row.id,actor_user_id:actor,decision:'approved',url_review_request_id:body.p_request_id,url_review_source_digest:body.p_source_digest,url_review_content_digest:body.p_content_digest,url_review_version_digest:body.p_version_digest,url_review_checks:body.p_checks};value=stored.id;
  }else{
   assert.equal(u.searchParams.get('organization_id'),'eq.'+m.organization_id);
   if(u.pathname.endsWith('/growth_opportunities'))value=[{id:row.opportunity_id,entry_kind:'url_result'}];
   else if(u.pathname.endsWith('/content_reviews'))value=stored?[stored]:[];
   else{if(hold&&u.searchParams.has('id')){started();await new Promise(r=>release=r);}value=[row];}
  }
  return {ok:true,json:async()=>structuredClone(value)};
 }});await api.completeMagicLink(fragment);return {api,values,storage,marker,calls,startedPromise,release:()=>release(),setReview:r=>stored=r};
}
const posts=f=>f.calls.filter(c=>c.options.method==='POST');
test('strict bounded discriminator, null/expired/closed and identity/route drift cannot dispatch',async()=>{
 for(const opts of [{trial:false},{trial:0},{trial:''},{trial:{}},{trial:{...bound,kind:'revision'}},{trial:{...bound,expires_at:null}},{trial:{...bound,expires_at:'2000-01-01T00:00:00.000Z'}},{trial:{...bound,enabled:false}},{trial:{...bound,version_number:1}},{trial:null},{actor:parent(9)},{role:'viewer'},{origin:'https://wrong.supabase.co'},{redirectOrigin:'https://wrong.invalid'}]){
  const f=await fixture(opts);assert.equal(f.api.urlReviewCanConfirm(row),false);await assert.rejects(f.api.confirmUrlReview(row,checks,{isCurrent:()=>true}));assert.equal(posts(f).length,0);
 }
});
test('fixed version/payload/source/content/request digest bound before dispatch',async()=>{
 for(const patch of [{version_id:m.v1_id},{opportunity_id:m.v1_id},{save_request_id:m.request_id},{version_digest:'pg-jsonb-sha256:'+'f'.repeat(64)},{source_digest:'sha256:'+'f'.repeat(64)},{content_digest:'sha256:'+'f'.repeat(64)},{payload_canonical_sha256:'f'.repeat(64)},{intent_digest:'sha256:'+'f'.repeat(64)}]){const f=await fixture({trial:{...bound,...patch}});await assert.rejects(f.api.confirmUrlReview(row,checks,{isCurrent:()=>true}));assert.equal(posts(f).length,0);}
 const f=await fixture();await f.api.confirmUrlReview(row,checks,{isCurrent:()=>true});const body=JSON.parse(posts(f)[0].options.body);assert.equal(body.p_request_id,m.request_id);assert.equal(body.p_version_id,m.version_id);assert.equal(body.p_version_digest,m.version_digest);await assert.rejects(f.api.confirmUrlReview(row,checks,{isCurrent:()=>true}));assert.equal(posts(f).length,1);
});
test('closed/expired new session can GET same fixed review, never open generic gate',async()=>{
 const first=await fixture();await first.api.confirmUrlReview(row,checks,{isCurrent:()=>true});const review=await first.api.readUrlReview(row);
 for(const trial of [{...bound,enabled:false},{...bound,enabled:false,expires_at:'2000-01-01T00:00:00.000Z'}]){
  const f=await fixture({trial});f.setReview(review);assert.equal((await f.api.readUrlReview(row)).id,review.id);assert.equal(f.api.urlReviewCanConfirm(row),false);assert.equal(f.api.urlReviewAvailable(row),true);await assert.rejects(f.api.confirmUrlReview(row,checks,{isCurrent:()=>true}));assert.equal(posts(f).length,0);
  for(const c of f.calls.filter(c=>c.u.pathname.endsWith('/content_reviews')))assert.equal(c.u.searchParams.get('url_review_request_id'),'eq.'+m.request_id);
  f.setReview({...review,url_review_request_id:m.save_request_id});await assert.rejects(f.api.readUrlReview(row));f.setReview({...review,actor_user_id:m.v1_id});await assert.rejects(f.api.readUrlReview(row));
 }
});
test('expiry while awaiting version preflight prevents POST',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse(bound.expires_at)-1000});const f=await fixture({hold:true});const pending=f.api.confirmUrlReview(row,checks,{isCurrent:()=>true});await f.startedPromise;t.mock.timers.setTime(Date.parse(bound.expires_at));f.release();await assert.rejects(pending);assert.equal(posts(f).length,0);
});
