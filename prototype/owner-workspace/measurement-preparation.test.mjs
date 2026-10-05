import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createWorkspaceApi} from './workspace-api.mjs';
import {measurementPreparation} from './measurement-preparation.mjs';
import {preview} from './search-baseline.mjs';
import {saveSnapshot} from './baseline-snapshot.mjs';
import {fixtures,ids,parent,request} from '../../supabase/drafts/url_review/fixture.mjs';
const payload=(await fixtures())[0],fragment='#access_token=synthetic&token_type=bearer&expires_in=3600';
const row={id:parent(40),organization_id:ids.org,opportunity_id:parent(20),version_number:2,title:payload.preview.fields.title.suggested,draft_body:payload.preview.fields.description.suggested,status:'draft',created_at:'2026-10-04T00:00:00Z',first_result_request_id:request(20),first_result_expected_version:1,first_result_request_digest:'pg-jsonb-sha256:'+'1'.repeat(64),first_result_payload:payload};
async function fixture(role='owner'){
 const calls=[],state={row:structuredClone(row),latest:{id:row.id,version_number:row.version_number},role,actor:ids.owner,org:ids.org,missing:false,observations:[],detail:null,onRead:()=>{}};
 const api=createWorkspaceApi({origin:'https://synthetic.supabase.co',key:'sb_publishable_synthetic',redirectOrigin:'https://offline.invalid',urlResultSchemaEnabled:true,fetchImpl:async(url,options)=>{
  const u=new URL(url);calls.push({u,options});assert.equal(options.method,'GET');await state.onRead(u);let value;
  if(u.pathname.endsWith('/user'))value={id:state.actor};
  else if(u.pathname.endsWith('/organization_members'))value=state.missing?[]:[{organization_id:state.org,role:state.role}];
  else{assert.equal(u.searchParams.get('organization_id'),'eq.'+ids.org);
   if(u.pathname.endsWith('/growth_opportunities'))value=[{id:row.opportunity_id,entry_kind:'url_result'}];
   else if(u.pathname.endsWith('/search_observation_versions'))value=u.searchParams.has('id')?[state.detail??state.observations.find(r=>'eq.'+r.id===u.searchParams.get('id'))].filter(Boolean):state.observations.map(({id,organization_id,created_at})=>({id,organization_id,created_at}));
   else if(u.pathname.endsWith('/content_versions'))value=[u.searchParams.has('id')?state.row:state.latest];else assert.fail(u.pathname);
  }return {ok:true,json:async()=>structuredClone(value)};
 }});await api.completeMagicLink(fragment);return {api,state,calls,run:(options={latest:true,isCurrent:()=>true})=>api.readMeasurementPreparation(row,options)};
}
const meta={origin:new URL(payload.snapshot.final_url).origin,type:'web',start:'2026-09-01',end:'2026-09-02',exported:'2026-09-05T00:00:00Z'};
const observation=(kind='zero')=>({id:parent(60),organization_id:ids.org,created_at:'2026-09-06T00:00:00Z',payload:JSON.parse(saveSnapshot(preview('date,clicks,impressions\n2026-09-01,0,0'+(kind==='missing'?'':'\n2026-09-02,0,0'),{...meta,origin:kind==='other'?'https://other.example':meta.origin}),null,{a:kind!=='other'},[{date:'2026-09-03',path:new URL(payload.snapshot.final_url).pathname,note:'Provider claims this page was published'}]))});
test('no data is unknown; no automatic association or fabricated zero for a saved version',async()=>{
 const f=await fixture(),out=await f.run();assert.equal(out.binding.id,row.id);assert.equal(out.binding.candidate_url,payload.snapshot.final_url);assert.equal(out.background,null);assert.deepEqual(out.choices,[]);assert.equal(out.publication.status,'unverified');assert.equal(out.publication.published_at,null);assert.equal(out.page_effect.clicks,null);assert.equal(out.page_effect.impressions,null);assert.equal(out.page_baseline.status,'unknown');assert.equal(out.page_followup.status,'unknown');
});
test('same-origin/path statements, explicit zero, missing days and unrelated origins stay unlinked website context',async()=>{
 for(const role of ['owner','viewer','editor'])for(const kind of ['zero','missing','other']){
  const f=await fixture(role),obs=observation(kind);f.state.observations=[obs];
  assert.equal((await f.run()).background,null,'listing never automatically picks a same-origin observation');
  const out=await f.run({latest:true,isCurrent:()=>true,observationId:obs.id}),bg=out.background;
  assert.equal(bg.page_version_linked,false);assert.equal(bg.scope,'website_unlinked');assert.equal(bg.periods.baseline.clicks,0);assert.equal(bg.periods.baseline.impressions,0);assert.equal(bg.periods.baseline.ctr,null);assert.equal(bg.periods.subsequent,null);
  assert.deepEqual(bg.periods.baseline.missing,kind==='missing'?['2026-09-02']:[]);assert.equal(out.page_effect.clicks,null);assert.equal(out.page_effect.causal_claim,false);assert.equal(out.publication.status,'unverified');assert.equal(out.page_baseline.status,'unknown');
  assert.match(bg.report.markdown,kind==='other'?/提供者聲明/:/合成範例/);assert.match(bg.report.markdown,/無法將差異歸因/);assert.ok(Object.isFrozen(bg));assert.deepEqual(f.state.observations,[obs]);assert.ok(f.calls.every(c=>c.options.method==='GET'));
 }
});
test('same-domain complete periods never become page/version before-after effect',async()=>{
 const f=await fixture(),obs=observation();obs.payload.b=JSON.parse(saveSnapshot(preview('date,clicks,impressions\n2026-09-03,2,10\n2026-09-04,3,10',{...meta,start:'2026-09-03',end:'2026-09-04'}),null,{a:false})).a;f.state.observations=[obs];
 const out=await f.run({latest:true,isCurrent:()=>true,observationId:obs.id});assert.equal(out.background.periods.subsequent.clicks,5);assert.match(out.background.report.markdown,/點擊差額/);assert.equal(out.page_effect.clicks,null);assert.equal(out.page_followup.status,'unknown');assert.equal(out.publication.published_at,null);
});
test('wrong observation org/id, malformed snapshot, absent selection and stale content identities fail closed',async()=>{
 for(const mode of ['list-org','detail-org','detail-id','malformed','unknown-id','version','membership']){
  const f=await fixture(),obs=observation();f.state.observations=[obs];let id=obs.id;
  if(mode==='list-org')obs.organization_id=ids.other;
  if(mode.startsWith('detail')){f.state.detail={...obs};if(mode==='detail-org')f.state.detail.organization_id=ids.other;else f.state.detail.id=parent(99);}
  if(mode==='malformed')obs.payload.a.rows[0].clicks=null;
  if(mode==='unknown-id')id=parent(99);
  if(mode==='version')f.state.latest={id:parent(99),version_number:3};
  if(mode==='membership')f.state.missing=true;
  await assert.rejects(f.run({latest:true,isCurrent:()=>true,observationId:id}));
 }
});
test('version/role/source drift, cancel, logout and replacement while observations load cannot produce stale view',async()=>{
 for(const mode of ['version','role','source','cancel','logout','replace']){
  const f=await fixture();let live=true,seen=false;f.state.onRead=async u=>{if(seen||!u.pathname.endsWith('/search_observation_versions'))return;seen=true;
   if(mode==='version')f.state.latest={id:parent(99),version_number:3};if(mode==='role')f.state.role='viewer';if(mode==='source')f.state.row.first_result_payload.snapshot.final_url='https://changed.example/page';if(mode==='cancel')live=false;
   if(['logout','replace'].includes(mode)){f.api.signOut();if(mode==='replace')await f.api.completeMagicLink(fragment);}
  };await assert.rejects(f.run({latest:true,isCurrent:()=>live}));assert.ok(seen);
 }
});
test('panel clears data on editing/errors and ignores late session/selection; provider text is never HTML',async()=>{
 const dom=new JSDOM('<main></main>');globalThis.document=dom.window.document;
 try{
  const f=await fixture(),obs=observation();f.state.observations=[obs];const out=structuredClone(await f.run({latest:true,isCurrent:()=>true,observationId:obs.id}));out.background.report.summary.provenance='<img src=x onerror=alert(1)>';
  let session={},release,fail=false;const api={context:()=>session,readMeasurementPreparation:()=>fail?Promise.reject(Error('bad observation')):new Promise(r=>release=r)},tick=()=>new Promise(r=>setTimeout(r,0));
  const panel=measurementPreparation({api,version:row,isCurrent:()=>true,latest:true});document.querySelector('main').append(panel.root);const read=panel.root.querySelector('.measurement-read'),body=panel.root.querySelector('.measurement-body');
  read.click();release(out);await tick();assert.ok(body.textContent.includes('<img'));assert.equal(body.querySelector('img'),null);assert.match(body.textContent,/未關聯此頁／版本/);assert.match(body.querySelector('.measurement-outcome').textContent,/未知（不是零）/);
  read.click();panel.setEditing(true);release(out);await tick();assert.equal(body.textContent,'');assert.equal(read.disabled,true);panel.setEditing(false);
  read.click();session={};release(out);await tick();assert.equal(body.textContent,'');
  const next=measurementPreparation({api,version:row,isCurrent:()=>true,latest:true});document.querySelector('main').replaceChildren(next.root);fail=true;next.root.querySelector('button').click();await tick();assert.match(next.root.querySelector('.measurement-status').textContent,/維持未知/);assert.equal(next.root.querySelector('.measurement-body').textContent,'');
 }finally{delete globalThis.document;dom.window.close();}
});

