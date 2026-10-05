import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWorkspaceApi} from './workspace-api.mjs';
import {createRevisionMarker} from './url-result-trial-marker.mjs';
import {source,root} from '../../supabase/drafts/url_result/revision-bound/candidate.mjs';
const m=JSON.parse(await readFile(new URL('manifest.json',root),'utf8')),s=await source(),id='50000000-0000-4000-8000-000000000002';
const base={id:m.base_version_id,organization_id:m.organization_id,opportunity_id:m.opportunity_id,version_number:1,created_at:'2026-10-03T00:00:00Z',status:'draft',title:s.old.payload.preview.fields.title.suggested,draft_body:s.old.payload.preview.fields.description.suggested,first_result_request_id:m.base_request_id,first_result_expected_version:0,first_result_request_digest:m.base_request_digest,first_result_payload:s.old.payload};
async function fixture(patch={}){
 const trial={...m,kind:'revision',expires_at:'2099-01-01T00:00:00.000Z',...patch},values=new Map(),marker=createRevisionMarker(()=>({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}));let posts=0,saved=null;
 const api=createWorkspaceApi({origin:'https://synthetic.supabase.co',key:'sb_publishable_synthetic',redirectOrigin:new URL(m.workspace_url).origin,urlSaveEnabled:true,urlResultSchemaEnabled:true,urlSaveTrial:trial,revisionMarker:marker,fetchImpl:async(url,options)=>{
  const u=new URL(url);let body;
  if(options.method==='POST'){posts++;body=id;}
  else if(u.pathname.endsWith('/user'))body={id:m.actor_id};
  else if(u.pathname.endsWith('/organization_members'))body=[{organization_id:m.organization_id,role:'owner'}];
  else if(u.pathname.endsWith('/growth_opportunities'))body=[{id:m.opportunity_id,entry_kind:'url_result'}];
  else if(u.searchParams.has('first_result_request_id'))body=saved?[saved]:[];
  else body=[base];
  return {ok:true,json:async()=>structuredClone(body)};
 }});await api.completeMagicLink('#access_token=synthetic&token_type=bearer&expires_in=3600');return {api,posts:()=>posts,marker,setSaved:row=>saved=row};
}
test('revision-bound intent rejects every changed binding, explicit request, payload/intent digest and unbound expiry',async()=>{
 const f=await fixture(),intent=await f.api.prepareUrlRevisionIntent(base,s.payload,{isCurrent:()=>true});assert.equal(intent.intent_digest,m.intent_digest);assert.equal(intent.request.request_id,m.request_id);
 await assert.rejects(f.api.saveUrlResult(intent.request,{isCurrent:()=>true}),/只能經續編/);assert.equal(f.posts(),0);
 await assert.rejects(f.api.prepareUrlRevisionIntent(base,s.payload,{isCurrent:()=>true,requestId:id}));
 for(const patch of [{actor_id:id},{organization_id:id},{opportunity_id:id},{base_version_id:id},{base_request_digest:'wrong'},{base_payload_canonical_sha256:'wrong'},{expected_version:0},{expected_version:2},{request_id:id},{expires_at:null},{expires_at:'2000-01-01T00:00:00.000Z'},{workspace_url:'https://wrong.invalid/workspace.html'},{payload_canonical_sha256:'wrong'},{content_digest:'wrong'},{source_digest:'wrong'},{intent_digest:'wrong'}]){const f=await fixture(patch);await assert.rejects(f.api.prepareUrlRevisionIntent(base,s.payload,{isCurrent:()=>true}));assert.equal(f.posts(),0);}
 for(const kind of ['unknown',null]){const f=await fixture({kind});assert.equal(f.api.boundSaveAvailable(),false);await assert.rejects(f.api.saveUrlRevision(intent,{isCurrent:()=>true,onDispatch:()=>{}}));assert.equal(f.posts(),0);}
});
test('resolved bound request never permits another POST, exact DB request digest required on GET recovery',async()=>{
 const f=await fixture(),intent=await f.api.prepareUrlRevisionIntent(base,s.payload,{isCurrent:()=>true});await f.api.saveUrlRevision(intent,{isCurrent:()=>true,onDispatch:()=>{}});assert.equal(f.posts(),1);
 const row={...base,id,created_by:m.actor_id,version_number:2,title:s.payload.preview.fields.title.suggested,draft_body:s.payload.preview.fields.description.suggested,first_result_request_id:m.request_id,first_result_expected_version:1,first_result_request_digest:m.request_digest,first_result_payload:s.payload};
 f.setSaved({...row,first_result_request_digest:m.base_request_digest});await assert.rejects(f.api.recoverUrlRevision(),/恢復範圍/);assert.equal(f.marker.read().resolved,false);
 f.setSaved(row);assert.equal((await f.api.recoverUrlRevision()).id,id);assert.equal(f.marker.read().resolved,true);await assert.rejects(f.api.saveUrlRevision(intent,{isCurrent:()=>true,onDispatch:()=>{}}));await assert.rejects(f.api.saveUrlResult(intent.request,{isCurrent:()=>true}));assert.equal(f.posts(),1);
});
