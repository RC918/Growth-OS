import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtures} from '../../supabase/drafts/first_result_save/fixtures.mjs';
import {restoreResultReview,reviewFields} from './first-result-review.mjs';
import {validateReport} from './first-result-payload.mjs';
import {createWorkspaceApi} from './workspace-api.mjs';
const payload=(await fixtures())[0],org='10000000-0000-4000-8000-000000000001';
const row={id:'50000000-0000-4000-8000-000000000001',organization_id:org,opportunity_id:'20000000-0000-4000-8000-000000000001',version_number:1,title:payload.preview.fields.title.suggested,draft_body:payload.preview.fields.description.suggested,status:'draft',created_at:'2026-10-03T00:00:00Z',first_result_request_id:'30000000-0000-4000-8000-000000000001',first_result_expected_version:0,first_result_request_digest:'pg-jsonb-sha256:'+'1'.repeat(64),first_result_payload:payload};
const fragment='#access_token=synthetic&token_type=bearer&expires_in=3600';
test('restored Review preserves source/original suggestions and saved edits; invalidates receipt; cancel restores saved text',async()=>{
 const before=structuredClone(payload),review=await restoreResultReview(payload);
 assert.notEqual(payload.preview.fields.title.suggested,payload.review.original_suggestions.title);
 assert.equal(review.view().fields.title,payload.preview.fields.title.suggested);assert.deepEqual(review.view().original_suggestions,payload.review.original_suggestions);
 assert.equal(review.view().receipt,null);assert.ok(reviewFields.every(k=>review.view().fact_checks[k]===false));
 review.edit('title','Continued edit');for(const key of reviewFields)review.check(key,true);await review.confirm();
 const next=await review.export();await validateReport(next);assert.deepEqual(next.snapshot,payload.snapshot);assert.deepEqual(next.facts,payload.facts);assert.deepEqual(next.review.original_suggestions,payload.review.original_suggestions);assert.equal(next.preview.fields.title.citation_role,'reference_only_for_user_edit');
 review.edit('description','Changed again');assert.equal(review.view().receipt,null);review.cancel();assert.equal(review.view().fields.title,payload.preview.fields.title.suggested);assert.equal(review.view().receipt,null);assert.deepEqual(payload,before);
 await assert.rejects(restoreResultReview({...payload,review:{...payload.review,original_suggestions:{...payload.review.original_suggestions,title:null}}}));
});
test('cancel invalidates late restored confirmation',async()=>{
 let release;const review=await restoreResultReview(payload,{digest:()=>new Promise(r=>release=r)});
 for(const key of reviewFields)review.check(key,true);const pending=review.confirm();await Promise.resolve();review.cancel();release('stale');await assert.rejects(pending,/STALE_REVIEW/);assert.equal(review.view().receipt,null);
});
async function fixture({role='owner',latest=row,detail=row,parentKind='url_result',hold=false}={}){
 let release,started;const pending=new Promise(r=>started=r),calls=[];
 const api=createWorkspaceApi({origin:'https://synthetic.supabase.co',key:'sb_publishable_synthetic',redirectOrigin:'https://offline.invalid',urlResultSchemaEnabled:true,urlSaveEnabled:false,fetchImpl:async(url,options)=>{
  const u=new URL(url);calls.push({u,options});assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer synthetic');let body;
  if(u.pathname.endsWith('/user'))body={id:'synthetic-owner'};
  else if(u.pathname.endsWith('/organization_members'))body=[{organization_id:org,role}];
  else{assert.equal(u.searchParams.get('organization_id'),'eq.'+org);
   if(u.pathname.endsWith('/growth_opportunities'))body=[{id:row.opportunity_id,entry_kind:parentKind}];
   else if(u.searchParams.has('opportunity_id')){assert.equal(u.searchParams.get('opportunity_id'),'eq.'+row.opportunity_id);assert.equal(u.searchParams.get('order'),'version_number.desc');body=[latest];}
   else{assert.equal(u.searchParams.get('id'),'eq.'+row.id);if(hold){started();await new Promise(r=>release=r);}body=[detail];}
  }
  return {ok:true,json:async()=>structuredClone(body)};
 }});await api.completeMagicLink(fragment);return {api,calls,pending,release:()=>release()};
}
test('resume reads exact owner URL draft/latest version and validated payload; denies drift/viewer and stale session with zero POST',async()=>{
 const f=await fixture();assert.deepEqual(await f.api.readReviewBase(row),row);assert.equal(f.calls.length,5);
 for(const opts of [{role:'viewer'},{role:'editor'},{parentKind:'legacy_opportunity'},{latest:{...row,id:'50000000-0000-4000-8000-000000000002',version_number:2}},{detail:{...row,organization_id:'wrong'}},{detail:{...row,first_result_payload:{...payload,snapshot:{...payload.snapshot,version:'wrong'}}}},{detail:{...row,title:'mismatch'}}]){const f=await fixture(opts);await assert.rejects(f.api.readReviewBase(row));assert.ok(f.calls.every(c=>c.options.method==='GET'));}
 for(const replace of [false,true]){const f=await fixture({hold:true}),read=f.api.readReviewBase(row);await f.pending;f.api.signOut();if(replace)await f.api.completeMagicLink(fragment);f.release();await assert.rejects(read,/已變更/);}
});
