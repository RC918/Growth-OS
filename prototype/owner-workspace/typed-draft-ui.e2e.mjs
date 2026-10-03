// Real workspace renderer, synthetic transport only. Extra typed response fields
// deliberately exceed today's unchanged SELECT; this is NOT live readback proof.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fixtures} from '../../supabase/drafts/first_result_save/fixtures.mjs';
const reports = await fixtures();
const stamp = '2026-10-03T00:00:00Z', org = '10000000-0000-4000-8000-000000000001';
const origin = 'http://127.0.0.1:8774';
const server = spawn('python3', ['-m','http.server','8774','--bind','127.0.0.1','--directory','apps/web'], {stdio:'ignore'});
const legacy = (n=1) => ({id:`legacy-${n}`,opportunity_id:'parent',version_number:n,title:`Legacy ${n}`,draft_body:'Legacy body',status:'draft',created_at:stamp});
const typed = (n=2,index=2) => {
 const report=structuredClone(reports[index]);
 return {...legacy(n),id:`typed-${n}`,title:report.preview.fields.title.suggested,draft_body:report.preview.fields.description.suggested,
  first_result_payload:report,first_result_request_id:`request-${n}`,first_result_expected_version:n-1,first_result_request_digest:'pg-jsonb-sha256:synthetic'};
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
  let holdRead=false,releaseRead=null;
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===origin) return route.continue();
   if(url.origin!=='https://vhzryhibmpvglzcmfnaa.supabase.co'){unexpected.push(req.url());return route.abort();}
   const respond=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   if(req.method()!=='GET') {
    mutations.push({path:url.pathname,body:req.postDataJSON()});
    if(!holdMutation || !url.pathname.endsWith('/rpc/'+holdMutation)){unexpected.push(req.method()+' '+url.pathname);return route.abort();}
    await new Promise(resolve=>{releaseMutation=resolve;});
    return respond('synthetic-result');
   }
   const table=url.pathname.split('/').at(-1);
   if(table==='user')return respond({id:'synthetic-'+role});
   if(table==='organization_members')return respond([{organization_id:org,role}]);
   if(table==='organizations')return respond([{id:org,name:'合成資料／唯讀顯示驗證，不代表遠端已保存'}]);
   if(table==='growth_opportunities')return respond([{id:'parent',channel:'organic_search',audience_need:'Synthetic product',proposed_action:'Synthetic action',rationale:'Fixture',status:'approved',evidence_confidence:'low'}]);
   if(table==='opportunity_sources')return respond([{opportunity_id:'parent',source_kind:'public_page',evidence_note:'Synthetic',observed_at:stamp}]);
   if(table==='opportunity_decisions')return respond([{opportunity_id:'parent',decision:'approved',reason:'Synthetic',decided_at:stamp}]);
   if(table==='content_versions') {
    assert.equal(url.searchParams.get('select'),'id,opportunity_id,version_number,title,draft_body,status,created_at');
    assert.equal(url.searchParams.get('organization_id'),`eq.${org}`);
    const rows=structuredClone(versions);
    if(holdRead){holdRead=false;await new Promise(resolve=>{releaseRead=resolve;});}
    return respond(rows);
   }
   if(table==='content_reviews')return respond(reviews);
   if(table==='content_action_plans')return respond(plans);
   if(['business_profiles','sites','search_observation_versions','growth_goals'].includes(table))return respond([]);
   unexpected.push('GET '+url.pathname);return route.abort();
  });
  async function login(){await page.goto(`${origin}/workspace.html?fixture=${++sequence}#access_token=synthetic-${role}&token_type=bearer&expires_in=3600`);await page.locator('#workspace').waitFor({state:'visible'});}
  async function restore(){await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));}
  async function waitTyped(id='typed-2'){await page.locator(`.draft-focus .typed-draft[data-version-id="${id}"]`).waitFor();}
  async function noActions(){assert.equal(await page.locator('.opportunity-card form').count(),0);assert.equal(await page.locator('.action-plan-summary').count(),0);assert.doesNotMatch(await page.locator('.opportunity-progress').innerText(),/可規劃|已核准/);}
  await login();await waitTyped();await noActions();
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
  reviews=[{version_id:'typed-2',decision:'approved',reviewed_at:stamp,reason:'FORGED APPROVAL'}];
  plans=[{version_id:'typed-2',proposed_path:'/forged',created_at:stamp}];
  await restore();await waitTyped();await noActions();assert.doesNotMatch(await page.locator('.opportunity-card').innerText(),/FORGED APPROVAL|\/forged/);
  // Both mixed orders: legacy latest retains its own actions; typed history never inherits review.
  versions=[typed(1,0),legacy(2)];reviews=[{version_id:'typed-1',decision:'approved',reviewed_at:stamp,reason:'FORGED APPROVAL'}];plans=[];
  await restore();await page.getByRole('button',{name:'核准此版本',exact:true}).waitFor();
  await page.locator('.version-history > summary').click();await page.locator('.version-history .typed-draft').waitFor();
  assert.doesNotMatch(await page.locator('.version-history').innerText(),/FORGED APPROVAL/);
  await page.locator('.compose-draft > summary').click();await page.locator('[name="title"]').fill('unsaved');
  await page.locator('[name="review_reason"]').fill('reason');await page.getByRole('button',{name:'核准此版本',exact:true}).click();
  assert.match(await page.locator('#notice').innerText(),/未儲存/);assert.equal(mutations.length,0);
  // Retain detached handlers, then switch version/source through real refresh.
  await page.evaluate(()=>{window.oldApprove=document.querySelector('.draft-focus .review-form button');window.oldForm=document.querySelector('.draft-form');});
  versions=[legacy(),typed(3,1)];reviews=[];await restore();await waitTyped('typed-3');
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
   versions=[row];await restore();await page.locator('.typed-incomplete').waitFor();await noActions();
  }
  const hostile=typed();hostile.first_result_payload.preview.fields.description.suggested='<img src=x onerror="window.XSS=1"><script>window.XSS=1</script>';
  hostile.draft_body=hostile.first_result_payload.preview.fields.description.suggested;
  versions=[hostile];await restore();await waitTyped();
  assert.equal(await page.locator('.typed-draft img,.typed-draft script').count(),0);assert.equal(await page.evaluate(()=>window.XSS),undefined);
  assert.equal(await current.locator('[data-field="description"]').textContent(),hostile.draft_body);
  await page.locator('#sign-out').click();role='viewer';versions=[legacy(),typed()];await login();await waitTyped();await noActions();
  assert.equal(mutations.length,0);
  // Legacy approved version still gets a plan; old plan handler is invalid after source/version refresh.
  await page.locator('#sign-out').click();role='owner';versions=[legacy()];reviews=[{version_id:'legacy-1',decision:'approved',reviewed_at:stamp,reason:'legacy approved'}];await login();
  await page.locator('.action-plan-form').waitFor();
  await page.locator('[name="proposed_path"]').fill('/synthetic');await page.locator('[name="success_signal"]').fill('synthetic');await page.locator('[name="rollback_plan"]').fill('synthetic');
  await page.evaluate(()=>window.oldPlan=document.querySelector('.action-plan-form'));
  versions=[typed()];reviews=[];await restore();await waitTyped();await page.evaluate(()=>window.oldPlan.dispatchEvent(new Event('submit',{cancelable:true})));assert.equal(mutations.length,0);
  // A pending LEGACY request is sent once. Its late response cannot overwrite a new typed card.
  versions=[legacy()];await restore();await page.getByRole('button',{name:'核准此版本',exact:true}).waitFor();
  await page.locator('[name="review_reason"]').fill('synthetic legacy');holdMutation='review_content_draft';
  await page.evaluate(()=>{const b=document.querySelector('.draft-focus .review-form button');b.click();b.dispatchEvent(new MouseEvent('click'));});
  await until(()=>releaseMutation);assert.equal(mutations.length,1);assert.equal(mutations[0].body.p_version_id,'legacy-1');
  versions=[typed(4,1)];await restore();await waitTyped('typed-4');releaseMutation();await page.waitForTimeout(100);await noActions();assert.equal(await page.locator('.draft-result').count(),0);
  // Out-of-order dashboard replies cannot restore stale legacy controls.
  versions=[legacy()];holdRead=true;await restore();await until(()=>releaseRead);
  versions=[typed(5,0)];await restore();await waitTyped('typed-5');releaseRead();await page.waitForTimeout(100);await noActions();
  // pagehide invalidates retained cards before a bfcache refresh, even if a click is dispatched programmatically.
  versions=[legacy()];await restore();await page.getByRole('button',{name:'核准此版本',exact:true}).waitFor();await page.locator('[name="review_reason"]').fill('old');
  await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide'));document.querySelector('.draft-focus .review-form button').click();});assert.equal(mutations.length,1);
  versions=[typed()];await restore();await waitTyped();await noActions();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // Legacy create and plan still submit their exact original payloads, once each.
  for(const mode of ['create','plan']) {
   versions=[legacy()];reviews=mode==='plan'?[{version_id:'legacy-1',decision:'approved',reviewed_at:stamp,reason:'approved'}]:[];
   await restore();
   if(mode==='create') {
    await page.locator('.compose-draft > summary').click();
    await page.locator('[name="title"]').fill('New legacy');await page.locator('[name="draft_body"]').fill('New body');
   } else {
    await page.locator('.action-plan-form').waitFor();
    await page.locator('[name="proposed_path"]').fill('/synthetic');await page.locator('[name="success_signal"]').fill('signal');await page.locator('[name="rollback_plan"]').fill('rollback');
   }
   releaseMutation=null;holdMutation=mode==='create'?'create_content_draft':'plan_content_action';
   const selector=mode==='create'?'.draft-form':'.action-plan-form';
   await page.locator(selector).evaluate(form=>{form.dispatchEvent(new Event('submit',{cancelable:true}));form.dispatchEvent(new Event('submit',{cancelable:true}));});
   await until(()=>releaseMutation);
   const sent=mutations.at(-1);assert.equal(sent.body.p_organization_id,org);
   if(mode==='create'){assert.equal(sent.body.p_title,'New legacy');assert.equal(sent.body.p_draft_body,'New body');assert.equal(sent.body.p_opportunity_id,'parent');}
   else {assert.equal(sent.body.p_version_id,'legacy-1');assert.equal(sent.body.p_proposed_path,'/synthetic');}
   releaseMutation();await page.locator('.draft-result').waitFor();
  }
  assert.equal(mutations.length,3,'one legacy review, one create, one plan; no typed mutations');
  assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  await context.close();console.log(`PASS ${width}px: complete typed fields/evidence, Unicode, owner/viewer, mixed histories, malformed data, HTML safety, keyboard details, zero typed mutations, legacy guard/late response/repeated clicks, stale refresh and page return, unchanged SELECT`);
 }
} finally {if(browser)await browser.close();server.kill();}
