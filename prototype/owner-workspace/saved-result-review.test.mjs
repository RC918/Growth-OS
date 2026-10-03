import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtures} from '../../supabase/drafts/first_result_save/fixtures.mjs';
import {restoreResultReview,reviewFields} from './first-result-review.mjs';
import {validateReport} from './first-result-payload.mjs';
import {createWorkspaceApi} from './workspace-api.mjs';
const actor='10000000-0000-4000-8000-000000000003';
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
async function fixture({role='owner',latest=row,detail=row,parentKind='url_result',hold=false,freshActor=actor,freshRole=role,freshOrg=org,enabled=false,reconcileRow=null}={}){
 let release,started,userReads=0,memberReads=0;const pending=new Promise(r=>started=r),calls=[];
 const api=createWorkspaceApi({origin:'https://synthetic.supabase.co',key:'sb_publishable_synthetic',redirectOrigin:'https://offline.invalid',urlResultSchemaEnabled:true,urlSaveEnabled:enabled,fetchImpl:async(url,options)=>{
  const u=new URL(url);calls.push({u,options});assert.equal(options.headers.Authorization,'Bearer synthetic');if(options.method==='POST'){assert.equal(u.pathname,'/rest/v1/rpc/save_url_result_draft');return {ok:true,json:async()=> '50000000-0000-4000-8000-000000000002'};}assert.equal(options.method,'GET');let body;
  if(u.pathname.endsWith('/user'))body={id:++userReads===1?actor:freshActor};
  else if(u.pathname.endsWith('/organization_members'))body=[{organization_id:++memberReads===1?org:freshOrg,role:memberReads===1?role:freshRole}];
  else{assert.equal(u.searchParams.get('organization_id'),'eq.'+org);
   if(u.pathname.endsWith('/growth_opportunities'))body=[{id:row.opportunity_id,entry_kind:parentKind}];
   else if(u.searchParams.has('first_result_request_id'))body=reconcileRow?[reconcileRow]:[];
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

async function revised(){const review=await restoreResultReview(payload);review.edit('title','New revision title');for(const key of reviewFields)review.check(key,true);await review.confirm();return review.export();}
test('new-version intent binds authoritative actor/base/expected version and immutable source; never dispatches',async()=>{
 const next=await revised(),before=structuredClone(row),f=await fixture();
 const intent=await f.api.prepareUrlRevisionIntent(row,next,{isCurrent:()=>true});
 assert.equal(intent.binding.actor_id,actor);assert.equal(intent.binding.base_version_id,row.id);assert.equal(intent.binding.base_request_digest,row.first_result_request_digest);
 assert.equal(intent.request.expected_version,1);assert.equal(intent.request.opportunity_id,row.opportunity_id);assert.equal(intent.request.organization_id,org);assert.notEqual(intent.request.request_id,row.first_result_request_id);
 assert.deepEqual(intent.request.payload,next);assert.match(intent.intent_digest,/^sha256:[a-f0-9]{64}$/);assert.equal(intent.request.request_digest,undefined);assert.equal(intent.authority.persisted,false);assert.equal(intent.authority.server_authorized,false);assert.equal(intent.authority.owner_approved,false);assert.equal(intent.authority.published,false);
 assert.ok(Object.isFrozen(intent.request.payload.snapshot));await assert.rejects(f.api.saveUrlResult(intent.request,{isCurrent:()=>true}),/尚未開放/);assert.deepEqual(row,before);assert.ok(f.calls.every(c=>c.options.method==='GET'));
 for(const opts of [{freshActor:'10000000-0000-4000-8000-000000000004'},{freshRole:'viewer'},{freshOrg:'10000000-0000-4000-8000-000000000002'},{latest:{...row,id:'50000000-0000-4000-8000-000000000002'}},{detail:{...row,first_result_payload:{...payload,snapshot:{...payload.snapshot,fetched_at:'2026-10-03T01:00:00Z'}}}}]){const f=await fixture(opts);await assert.rejects(f.api.prepareUrlRevisionIntent(row,next,{isCurrent:()=>true}));}
 for(const base of [{...row,organization_id:'wrong'},{...row,id:'wrong'},{...row,version_number:2}]){const f=await fixture();await assert.rejects(f.api.prepareUrlRevisionIntent(base,next,{isCurrent:()=>true}));}
 for(const changed of [{},payload,{...next,snapshot:{...next.snapshot,fetched_at:'2026-10-03T01:00:00Z'}},{...next,review:{...next.review,original_suggestions:{...next.review.original_suggestions,title:'changed original'}}}]){const f=await fixture();await assert.rejects(f.api.prepareUrlRevisionIntent(row,changed,{isCurrent:()=>true}));}
 for(const stop of ['cancel','logout','replace']){const f=await fixture({hold:true});let live=true;const task=f.api.prepareUrlRevisionIntent(row,next,{isCurrent:()=>live});await f.pending;if(stop==='cancel')live=false;else{f.api.signOut();if(stop==='replace')await f.api.completeMagicLink(fragment);}f.release();await assert.rejects(task);}
});

test('assembled revision dispatch rechecks binding/base and uses existing gated Save; exact actor/UUID reconciliation',async()=>{
 const next=await revised(),source=await fixture(),intent=await source.api.prepareUrlRevisionIntent(row,next,{isCurrent:()=>true});
 await assert.rejects(source.api.saveUrlRevision(intent,{isCurrent:()=>true,onDispatch:()=>{throw Error('must stay closed');}}),/尚未開放/);
 const f=await fixture({enabled:true});let dispatched=0;const id=await f.api.saveUrlRevision(intent,{isCurrent:()=>true,onDispatch:()=>dispatched++});assert.equal(dispatched,1);assert.equal(id,'50000000-0000-4000-8000-000000000002');assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
 for(const patch of [{binding:{...intent.binding,actor_id:row.id}},{binding:{...intent.binding,base_version_id:'wrong'}},{binding:{...intent.binding,base_version_id:'50000000-0000-4000-8000-000000000099'}},{request:{...intent.request,expected_version:2}},{request:{...intent.request,organization_id:row.id}},{request:{...intent.request,payload:{}}},{intent_digest:'sha256:wrong'}]){const f=await fixture({enabled:true});await assert.rejects(f.api.saveUrlRevision({...intent,...patch},{isCurrent:()=>true,onDispatch:()=>{}}));assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);}
 for(const stop of ['cancel','logout']){const f=await fixture({enabled:true,hold:true});let live=true;const task=f.api.saveUrlRevision(intent,{isCurrent:()=>live,onDispatch:()=>{}});await f.pending;if(stop==='cancel')live=false;else f.api.signOut();f.release();await assert.rejects(task);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);}
 const saved={...row,id,created_by:actor,version_number:2,first_result_expected_version:1,first_result_request_id:intent.request.request_id,first_result_payload:next,title:next.preview.fields.title.suggested};
 for(const patch of [{},{id:row.id},{created_by:row.id},{status:'approved'},{organization_id:row.id},{first_result_payload:payload}]){const f=await fixture({reconcileRow:{...saved,...patch}});if(Object.keys(patch).length)await assert.rejects(f.api.reconcileUrlResult(intent.request,id,actor));else assert.equal((await f.api.reconcileUrlResult(intent.request,id,actor)).id,id);assert.ok(f.calls.every(c=>c.options.method==='GET'));}
});
