// Deterministic async boundaries in the actual product/workspace pages, synthetic HTTP only.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {fixtures,ids,parent} from '../../supabase/drafts/first_result_save/fixtures.mjs';
const report=(await fixtures())[0],origin='http://127.0.0.1:8776';
const server=spawn('python3',['-m','http.server','8776','--bind','127.0.0.1','--directory','apps/web'],{stdio:'ignore'});
const until=async fn=>{for(let i=0;i<500;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('boundary not reached');};
const failures=[];let browser;
try{
 await until(async()=>{try{return(await fetch(origin+'/workspace.html')).ok;}catch{return false;}});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 for(const width of [1280,390])for(const scenario of ['cancel','review_edit','refresh','pagehide','read_http_failure','read_wrong_id']){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),errors=[],unexpected=[];
  let posts=0,reads=0,row=null;context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url()),reply=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
   if(u.origin===origin){
    if(u.pathname==='/url-result-config.mjs')return route.fulfill({contentType:'text/javascript',body:'export const urlSaveEnabled=true;export const urlResultSchemaEnabled=true;'});
    if(u.pathname==='/api/product-source'){
     const raw=structuredClone(report);for(const [key,field]of Object.entries(raw.preview.fields)){field.suggested=raw.review.original_suggestions[key];delete field.user_edited;delete field.citation_role;}delete raw.review;raw.preview.status='awaiting_review';return reply(raw);
    }
    return route.continue();
   }
   if(u.origin!=='https://vhzryhibmpvglzcmfnaa.supabase.co'){unexpected.push(req.url());return route.abort();}
   if(u.pathname==='/auth/v1/user')return reply({id:ids.owner});
   const table=u.pathname.split('/').at(-1);
   if(req.method()==='POST'){
    assert.equal(table,'save_url_result_draft');posts++;const p=req.postDataJSON();
    row={organization_id:ids.org,id:parent(70),opportunity_id:p.p_opportunity_id,version_number:1,title:p.p_payload.preview.fields.title.suggested,draft_body:p.p_payload.preview.fields.description.suggested,status:'draft',created_at:'2026-10-03T00:00:00Z',first_result_payload:p.p_payload,first_result_request_id:p.p_request_id,first_result_expected_version:0,first_result_request_digest:'pg-jsonb-sha256:'+'a'.repeat(64)};
    return reply(row.id);
   }
   assert.equal(req.method(),'GET');
   if(table==='organization_members')return reply([{organization_id:ids.org,role:'owner'}]);
   if(table==='organizations')return reply([{id:ids.org,name:'Synthetic race workspace'}]);
   if(table==='content_versions'&&u.searchParams.has('first_result_request_id')){
    reads++;assert.equal(u.searchParams.get('organization_id'),'eq.'+ids.org);assert.equal(u.searchParams.get('first_result_request_id'),'eq.'+row.first_result_request_id);
    if(reads===1&&scenario==='read_http_failure')return reply({},503);
    return reply([{...row,id:reads<=2?parent(71):row.id}]);
   }
   if(['business_profiles','growth_opportunities','sites','opportunity_sources','opportunity_decisions','content_versions','content_reviews','content_action_plans','search_observation_versions','growth_goals'].includes(table))return reply([]);
   unexpected.push(req.url());return route.abort();
  });
  try{
   const product=await context.newPage();await product.goto(origin+'/first-result.html');await product.locator('#source-url').fill('https://example.com/products/bolt');await product.locator('#source-submit').click();await product.locator('#review-title').waitFor();
   const opened=context.waitForEvent('page');await product.locator('#handoff-result').click();const page=await opened;await page.waitForLoadState();await page.goto('about:blank');await page.goto(origin+'/workspace.html#access_token=synthetic&token_type=bearer&expires_in=3600');await page.locator('#url-save-preview .typed-draft').waitFor();
   if(!scenario.startsWith('read_')){
    await page.evaluate(()=>{
     const native=crypto.subtle.digest.bind(crypto.subtle);window.digestCompletions=0;window.digestRelease=null;let first=true;
     crypto.subtle.digest=async(...args)=>{if(first){first=false;await new Promise(resolve=>window.digestRelease=resolve);}const value=await native(...args);window.digestCompletions++;return value;};
    });
    await page.locator('#save-url-result').click();await page.waitForFunction(()=>typeof window.digestRelease==='function');assert.equal(posts,0,'digest barrier precedes dispatch');
    if(scenario==='cancel')await product.locator('#cancel-handoff').click();
    if(scenario==='review_edit')await product.locator('#review-title').fill('Changed while validating');
    if(['cancel','review_edit'].includes(scenario))await until(async()=>await page.locator('#url-save-preview .typed-draft').count()===0);
    if(scenario==='refresh')await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    if(scenario==='pagehide')await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.evaluate(()=>window.digestRelease());await page.waitForFunction(()=>window.digestCompletions===2);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(posts,0,'invalidated intent must not POST after async validation');
   }else{
    await page.locator('#save-url-result').click();await until(async()=>reads===1&&!await page.getByRole('button',{name:'只查詢保存結果'}).isDisabled());
    assert.doesNotMatch(await page.locator('#url-save-feedback').innerText(),/已保存第/);
    await page.getByRole('button',{name:'只查詢保存結果'}).click();await until(()=>reads===2);
    await page.waitForFunction(()=>/不一致|已保存第/.test(document.querySelector('#url-save-feedback').textContent));
    assert.doesNotMatch(await page.locator('#url-save-feedback').innerText(),/已保存第/,'manual readback cannot replace known RPC UUID A with B');
    assert.match(await page.locator('#url-save-feedback').innerText(),/不一致/);
    await page.getByRole('button',{name:'只查詢保存結果'}).click();await page.locator('#url-save-feedback').filter({hasText:'已保存第 1 版'}).waitFor();assert.match(await page.locator('#url-save-feedback').innerText(),new RegExp(row.id));assert.equal(posts,1,'only GET reconciliation after initial POST');
   }
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);console.log(`PASS ${width}px URL boundary ${scenario}`);
  }catch(e){failures.push({width,scenario,error:e.message});console.log(`FAIL ${width}px URL boundary ${scenario}: ${e.message}`);}
  finally{await context.close();}
 }
 assert.deepEqual(failures,[],'all deterministic URL Save async boundaries must hold');
}finally{if(browser)await browser.close();server.kill();}
