// Real workspace UI with synthetic transport only; never live RLS evidence.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const origin='http://127.0.0.1:8778',orgA='93a88055-0a0b-40c0-b22f-a6d312320001',orgB='93a88055-0a0b-40c0-b22f-a6d312320002';
const owner='e85f1a90-3565-4fc1-a7e0-3b7d08830d0e',parentA='9bafbb2f-eea7-48ea-bc23-3896897f19c3',parentB='93a88055-0a0b-40c0-b22f-a6d3123c0002';
const server=spawn('python3',['-m','http.server','8778','--bind','127.0.0.1','--directory','apps/web'],{stdio:'ignore'});
let browser;
try {
 for(let i=0;i<50;i++){try{if((await fetch(origin+'/workspace.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage();
  let actor=owner,scenario='pass',release=null,probeReads=0;const errors=[],posts=[],unexpected=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===origin)return route.continue(); // Uses exact closed deployment config.
   if(url.origin!=='https://vhzryhibmpvglzcmfnaa.supabase.co'){unexpected.push(request.url());return route.abort();}
   if(request.method()!=='GET'){posts.push(url.pathname);return route.abort();}
   const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   const table=url.pathname.split('/').at(-1);
   if(table==='user')return respond({id:actor});
   if(table==='organization_members')return respond([{organization_id:orgA,role:'owner'}]);
   if(table==='organizations')return respond([{id:orgA,name:'Synthetic fixed owner workspace'}]);
   if(table==='growth_opportunities' && url.searchParams.has('id')){
    probeReads++;const own=url.searchParams.get('organization_id')==='eq.'+orgA;
    assert.equal(url.searchParams.get('select'),'id,organization_id');assert.equal(url.searchParams.get('limit'),'2');
    assert.equal(url.searchParams.get('organization_id'),'eq.'+(own?orgA:orgB));assert.equal(url.searchParams.get('id'),'eq.'+(own?parentA:parentB));
    if(own)return respond(scenario==='empty-positive'?[]:[{id:parentA,organization_id:orgA}]);
    if(scenario==='hold')await new Promise(r=>release=r);
    if(scenario==='network')return route.abort();
    if(scenario==='401'||scenario==='403')return respond({},Number(scenario));
    return respond(scenario==='malformed'?{}:scenario==='leak'?[{id:parentB,organization_id:orgB}]:[]);
   }
   return respond([]);
  });
  const login=async()=>{await page.goto('about:blank');await page.goto(origin+'/workspace.html#access_token=synthetic&token_type=bearer&expires_in=3600');await page.locator('#workspace').waitFor({state:'visible'});};
  await login();await page.locator('#owner-tenant-diagnostics').waitFor({state:'visible'});
  assert.equal(await page.locator('#owner-tenant-diagnostics input').count(),0);
  await page.locator('#verify-owner-tenant').click();await page.locator('#owner-tenant-result').filter({hasText:'通過：本工作區精確 1 筆'}).waitFor();
  assert.match(await page.locator('#owner-tenant-result').innerText(),/成功回應 0 筆/);assert.equal(probeReads,2);
  for(scenario of ['empty-positive','401','403','network','malformed','leak']){
   await page.locator('#verify-owner-tenant').click();await page.locator('#owner-tenant-result').filter({hasText:'驗收未通過：'}).waitFor();
  }
  scenario='hold';await page.locator('#verify-owner-tenant').click();
  for(let i=0;i<500&&!release;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(typeof release,'function','negative GET reached held response');
  await page.locator('#sign-out').click();release();
  await page.waitForTimeout(100);assert.equal(await page.locator('#owner-tenant-result').innerText(),'');assert.equal(await page.locator('#owner-tenant-diagnostics').isVisible(),false);
  actor='wrong-owner';scenario='pass';await login();assert.equal(await page.locator('#owner-tenant-diagnostics').isVisible(),false);
  assert.deepEqual(posts,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  console.log(`PASS ${width}px fixed Owner positive/negative GET, error/leak denial, wrong actor hidden, logout late response, zero POST, closed config`);
  await context.close();
 }
}finally{if(browser)await browser.close();server.kill();}
