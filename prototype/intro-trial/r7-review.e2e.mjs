import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
const data=JSON.parse(await readFile('apps/web/intro-r7.json','utf8')),text=data.payload.candidate.output.candidate;
const temp=await mkdtemp(join(tmpdir(),'growth-r7-review-'));
const server=spawn('python3',['-B','prototype/public-audit/product_ui_fixture.py',join(temp,'sources.sqlite3')],{stdio:['ignore','pipe','pipe']});let browser;
try{
 const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('fixture timeout')),10000);server.stdout.once('data',b=>{clearTimeout(timer);resolve(Number(b.toString().trim()));});server.once('exit',()=>{clearTimeout(timer);reject(Error('fixture exited'));});});
 const origin='http://127.0.0.1:'+port;browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:844},permissions:['clipboard-read','clipboard-write'],serviceWorkers:'block'}),page=await context.newPage(),requests=[],errors=[];
  await context.route('**/*',route=>{requests.push({url:route.request().url(),method:route.request().method()});return new URL(route.request().url()).origin===origin?route.continue():route.abort();});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/service-result.html');await page.locator('#r7-content:not([hidden])').waitFor();
  assert.equal(await page.locator('#r7-candidate').innerText(),text);assert.equal(await page.locator('#r7-original').innerText(),data.payload.candidate.source.fields.intro_description);assert.equal(await page.locator('#r7-reason').innerText(),data.payload.candidate.output.reason);
  assert.match(await page.locator('#r7-review').innerText(),/真實 R7/);assert.match(await page.locator('#r7-review').innerText(),/APPROVE/);assert.match(await page.locator('#r7-review').innerText(),/不跨 session 保存/);assert.equal(await page.locator('#intro-file').isVisible(),false);
  await page.locator('#r7-evidence').evaluate(el=>el.parentElement.open=true);assert.match(await page.locator('#r7-evidence').innerText(),/37967220375/);assert.match(await page.locator('#r7-evidence').innerText(),new RegExp(data.payload.candidate.source.version));
  await page.locator('#r7-copy').focus();await page.keyboard.press('Enter');await page.locator('#r7-copy[aria-busy="false"]').waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),text);assert.match(await page.locator('#r7-status').innerText(),/已複製/);
  await page.locator('#r7-check').focus();await page.keyboard.press('Space');await page.locator('#r7-confirm').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#r7-review').getAttribute('data-confirmed'),'true');assert.match(await page.locator('#r7-status').innerText(),/重新整理或離開即失效/);
  for(const id of ['r7-confirm','r7-copy'])assert.ok((await page.locator('#'+id).boundingBox()).height>=44);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#r7-review').screenshot({path:'/tmp/r7-review-'+width+'.png'});
  await page.locator('#source-url').fill('https://example.com/wrong');assert.equal(await page.locator('#r7-review').getAttribute('data-confirmed'),'false');assert.equal(await page.locator('#r7-confirm').isDisabled(),true);assert.equal(await page.locator('#r7-copy').isDisabled(),true);
  await page.locator('#source-url').fill(data.payload.candidate.source.url);assert.equal(await page.locator('#r7-check').isChecked(),false);assert.equal(await page.locator('#r7-confirm').isDisabled(),true);
  await page.locator('#r7-check').check();await page.locator('#r7-confirm').click();await page.reload();await page.locator('#r7-content:not([hidden])').waitFor();assert.equal(await page.locator('#r7-review').getAttribute('data-confirmed'),'false');assert.equal(await page.locator('#r7-check').isChecked(),false);
  await page.locator('#r7-check').check();await page.locator('#r7-confirm').click();
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));assert.equal(await page.locator('#r7-review').getAttribute('data-confirmed'),'false');
  await page.locator('#r7-check').check();await page.locator('#r7-confirm').click();await page.goto(origin+'/first-result.html');await page.goBack();await page.locator('#r7-content:not([hidden])').waitFor();assert.equal(await page.locator('#r7-review').getAttribute('data-confirmed'),'false');
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('denied');};});await page.locator('#r7-copy').click();await page.locator('#r7-copy-fallback:not([hidden])').waitFor();assert.equal(await page.locator('#r7-copy-fallback').inputValue(),text);
  const wrong=structuredClone(data);wrong.payload.candidate.source.url='https://example.com/wrong';await page.route('**/intro-r7.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(wrong)}));await page.reload();await page.waitForFunction(()=>document.querySelector('#r7-status').textContent.includes('已停止展示'));assert.equal(await page.locator('#r7-content').isVisible(),false);assert.equal(await page.locator('#r7-confirm').isDisabled(),true);assert.equal(await page.locator('#r7-copy').isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.ok(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin));assert.deepEqual(errors,[]);
  console.log(JSON.stringify({viewport:width,result:'PASS',candidate:'actual R7',page_confirmation:'exact hash, invalidated on source change and reload',storage_writes:0,post_requests:0,remote_requests:0}));await context.close();
 }
}finally{await browser?.close();server.kill('SIGTERM');await rm(temp,{recursive:true,force:true});}
