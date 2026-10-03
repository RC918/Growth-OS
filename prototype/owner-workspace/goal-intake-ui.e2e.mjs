// Synthetic browser transport, not evidence of real Auth or PostgreSQL RLS.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(process.env.GROWTH_PLAYWRIGHT_PATH||new URL('../../package.json',import.meta.url));
const {chromium}=require('playwright');
const files=resolve('apps/web');const server=createServer(async(req,res)=>{
 try{const path=resolve(files,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(files+'/'))throw Error();
 res.setHeader('Content-Type',extname(path)==='.mjs'?'text/javascript':extname(path)==='.css'?'text/css':'text/html');res.end(await readFile(path));}
 catch{res.statusCode=404;res.end();}
});
await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
const origin=`http://127.0.0.1:${server.address().port}`;let browser;
try {
 browser=await chromium.launch({...(process.env.GROWTH_CHROMIUM_PATH?{executablePath:process.env.GROWTH_CHROMIUM_PATH}:{})});
 for(const width of [1280,390]) {
  const context=await browser.newContext({viewport:{width,height:844}});const page=await context.newPage();const errors=[];
  const saved=new Map(),requests=new Map(),calls=[];let role='owner',failNext=false,delayNext=null;
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('https://vhzryhibmpvglzcmfnaa.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url());const org=role==='owner'?'org-a':'org-b';
   const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(url.pathname==='/auth/v1/user')return respond({id:'synthetic-'+role});
   if(url.pathname.endsWith('organization_members'))return respond([{organization_id:org,role}]);
   if(url.pathname.endsWith('organizations'))return respond([{id:org,name:'Synthetic workspace'}]);
   if(url.pathname.endsWith('rpc/save_goal_turn')) {
    const body=req.postDataJSON();calls.push(body);assert.equal(body.p_organization_id,'org-a');assert.equal(role,'owner');
    const prior=requests.get(body.p_request_id);
    if(prior)assert.deepEqual(prior,body);else {
     const turns=saved.get(body.p_goal_id)||[];assert.equal(body.p_expected_version,turns.length);
     turns.push({version_number:turns.length+1,question_key:body.p_question_key,question_text:'保存的引導問題',answer_text:body.p_answer});saved.set(body.p_goal_id,turns);requests.set(body.p_request_id,body);
    }
    if(failNext){failNext=false;return respond({},503);} // committed, response lost
    if(delayNext){const waiting=delayNext;delayNext=null;await waiting;}
    return respond({goal_id:body.p_goal_id,version_number:body.p_expected_version+1});
   }
   if(url.pathname.endsWith('growth_goals')) {assert.equal(url.searchParams.get('organization_id'),`eq.${org}`);return respond(role==='owner'?[...saved.keys()].reverse().map(id=>({id,created_at:'2026-09-30T11:00:00Z'})):[]);}
   if(url.pathname.endsWith('growth_goal_turns')) {assert.equal(url.searchParams.get('organization_id'),`eq.${org}`);return respond(saved.get(url.searchParams.get('goal_id').slice(3))||[]);}
   return respond([]);
  });
  let loginSequence=0;
  const login=async()=>{await page.goto(origin+'/workspace.html?test_session='+ ++loginSequence+'#access_token=synthetic&token_type=bearer&expires_in=3600');await page.locator('#workspace').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#goal-panel button')?.disabled);};
  await login();assert.match(await page.locator('#goal-panel').innerText(),/告訴我/);
  failNext=true;await page.locator('#goal-form textarea').fill('讓海外買家找到我的零件');await page.locator('#goal-form button[type=submit]').click();
  await page.getByText(/HTTP 503/).waitFor();await page.locator('#goal-form button[type=submit]').click();await page.getByText('已保存並讀回問答；尚未發布或取得成長數據。').waitFor();
  assert.equal(calls[0].p_request_id,calls[1].p_request_id);assert.equal(saved.size,1);
  for(const answer of ['工業零件','海外採購人員','歐洲／英語','自然搜尋','尚無連結','未來四週搜尋點擊']) {
   await page.locator('#goal-form textarea').fill(answer);await page.locator('#goal-form button[type=submit]').click();await page.getByText('已保存並讀回問答；尚未發布或取得成長數據。').waitFor();
  }
  await page.getByRole('button',{name:'確認資料',exact:true}).click();await page.getByText('資料已確認 · 待建立成長計畫').waitFor();
  const id=[...saved.keys()][0];assert.equal(saved.get(id).length,8);
  await page.reload();await page.locator('#sign-in').waitFor({state:'visible'});assert.equal(await page.locator('#goal-panel textarea').count(),0); // hidden workspace contains no private restored data
  await login();await page.getByText('資料已確認 · 待建立成長計畫').waitFor();assert.match(await page.locator('#goal-panel').innerText(),/尚無連結/);
  await page.getByRole('button',{name:'修正目標受眾',exact:true}).click();await page.locator('#goal-form textarea').fill('英國採購人員');await page.locator('#goal-form button[type=submit]').click();await page.getByRole('button',{name:'確認資料',exact:true}).waitFor();
  assert.equal(saved.get(id)[2].answer_text,'海外採購人員');assert.equal(saved.get(id).length,9);assert.equal(await page.getByText('資料已確認 · 待建立成長計畫').count(),0);
  await page.getByRole('button',{name:'確認資料',exact:true}).click();await page.getByText('資料已確認 · 待建立成長計畫').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // A response after signout must not restore a prior tenant's conversation.
  await page.getByRole('button',{name:'修正推廣內容',exact:true}).click();let release;delayNext=new Promise(yes=>release=yes);
  await page.locator('#goal-form textarea').fill('另一個產品');await page.locator('#goal-form button[type=submit]').click();await page.waitForTimeout(50);
  await page.locator('#sign-out').click();role='viewer';await login();release();await page.waitForTimeout(100);
  assert.equal(await page.locator('#goal-form').count(),0);assert.match(await page.locator('#goal-panel').innerText(),/檢視權限/);assert.doesNotMatch(await page.locator('#goal-panel').innerText(),/英國採購人員/);
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}px guided intake: lost-response retry, no-site confirmation, reload, immutable corrections, viewer, stale-session denial, overflow`);
 }
} finally {if(browser)await browser.close();await new Promise(done=>server.close(done));}
