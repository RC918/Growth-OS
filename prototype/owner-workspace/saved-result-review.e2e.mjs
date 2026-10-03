// Synthetic authenticated transport; exercises actual workspace, no remote request.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {fixtures} from '../../supabase/drafts/first_result_save/fixtures.mjs';
const payload=(await fixtures())[0],snapshot=JSON.stringify(payload),origin='http://127.0.0.1:8779';
const org='10000000-0000-4000-8000-000000000001',parent='20000000-0000-4000-8000-000000000001';
const row={organization_id:org,id:'50000000-0000-4000-8000-000000000001',opportunity_id:parent,version_number:1,title:payload.preview.fields.title.suggested,draft_body:payload.preview.fields.description.suggested,status:'draft',created_at:'2026-10-03T00:00:00Z',first_result_request_id:'30000000-0000-4000-8000-000000000001',first_result_expected_version:0,first_result_request_digest:'pg-jsonb-sha256:'+'1'.repeat(64),first_result_payload:payload};
const server=spawn('python3',['-m','http.server','8779','--bind','127.0.0.1','--directory','apps/web'],{stdio:'ignore'});
const wait=async check=>{for(let i=0;i<500;i++){if(await check())return;await new Promise(r=>setTimeout(r,10));}throw Error('synthetic barrier timeout');};
let browser;
try{
 await wait(async()=>{try{return(await fetch(origin+'/workspace.html')).ok;}catch{return false;}});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage();
  let role='owner',latest=structuredClone(row),detail=structuredClone(row),activeOrg=org,hold=false,release=null,reads=0;const posts=[],errors=[],unexpected=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin===origin)return route.continue(); // Exact closed config, no flag override.
   if(u.origin!=='https://vhzryhibmpvglzcmfnaa.supabase.co'){unexpected.push(req.url());return route.abort();}
   if(req.method()!=='GET'){posts.push(u.pathname);return route.abort();}
   const respond=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)}),table=u.pathname.split('/').at(-1);
   if(table==='user')return respond({id:role==='owner'?'10000000-0000-4000-8000-000000000003':'10000000-0000-4000-8000-000000000005'});
   if(table==='organization_members')return respond([{organization_id:activeOrg,role}]);
   if(table==='organizations')return respond([{id:activeOrg,name:'Synthetic restored Review'}]);
   if(table==='growth_opportunities')return respond([{id:parent,entry_kind:'url_result',source_identity:{final_url:payload.snapshot.final_url},status:'in_review'}]);
   if(table==='content_versions'){
    assert.equal(u.searchParams.get('organization_id'),'eq.'+activeOrg);
    if(u.searchParams.has('first_result_request_id'))return respond([]);
    let value=u.searchParams.has('opportunity_id')?latest:row;
    if(u.searchParams.has('id')){assert.equal(u.searchParams.get('id'),'eq.'+row.id);reads++;if(hold)await new Promise(r=>release=r);value=detail;}
    return respond([Object.fromEntries(u.searchParams.get('select').split(',').map(k=>[k,value[k]]))]);
   }
   return respond([]);
  });
  const login=async()=>{await page.goto('about:blank');await page.goto(origin+'/workspace.html#access_token=synthetic&token_type=bearer&expires_in=3600');await page.locator('#workspace').waitFor({state:'visible'});};
  const expand=async()=>{await page.locator('.typed-loader > summary').click();await page.locator('.typed-draft').waitFor();};
  const start=async()=>{await page.locator('.resume-review').click();await page.locator('.resume-editor textarea').first().waitFor();};
  const checkAll=async()=>{for(const key of ['title','meta_description','description'])await page.locator(`[data-check="${key}"]`).check();};
  await login();await expand();await start();
  assert.equal(await page.locator('textarea[data-field="title"]').inputValue(),row.title);assert.match(await page.locator('.resume-status').innerText(),/待重新確認.*未保存.*未發布/);
  assert.ok((await page.locator('.resume-editor').innerText()).includes(payload.review.original_suggestions.title));
  await page.locator('textarea[data-field="title"]').fill('Owner continued title');await checkAll();await page.locator('.resume-confirm').click();await page.locator('.resume-status').filter({hasText:'本頁已確認'}).waitFor();
  await page.locator('.resume-prepare').click();await page.locator('.resume-intent').waitFor({state:'visible'});
  const intent=JSON.parse(await page.locator('.resume-intent-json').textContent());assert.equal(intent.binding.base_version_id,row.id);assert.equal(intent.request.expected_version,1);assert.equal(intent.request.organization_id,org);assert.equal(intent.request.opportunity_id,parent);assert.equal(intent.request.payload.preview.fields.title.suggested,'Owner continued title');assert.deepEqual(intent.request.payload.snapshot,payload.snapshot);assert.deepEqual(intent.request.payload.review.original_suggestions,payload.review.original_suggestions);assert.equal(intent.authority.persisted,false);assert.equal(intent.authority.owner_approved,false);assert.match(intent.intent_digest,/^sha256:/);assert.equal(await page.locator('.resume-prepare').isDisabled(),true);
  await page.locator('textarea[data-field="description"]').fill('Changed again');assert.equal(await page.locator('.resume-intent').isVisible(),false);assert.match(await page.locator('.resume-status').innerText(),/待重新確認/);
  await page.locator('.resume-cancel').click();assert.equal(await page.locator('.resume-editor textarea').count(),0);assert.match(await page.locator('.resume-status').innerText(),/原已保存版本未變/);assert.equal(await page.locator('.typed-current[data-field="title"]').textContent(),row.title);
  await start();assert.equal(await page.locator('textarea[data-field="title"]').inputValue(),row.title);
  latest={...row,id:'50000000-0000-4000-8000-000000000002',version_number:2};await checkAll();await page.locator('.resume-confirm').click();await page.locator('.resume-status').filter({hasText:'續編已失效'}).waitFor();assert.equal(await page.locator('.resume-editor textarea').count(),0);
  latest=structuredClone(row);detail={...row,organization_id:'wrong'};await page.locator('.resume-review').click();await page.locator('.resume-status').filter({hasText:'無法續編'}).waitFor();assert.equal(await page.locator('.resume-editor textarea').count(),0);
  detail=structuredClone(row);await start();await checkAll();
  detail.first_result_payload.snapshot.fetched_at='2026-10-03T01:00:00Z';await page.locator('.resume-confirm').click();await page.locator('.resume-status').filter({hasText:'已保存來源或內容已變更'}).waitFor();assert.equal(await page.locator('.resume-editor textarea').count(),0);
  detail=structuredClone(row);await start();await checkAll();hold=true;release=null;await page.locator('.resume-confirm').click();await wait(()=>release);await page.locator('.resume-cancel').click();hold=false;release();await page.waitForTimeout(100);assert.match(await page.locator('.resume-status').innerText(),/已取消續編/);assert.equal(await page.locator('.resume-editor textarea').count(),0);
  await start();await page.locator('textarea[data-field="title"]').fill('Intent cancelled');await checkAll();await page.locator('.resume-confirm').click();await page.locator('.resume-status').filter({hasText:'本頁已確認'}).waitFor();
  hold=true;release=null;await page.locator('.resume-prepare').click();await wait(()=>release);await page.locator('.resume-cancel').click();hold=false;release();await page.waitForTimeout(100);assert.equal(await page.locator('.resume-intent-json').count(),0);assert.match(await page.locator('.resume-status').innerText(),/已取消續編/);
  hold=true;release=null;await page.locator('.resume-review').click();await wait(()=>release);await page.locator('#sign-out').click();hold=false;release();await page.waitForTimeout(100);assert.equal(await page.locator('.resume-editor textarea').count(),0);
  role='viewer';await login();await expand();assert.equal(await page.locator('.resume-review').count(),0);
  role='owner';activeOrg='10000000-0000-4000-8000-000000000002';await login();await page.locator('.typed-loader > summary').click();await page.locator('.typed-read-feedback').filter({hasText:'版本資料與列表不一致'}).waitFor();assert.equal(await page.locator('.resume-review').count(),0);
  assert.equal(JSON.stringify(payload),snapshot);assert.ok(reads>0);assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log(`PASS ${width}px stored version → resume/check/new-version intent/cancel; base UUID/expected version, preserved source/originals, drift denial, cancelled late intent, zero POST`);await context.close();
 }
}finally{if(browser)await browser.close();server.kill();}
