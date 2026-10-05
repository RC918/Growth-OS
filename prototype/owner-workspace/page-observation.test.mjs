import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createWorkspaceApi} from './workspace-api.mjs';
import {checkPageCsv,pageObservation} from './page-observation.mjs';
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
const csv='date,clicks,impressions\n2026-09-01,0,0',meta={page_url:payload.snapshot.final_url,scope:'page',source:'synthetic',filter:'page equals exact URL; no other filters',type:'web',start:'2026-09-01',end:'2026-09-02',exported:'2026-09-05T00:00:00Z'};
test('page daily applicability preserves explicit zero, missing dates and unverified provenance without publication authority',()=>{
 for(const source of ['synthetic','provider_asserted']){
  const out=checkPageCsv(csv,{...meta,source},meta.page_url);assert.equal(out.applicable,true);assert.equal(out.source,source);assert.equal(out.clicks,0);assert.equal(out.impressions,0);assert.equal(out.ctr,null);assert.deepEqual(out.missing,['2026-09-02']);assert.equal(out.complete,false);assert.deepEqual(out.rows,[{date:'2026-09-01',clicks:0,impressions:0}]);assert.equal(out.publication.published_at,null);assert.equal(out.version_effect.clicks,null);assert.equal(out.version_effect.causal_claim,false);
 }
 const out=checkPageCsv(csv+'\n2026-09-02,2,10',meta,meta.page_url);assert.equal(out.complete,true);assert.equal(out.clicks,2);assert.equal(out.ctr,.2);
});
test('other page, query or site aggregates cannot become page baseline, even on same origin',()=>{
 for(const patch of [{page_url:meta.page_url+'other'},{page_url:meta.page_url+'?variant=2'},{page_url:'https://other.example/page'},{scope:'site'}]){
  const out=checkPageCsv(csv,{...meta,...patch},meta.page_url);assert.equal(out.applicable,false);assert.match(out.reason,/不可作為此頁基線/);assert.equal(out.version_effect.clicks,null);
 }
});
test('CSV and metadata reject invalid inputs and self-granted verification fields',()=>{
 for(const text of ['date,clicks,impressions','date,clicks,impressions\n2026-09-01,,0',csv+'\n2026-09-01,1,1','date,clicks,impressions\n2026-09-03,0,0','date,clicks,impressions\n2026-09-01,1,0','date,clicks,impressions\n2026-09-01,-1,1','{"verified":true}',csv+' '.repeat(1000000)])assert.throws(()=>checkPageCsv(text,meta,meta.page_url));
 for(const patch of [{source:'verified'},{verified:true},{published_at:'2026-09-01'},{filter:''},{scope:''},{type:'all'},{start:'2026-02-30'},{exported:'2026-09-05'},{page_url:'https://user:pass@example.com/page'},{page_url:meta.page_url+'#part'}])assert.throws(()=>checkPageCsv(csv,{...meta,...patch},meta.page_url));
});
const tick=()=>new Promise(r=>setTimeout(r,0));
function mount(api,{isCurrent=()=>true,latest=true}={}){
 const panel=pageObservation({api,version:row,isCurrent,latest});document.querySelector('main').replaceChildren(panel.root);
 const form=panel.root.querySelector('form');for(const [key,value]of Object.entries(meta))form.elements.namedItem(key).value=value;
 const file=form.elements.namedItem('csv');Object.defineProperty(file,'files',{configurable:true,value:[{size:csv.length,arrayBuffer:async()=>new TextEncoder().encode(csv).buffer}]});
 return {...panel,form,file,submit:()=>form.dispatchEvent(new document.defaultView.Event('submit',{cancelable:true,bubbles:true})),body:panel.root.querySelector('.page-data-body'),status:panel.root.querySelector('.page-data-status')};
}
async function withDom(run){const dom=new JSDOM('<main></main>');globalThis.document=dom.window.document;try{await run(dom);}finally{delete globalThis.document;dom.window.close();}}
test('UI reuses exact scoped read, supports historical/viewer, renders only text, and writes nothing',async()=>withDom(async()=>{
 for(const role of ['owner','viewer'])for(const historical of [false,true]){
  const f=await fixture(role);if(historical)f.state.latest={id:parent(99),version_number:3};
  const p=mount(f.api,{latest:!historical});p.form.elements.filter.value='<img src=x onerror=alert(1)>';p.submit();for(let i=0;i<100&&!p.body.textContent;i++)await tick();
  assert.match(p.status.textContent,/檢查完成/);assert.ok(p.body.textContent.includes(row.id));assert.ok(p.body.textContent.includes(ids.org));assert.match(p.body.textContent,historical?/歷史第 2 版/:/讀取時最新第 2 版/);assert.equal(p.body.querySelector('img'),null);assert.ok(p.body.textContent.includes('<img'));assert.match(p.body.textContent,/缺少日期：2026-09-02/);assert.ok(f.calls.every(c=>c.options.method==='GET'));assert.deepEqual(f.state.row,row);
  p.setEditing(true);assert.equal(p.body.textContent,'');assert.equal(p.form.elements.page_url.value,'');assert.equal(p.form.elements.csv.value,'');assert.equal(p.form.querySelector('button').disabled,true);p.setEditing(false);assert.equal(p.form.querySelector('button').disabled,false);
 }
}));
test('wrong org/actor, revoked membership, source/version drift refuse page view',async()=>withDom(async()=>{
 for(const mode of ['org','actor','membership','source','version']){
  const f=await fixture();if(mode==='org')f.state.row.organization_id=ids.other;if(mode==='actor')f.state.actor=ids.owner2;if(mode==='membership')f.state.missing=true;if(mode==='source')f.state.row.first_result_payload.snapshot.final_url='https://different.example/page';if(mode==='version')f.state.latest={id:parent(99),version_number:3};
  const p=mount(f.api);p.submit();for(let i=0;i<100&&!p.status.textContent.startsWith('無法');i++)await tick();assert.match(p.status.textContent,/無法檢查/);assert.equal(p.body.textContent,'');assert.ok(f.calls.every(c=>c.options.method==='GET'));
 }
}));
test('late file or exact-version responses cannot render after edit, input, clear, close or replacement session',async()=>withDom(async dom=>{
 const f=await fixture(),out=await f.run();
 for(const stage of ['file','read'])for(const mode of ['edit','input','clear','hidden','session','remove']){
  let session={},visible=true,release,reads=0;const api={context:()=>session,readSavedUrlDelivery:()=>{reads++;return stage==='read'?new Promise(r=>release=r):Promise.resolve(out);}};
  const p=mount(api,{isCurrent:()=>visible});if(stage==='file')Object.defineProperty(p.file,'files',{value:[{size:10,arrayBuffer:()=>new Promise(r=>release=()=>r(new TextEncoder().encode(csv).buffer))}]});p.submit();await tick();assert.equal(typeof release,'function');
  if(mode==='edit')p.setEditing(true);if(mode==='input')p.form.elements.filter.dispatchEvent(new dom.window.Event('input',{bubbles:true}));if(mode==='clear')p.root.querySelector('.page-data-clear').click();if(mode==='hidden')visible=false;if(mode==='session')session={};if(mode==='remove')p.root.remove();release(out);await tick();assert.equal(p.body.textContent,'');if(stage==='file')assert.equal(reads,0);
 }
}));
test('invalid UTF-8, oversized files and parser errors clear prior results',async()=>withDom(async()=>{
 const f=await fixture(),out=await f.run(),api={context:()=>session,readSavedUrlDelivery:async()=>out},session={};
 for(const bad of [{size:1000001,arrayBuffer:async()=>assert.fail('must not read oversized')},{size:1,arrayBuffer:async()=>new Uint8Array([255]).buffer},{size:2,arrayBuffer:async()=>new TextEncoder().encode('{}').buffer}]){
  const p=mount(api);p.submit();await tick();assert.match(p.status.textContent,/檢查完成/);Object.defineProperty(p.file,'files',{value:[bad]});p.submit();await tick();assert.match(p.status.textContent,/無法檢查/);assert.equal(p.body.textContent,'');
 }
}));
