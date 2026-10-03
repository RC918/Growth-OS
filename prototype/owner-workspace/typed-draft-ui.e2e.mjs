// Real workspace renderer, synthetic transport only. Every response uses the
// requested SELECT projection; this is NOT live Auth or remote readback proof.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fixtures} from '../../supabase/drafts/first_result_save/fixtures.mjs';
const reports = await fixtures();
const stamp = '2026-10-03T00:00:00Z', org = '10000000-0000-4000-8000-000000000001';
const origin = 'http://127.0.0.1:8774';
const server = spawn('python3', ['-m','http.server','8774','--bind','127.0.0.1','--directory','apps/web'], {stdio:'ignore'});
const versionId = (kind,n) => `${kind==='typed'?'50000000':'40000000'}-0000-4000-8000-${String(n).padStart(12,'0')}`;
const parentId='20000000-0000-4000-8000-000000000001';
const fixtureName='合成資料／唯讀顯示驗證，不代表遠端已保存';
const regressionFailures=[];
const listColumns='id,opportunity_id,version_number,title,draft_body,status,created_at,first_result_request_id,first_result_expected_version,first_result_request_digest';
const detailColumns=`organization_id,${listColumns},first_result_payload`;
const project=(row,columns)=>Object.fromEntries(columns.split(',').filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]));
const legacy = (n=1) => ({first_result_request_id:null,first_result_expected_version:null,first_result_request_digest:null,id:versionId('legacy',n),opportunity_id:parentId,version_number:n,title:`Legacy ${n}`,draft_body:'Legacy body',status:'draft',created_at:stamp});
const typed = (n=2,index=2) => {
 const report=structuredClone(reports[index]);
 return {...legacy(n),id:versionId('typed',n),title:report.preview.fields.title.suggested,draft_body:report.preview.fields.description.suggested,
  first_result_payload:report,first_result_request_id:`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`,first_result_expected_version:n-1,first_result_request_digest:'pg-jsonb-sha256:'+String(n).repeat(64)};
};
async function until(check) {
 for(let i=0;i<500;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}
 throw Error('Synthetic transport did not reach the expected barrier');
}
let browser;
try {
 for(let i=0;i<50;i++){try{if((await fetch(origin+'/workspace.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
 for(const width of [1280,390]) {
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}), page=await context.newPage();
  const errors=[],unexpected=[],mutations=[];
  let role='owner',versions=[legacy(),typed()],reviews=[],plans=[],sequence=0,holdMutation=null,releaseMutation=null;
  let holdRead=false,releaseRead=null,renderTicket=0,activeOrg=org;
  let detailReads=0,detailStatus=200,detailChange=null,holdDetails=false;const heldDetails=[];
  let mutationResult='60000000-0000-4000-8000-000000000001';
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===origin) return route.continue();
   if(url.origin!=='https://vhzryhibmpvglzcmfnaa.supabase.co'){unexpected.push(req.url());return route.abort();}
   const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(req.method()!=='GET') {
    mutations.push({path:url.pathname,body:req.postDataJSON()});
    if(!holdMutation || !url.pathname.endsWith('/rpc/'+holdMutation)){unexpected.push(req.method()+' '+url.pathname);return route.abort();}
    const result=mutationResult;
    await new Promise(resolve=>{releaseMutation=resolve;});
    return respond(result);
   }
   const table=url.pathname.split('/').at(-1);
   if(table==='user')return respond({id:'synthetic-'+role});
   if(table==='organization_members')return respond([{organization_id:activeOrg,role}]);
   if(table==='organizations')return respond([{id:activeOrg,name:`${fixtureName} · response ${renderTicket}`}]);
   if(table==='growth_opportunities')return respond([{id:parentId,channel:'organic_search',audience_need:'Synthetic product',proposed_action:'Synthetic action',rationale:'Fixture',status:'approved',evidence_confidence:'low'}]);
   if(table==='opportunity_sources')return respond([{opportunity_id:parentId,source_kind:'public_page',evidence_note:'Synthetic',observed_at:stamp}]);
   if(table==='opportunity_decisions')return respond([{opportunity_id:parentId,decision:'approved',reason:'Synthetic',decided_at:stamp}]);
   if(table==='content_versions') {
    assert.equal(url.searchParams.get('organization_id'),`eq.${activeOrg}`);
    if(url.searchParams.has('id')) {
     detailReads++;assert.equal(url.searchParams.get('select'),detailColumns);assert.equal(url.searchParams.get('limit'),'1');
     const source=versions.find(row=>`eq.${row.id}`===url.searchParams.get('id'));
     let row=source?{...structuredClone(source),organization_id:activeOrg}:null;
     if(detailChange)row=detailChange(row);
     const status=detailStatus;
     const rows=row?[project(row,detailColumns)]:[];
     if(holdDetails)await new Promise(resolve=>heldDetails.push(resolve));
     return respond(status===200?rows:{},status);
    }
    assert.equal(url.searchParams.get('select'),listColumns);assert.equal(url.searchParams.get('limit'),'500');
    const rows=versions.map(row=>project(structuredClone(row),listColumns));
    if(holdRead){holdRead=false;await new Promise(resolve=>{releaseRead=resolve;});}
    return respond(rows);
   }
   if(table==='content_reviews')return respond(reviews);
   if(table==='content_action_plans')return respond(plans);
   if(['business_profiles','sites','search_observation_versions','growth_goals'].includes(table))return respond([]);
   unexpected.push('GET '+url.pathname);return route.abort();
  });
  async function login(){await page.goto(`${origin}/workspace.html?fixture=${++sequence}#access_token=synthetic-${role}&token_type=bearer&expires_in=3600`);await page.locator('#workspace').waitFor({state:'visible'});}
  const waitRendered = ticket => page.waitForFunction(expected=>document.getElementById('organization-name').textContent===expected,`${fixtureName} · response ${ticket}`);
  async function beginRestore(){
   const ticket=++renderTicket;
   await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
   return ticket;
  }
  async function restore(){const ticket=await beginRestore();await waitRendered(ticket);}
  async function finishMutation({refreshes=true}={}) {
   const ticket=refreshes?++renderTicket:renderTicket;
   const response=page.waitForResponse(r=>r.request().method()==='POST' && r.url().endsWith('/rpc/'+holdMutation));
   releaseMutation();await (await response).finished();
   if(refreshes) await waitRendered(ticket);
   // Let fetch continuation paint even when the stale handler correctly does no refresh.
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  }
  async function openTyped(id=versionId('typed',2),scope='.draft-focus') {
   const loader=page.locator(`${scope} .typed-version[data-version-id="${id}"] > .typed-loader`);
   await loader.waitFor();if(!await loader.evaluate(node=>node.open)){await loader.locator(':scope > summary').focus();await page.keyboard.press('Enter');}
   return loader;
  }
  async function waitTyped(id=versionId('typed',2)){await openTyped(id);await page.locator(`.draft-focus .typed-draft[data-version-id="${id}"]`).waitFor();}
  async function finishDetail(index) {
   const response=page.waitForResponse(r=>r.url().includes('/content_versions?')&&new URL(r.url()).searchParams.has('id'));
   heldDetails[index]();await (await response).finished();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  }
  async function noActions(){assert.equal(await page.locator('.opportunity-card form').count(),0);assert.equal(await page.locator('.action-plan-summary').count(),0);assert.doesNotMatch(await page.locator('.opportunity-progress').innerText(),/可規劃|已核准/);}
  await login();assert.equal(detailReads,0,'no payload read until expansion');await noActions();await waitTyped();assert.equal(detailReads,1);
  assert.equal(await page.locator('.typed-incomplete').count(),0);
  const current=page.locator('.draft-focus .typed-draft');
  for(const [key,value] of Object.entries(reports[2].preview.fields)) assert.equal(await current.locator(`[data-field="${key}"]`).textContent(),value.suggested);
  assert.equal((await current.locator('[data-field="title"]').textContent()).length,2000);
  assert.match(await current.innerText(),/待專用審核/);
  for(const summary of await current.locator('summary').all()){await summary.focus();await page.keyboard.press('Enter');}
  assert.deepEqual(JSON.parse(await current.locator('details').last().locator('pre').textContent()).payload,reports[2],'full payload retained');
  assert.ok(reports[2].review.original_suggestions.description.length>2000);
  assert.match(await current.innerText(),/不是 owner approval/);
  assert.match(await current.innerText(),/內容摘要/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('.version-history > summary').click();assert.match(await page.locator('.version-history').innerText(),/Legacy 1/);
  // Closing / reopening source and history details never creates an action.
  await current.locator('summary').first().click();await current.locator('summary').first().click();await noActions();
  reviews=[{version_id:versionId('typed',2),decision:'approved',reviewed_at:stamp,reason:'FORGED APPROVAL'}];
  plans=[{version_id:versionId('typed',2),proposed_path:'/forged',created_at:stamp}];
  await restore();await waitTyped();await noActions();assert.doesNotMatch(await page.locator('.opportunity-card').innerText(),/FORGED APPROVAL|\/forged/);
  // Both mixed orders: legacy latest retains its own actions; typed history never inherits review.
  versions=[typed(1,0),legacy(2)];reviews=[{version_id:versionId('typed',1),decision:'approved',reviewed_at:stamp,reason:'FORGED APPROVAL'}];plans=[];
  await restore();await page.getByRole('button',{name:'核准此版本',exact:true}).waitFor();
  await page.locator('.version-history > summary').click();await openTyped(versionId('typed',1),'.version-history');await page.locator('.version-history .typed-draft').waitFor();
  assert.doesNotMatch(await page.locator('.version-history').innerText(),/FORGED APPROVAL/);
  await page.locator('.compose-draft > summary').click();await page.locator('[name="title"]').fill('unsaved');
  await page.locator('[name="review_reason"]').fill('reason');await page.getByRole('button',{name:'核准此版本',exact:true}).click();
  assert.match(await page.locator('#notice').innerText(),/未儲存/);assert.equal(mutations.length,0);
  // Retain detached handlers, then switch version/source through real refresh.
  await page.evaluate(()=>{window.oldApprove=document.querySelector('.draft-focus .review-form button');window.oldForm=document.querySelector('.draft-form');});
  versions=[legacy(),typed(3,1)];reviews=[];await restore();await waitTyped(versionId('typed',3));
  await page.evaluate(()=>{window.oldApprove.click();window.oldForm.dispatchEvent(new Event('submit',{cancelable:true}));});
  await noActions();assert.equal(mutations.length,0);
  // Missing payload + any surviving marker is typed, never legacy. Partial fields also fail closed.
  for(const damage of ['payload','meta','facts','review','projection','source']) {
   const row=typed();
   if(damage==='payload')row.first_result_payload=null;
   if(damage==='meta')delete row.first_result_payload.preview.fields.meta_description;
   if(damage==='facts')delete row.first_result_payload.facts;
   if(damage==='review')delete row.first_result_payload.review;
   if(damage==='projection')row.title='wrong projection';
   if(damage==='source')row.first_result_payload.review.source_version='wrong source';
   versions=[row];await restore();await openTyped();await noActions();
   if(damage==='payload') {await page.locator('.typed-read-feedback[role="alert"]').waitFor();assert.match(await page.locator('.typed-read-feedback').innerText(),/資料缺漏/);}
   else {await page.locator('.typed-incomplete').waitFor();assert.deepEqual(JSON.parse(await current.locator('details').last().locator('pre').textContent()).payload,row.first_result_payload,`fresh payload: ${damage}`);}
  }
  const hostile=typed();hostile.first_result_payload.preview.fields.description.suggested='<img src=x onerror="window.XSS=1"><script>window.XSS=1</script>';
  hostile.draft_body=hostile.first_result_payload.preview.fields.description.suggested;
  versions=[hostile];await restore();await waitTyped();
  assert.equal(await page.locator('.typed-draft img,.typed-draft script').count(),0);assert.equal(await page.evaluate(()=>window.XSS),undefined);
  assert.equal(await current.locator('[data-field="description"]').textContent(),hostile.draft_body);
  await page.locator('#sign-out').click();role='viewer';versions=[legacy(),typed()];await login();await waitTyped();await noActions();
  assert.equal(mutations.length,0);
  // Each missing/partial discriminator blocks legacy forms before any detail GET.
  for(const key of ['first_result_request_id','first_result_expected_version','first_result_request_digest']) {
   const row=typed();delete row[key];versions=[row];const count=detailReads;await restore();
   await page.locator('.typed-version > .typed-incomplete').waitFor();await noActions();assert.equal(detailReads,count);
  }
  const missingLegacy=legacy();delete missingLegacy.first_result_request_digest;versions=[missingLegacy];await restore();await noActions();
  assert.equal(await page.locator('.typed-loader').count(),0);
  versions=[typed()];await restore();
  for(const [key,value] of [['organization_id','90000000-0000-4000-8000-000000000001'],['id',versionId('typed',9)],['opportunity_id','90000000-0000-4000-8000-000000000002'],['version_number',99],['first_result_request_id',null],['first_result_expected_version',99],['first_result_request_digest','pg-jsonb-sha256:'+'f'.repeat(64)]]) {
   detailChange=row=>({...row,[key]:value});await restore();await openTyped();
   await page.locator('.typed-read-feedback[role="alert"]').waitFor();assert.match(await page.locator('.typed-read-feedback').innerText(),/不一致/);
   assert.equal(await page.locator('.typed-draft').count(),0);await noActions();
  }
  detailChange=null;
  for(const status of [401,403]) {
   detailStatus=status;await restore();await openTyped();await page.locator('.typed-read-feedback[role="alert"]').waitFor();
   assert.match(await page.locator('.typed-read-feedback').innerText(),new RegExp(`HTTP ${status}`));await noActions();
   detailStatus=200;await page.getByRole('button',{name:'重新讀取此版本',exact:true}).click();await current.waitFor();
  }
  // Close and reopen creates a new request; release newer before older.
  await restore();holdDetails=true;detailChange=row=>({...row,organization_id:'90000000-0000-4000-8000-000000000001'});const oldIndex=heldDetails.length;
  const lazy=await openTyped();await until(()=>heldDetails.length===oldIndex+1);const count=detailReads;
  await lazy.evaluate(node=>{node.open=true;node.open=true;});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(detailReads,count,'repeat expansion does not duplicate in-flight request');
  await lazy.locator(':scope > summary').click();assert.equal(await current.count(),0);detailChange=null;
  await lazy.locator(':scope > summary').click();await until(()=>heldDetails.length===oldIndex+2);
  await finishDetail(oldIndex+1);await current.waitFor();await finishDetail(oldIndex);assert.equal(await current.count(),1);assert.equal(await page.locator('.typed-read-feedback[role=alert]').count(),0,'late old mismatch cannot overwrite newer success');
  // Closing while pending cannot revive a closed panel or retain its payload.
  await restore();const closeIndex=heldDetails.length;const closePanel=await openTyped();await until(()=>heldDetails.length===closeIndex+1);
  await closePanel.locator(':scope > summary').click();await finishDetail(closeIndex);
  assert.equal(await closePanel.evaluate(node=>node.open),false);assert.equal(await current.count(),0);
  // Refresh invalidates pending read even when the version ID is unchanged.
  const refreshIndex=heldDetails.length;await openTyped();await until(()=>heldDetails.length===refreshIndex+1);await restore();
  await finishDetail(refreshIndex);assert.equal(await current.count(),0);assert.equal(await page.locator('.typed-loader').evaluate(node=>node.open),false);
  // Closing history also cancels its open child and does not batch-reload children on return.
  versions=[typed(1,0),legacy(2)];await restore();await page.locator('.version-history > summary').click();
  const historyIndex=heldDetails.length;await openTyped(versionId('typed',1),'.version-history');await until(()=>heldDetails.length===historyIndex+1);
  await page.locator('.version-history > summary').click();await finishDetail(historyIndex);assert.equal(await page.locator('.typed-draft').count(),0);
  const historyCount=detailReads;await page.locator('.version-history > summary').click();
  assert.equal(await page.locator('.version-history .typed-loader').evaluate(node=>node.open),false);assert.equal(detailReads,historyCount);
  versions=[typed()];await restore();
  // Signout then another org's same version ID cannot accept the old session response.
  const sessionIndex=heldDetails.length;await openTyped();await until(()=>heldDetails.length===sessionIndex+1);
  await page.locator('#sign-out').click();await finishDetail(sessionIndex);assert.equal(await current.count(),0);
  activeOrg='10000000-0000-4000-8000-000000000002';holdDetails=false;versions=[typed(2,1)];
  await login();await waitTyped();assert.equal(await current.count(),1);assert.equal(await current.locator('[data-field=title]').textContent(),reports[1].preview.fields.title.suggested);await noActions();
  assert.equal(mutations.length,0);await page.locator('#sign-out').click();activeOrg=org;
  // Legacy approved version still gets a plan; old plan handler is invalid after source/version refresh.
  role='owner';versions=[legacy()];reviews=[{version_id:versionId('legacy',1),decision:'approved',reviewed_at:stamp,reason:'legacy approved'}];await login();
  await page.locator('.action-plan-form').waitFor();
  await page.locator('[name="proposed_path"]').fill('/synthetic');await page.locator('[name="success_signal"]').fill('synthetic');await page.locator('[name="rollback_plan"]').fill('synthetic');
  await page.evaluate(()=>window.oldPlan=document.querySelector('.action-plan-form'));
  versions=[typed()];reviews=[];await restore();await waitTyped();await page.evaluate(()=>window.oldPlan.dispatchEvent(new Event('submit',{cancelable:true})));assert.equal(mutations.length,0);
  // A pending LEGACY request is sent once. Its late response cannot overwrite a new typed card.
  versions=[legacy()];await restore();await page.getByRole('button',{name:'核准此版本',exact:true}).waitFor();
  await page.locator('[name="review_reason"]').fill('synthetic legacy');holdMutation='review_content_draft';
  await page.evaluate(()=>{const b=document.querySelector('.draft-focus .review-form button');b.click();b.dispatchEvent(new MouseEvent('click'));});
  await until(()=>releaseMutation);assert.equal(mutations.length,1);assert.equal(mutations[0].body.p_version_id,versionId('legacy',1));
  versions=[typed(4,1)];await restore();await waitTyped(versionId('typed',4));await finishMutation({refreshes:false});await noActions();assert.equal(await page.locator('.draft-result').count(),0);
  // Out-of-order dashboard replies cannot restore stale legacy controls.
  versions=[legacy()];holdRead=true;await beginRestore();await until(()=>releaseRead);
  versions=[typed(5,0)];await restore();await waitTyped(versionId('typed',5));releaseRead();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await noActions();
  // pagehide invalidates retained cards before a bfcache refresh, even if a click is dispatched programmatically.
  versions=[legacy()];await restore();await page.getByRole('button',{name:'核准此版本',exact:true}).waitFor();await page.locator('[name="review_reason"]').fill('old');
  await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide'));document.querySelector('.draft-focus .review-form button').click();});assert.equal(mutations.length,1);
  versions=[typed()];await restore();await waitTyped();await noActions();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // Create returns an actual version UUID, not the review/plan record UUID.
  for(const scenario of ['normal','newer','missing','late']) {
   versions=[legacy()];reviews=[];await restore();
   await page.locator('.compose-draft > summary').click();
   await page.locator('[name="title"]').fill('New legacy');await page.locator('[name="draft_body"]').fill('New body');
   releaseMutation=null;holdMutation='create_content_draft';mutationResult=versionId('legacy',2);
   await page.locator('.draft-form').evaluate(form=>{form.dispatchEvent(new Event('submit',{cancelable:true}));form.dispatchEvent(new Event('submit',{cancelable:true}));});
   await until(()=>releaseMutation);
   const sent=mutations.at(-1);assert.equal(sent.body.p_organization_id,org);
   assert.equal(sent.body.p_title,'New legacy');assert.equal(sent.body.p_draft_body,'New body');assert.equal(sent.body.p_opportunity_id,parentId);
   const created={...legacy(2),title:sent.body.p_title,draft_body:sent.body.p_draft_body};
   if(scenario==='normal') versions=[legacy(),created];
   if(scenario==='newer') versions=[legacy(),created,legacy(3)];
   if(scenario==='late'){versions=[legacy(),legacy(3)];await restore();}
   await finishMutation({refreshes:scenario!=='late'});
   const badges=await page.locator('.draft-result').count();
   try {
    assert.equal(badges,scenario==='normal'?1:0,`create ${scenario}: returned v2 must never badge v1/v3`);
    const expectedVersion=scenario==='normal'?2:scenario==='missing'?1:3;
    assert.equal(await page.locator('.draft-focus').getAttribute('data-version-id'),versionId('legacy',expectedVersion));
    if(scenario==='normal'){
     assert.match(await page.locator('.draft-focus h4').innerText(),/第 2 版/);
     assert.equal(await page.locator('.draft-focus strong').textContent(),sent.body.p_title);
    }
    if(scenario==='newer'||scenario==='missing') assert.match(await page.locator('#notice').innerText(),/目前草稿.*不同或尚未讀回/);
    console.log(`PASS ${width}px create UUID attribution: ${scenario}`);
   } catch(error) {regressionFailures.push(`${width}px ${error.message}`);console.error(`FAIL ${width}px ${error.message}`);}
  }
  // Legacy plan still sends its exact input once; its RPC result is a plan ID.
  versions=[legacy()];reviews=[{version_id:versionId('legacy',1),decision:'approved',reviewed_at:stamp,reason:'approved'}];await restore();
  await page.locator('[name="proposed_path"]').fill('/synthetic');await page.locator('[name="success_signal"]').fill('signal');await page.locator('[name="rollback_plan"]').fill('rollback');
  releaseMutation=null;holdMutation='plan_content_action';mutationResult='60000000-0000-4000-8000-000000000002';
  await page.locator('.action-plan-form').evaluate(form=>{form.dispatchEvent(new Event('submit',{cancelable:true}));form.dispatchEvent(new Event('submit',{cancelable:true}));});
  await until(()=>releaseMutation);assert.equal(mutations.at(-1).body.p_version_id,versionId('legacy',1));assert.equal(mutations.at(-1).body.p_proposed_path,'/synthetic');
  await finishMutation();assert.equal(await page.locator('.draft-result').count(),1);
  assert.equal(mutations.length,6,'one legacy review, four creates, one plan; no typed mutations');
  assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  await context.close();console.log(`PASS ${width}px: complete typed fields/evidence, Unicode, owner/viewer, mixed histories, malformed data, HTML safety, keyboard details, zero typed mutations, legacy guard/late response/repeated clicks, stale refresh and page return, strict lightweight SELECT + scoped lazy payload reads`);
 }
 assert.deepEqual(regressionFailures,[],'create result must belong to the exact returned version');
} finally {if(browser)await browser.close();server.kill();}