test('publication measurement keeps exact historical binding and rejects foreign version/source/page responses',async()=>{
 for(const mode of ['valid','historical','org','version','source','content','page']){
  const f=await fixture();if(mode==='historical')f.state.latest={id:parent(99),version_number:3};
  const out={binding:{organization_id:row.organization_id,version_id:row.id,source_digest:payload.snapshot.content_fingerprint,content_digest:payload.review.content_digest,version_digest:row.first_result_request_digest},target_url:payload.snapshot.final_url};
  if(mode==='org')out.binding.organization_id=ids.other;if(mode==='version')out.binding.version_id=parent(99);if(mode==='source')out.binding.source_digest='different';if(mode==='content')out.binding.content_digest='different';if(mode==='page')out.target_url='https://other.example/page';
  f.api.wordpressPublication=async()=>out;
  const request=()=>f.api.readPublicationMeasurement(row,{latest:mode!=='historical',isCurrent:()=>true});
  if(['valid','historical'].includes(mode)){const result=await request();assert.equal(result.position,mode==='historical'?'historical':'latest_at_read');}else await assert.rejects(request());
 }
});
test('publication response after logout/replacement or content drift cannot become a measurement result',async()=>{
 for(const mode of ['logout','replace','source']){const f=await fixture();f.api.wordpressPublication=async()=>{
  if(mode==='source')f.state.row.first_result_payload.snapshot.final_url='https://changed.example/page';else{f.api.signOut();if(mode==='replace')await f.api.completeMagicLink(fragment);}
  return {binding:{organization_id:row.organization_id,version_id:row.id,source_digest:payload.snapshot.content_fingerprint,content_digest:payload.review.content_digest,version_digest:row.first_result_request_digest},target_url:payload.snapshot.final_url};
 };await assert.rejects(f.api.readPublicationMeasurement(row,{latest:true,isCurrent:()=>true}));}
});
