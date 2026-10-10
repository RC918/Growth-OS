import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
const data=JSON.parse(await readFile('delivery/r7-private/dist/intro-r7.json','utf8')),text=data.payload.candidate.output.candidate;
const root='delivery/r7-private/dist/';
const names=['index.html','review.mjs','first-result.css','intro-r7-review.mjs','intro-candidate.mjs','intro-r7.json'];
const {validateR7}=await import('./dist/intro-r7-review.mjs');
assert.equal((await validateR7(data)).candidateHash,'3913033f19d0b9ccc1f1dac01693363aec56ee29d897d96c66fc7ac9b8c74c04');
const base='141b114d593566b6c38038000f040c5924322a3a';
for(const name of ['first-result.css','intro-candidate.mjs','intro-r7.json'])assert.deepEqual(await readFile(root+name),execFileSync('git',['show',base+':apps/web/'+name]));
assert.equal(await readFile(root+'intro-r7-review.mjs','utf8'),execFileSync('git',['show',base+':apps/web/intro-r7-review.mjs'],{encoding:'utf8'}).replace("credentials:'omit'","credentials:'same-origin'").replace("root.dataset.confirmed=String(!!v.receipt);","root.dataset.confirmed=String(!!v.receipt);\n  confirm.textContent=v.receipt?'已在本頁確認':'僅在本頁確認這份候選';"));
const accesses=[];
const server=createServer(async(req,res)=>{
 const name=req.url==='/'?'index.html':req.url.slice(1);
 accesses.push({url:req.url,method:req.method,cookie:req.headers.cookie});
 if(req.method!=='GET'||!names.includes(name)){res.writeHead(404).end();return;}
 if(name==='intro-r7.json'&&req.headers.cookie!=='fixture=private'){res.writeHead(401).end();return;}
 res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'text/html');
 res.end(await readFile(root+name));
});let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 const origin='http://127.0.0.1:'+port;browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:844},permissions:['clipboard-read','clipboard-write'],serviceWorkers:'block'}),page=await context.newPage(),requests=[],errors=[];
  await context.route('**/*',route=>{requests.push({url:route.request().url(),method:route.request().method()});return new URL(route.request().url()).origin===origin?route.continue():route.abort();});page.on('pageerror',e=>errors.push(e.message));
  await context.addCookies([{name:'fixture',value:'private',url:origin,httpOnly:true}]);
  await page.goto(origin+'/index.html#r7-review');await page.locator('#r7-content:not([hidden])').waitFor();
  assert.equal(await page.locator('#r7-candidate').innerText(),text);assert.equal(await page.locator('#r7-original').innerText(),data.payload.candidate.source.fields.intro_description);assert.equal(await page.locator('#r7-reason').innerText(),data.payload.candidate.output.reason);
  assert.match(await page.locator('#r7-review').innerText(),/真實 R7/);assert.match(await page.locator('#r7-review').innerText(),/APPROVE/);assert.match(await page.locator('#r7-review').innerText(),/不跨 session 保存/);assert.equal(await page.locator('form,#source-url,#intro-file,#handoff-result').count(),0);
  await page.locator('#r7-evidence').evaluate(el=>el.parentElement.open=true);assert.match(await page.locator('#r7-evidence').innerText(),/37967220375/);assert.match(await page.locator('#r7-evidence').innerText(),new RegExp(data.payload.candidate.source.version));
  await page.locator('#r7-copy').focus();await page.keyboard.press('Enter');await page.locator('#r7-copy[aria-busy="false"]').waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),text);assert.match(await page.locator('#r7-status').innerText(),/已複製/);
  await page.locator('#r7-check').focus();await page.keyboard.press('Space');await page.locator('#r7-confirm').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#r7-review').getAttribute('data-confirmed'),'true');assert.match(await page.locator('#r7-status').innerText(),/重新整理或離開即失效/);assert.equal(await page.locator('#r7-confirm').innerText(),'已在本頁確認');assert.equal(await page.locator('#r7-status').evaluate(n=>n.previousElementSibling.className),'actions');
  for(const id of ['r7-confirm','r7-copy'])assert.ok((await page.locator('#'+id).boundingBox()).height>=44);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#r7-review').screenshot({path:'/tmp/r7-private-'+width+'.png'});
  await page.reload();await page.locator('#r7-content:not([hidden])').waitFor();assert.equal(await page.locator('#r7-review').getAttribute('data-confirmed'),'false');assert.equal(await page.locator('#r7-check').isChecked(),false);
  await page.locator('#r7-check').check();await page.locator('#r7-confirm').click();
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));assert.equal(await page.locator('#r7-review').getAttribute('data-confirmed'),'false');
  await page.locator('#r7-check').check();await page.locator('#r7-confirm').click();await page.goto(origin+'/index.html');await page.goBack();await page.locator('#r7-content:not([hidden])').waitFor();assert.equal(await page.locator('#r7-review').getAttribute('data-confirmed'),'false');
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('denied');};});await page.locator('#r7-copy').click();await page.locator('#r7-copy-fallback:not([hidden])').waitFor();assert.equal(await page.locator('#r7-copy-fallback').inputValue(),text);
  const wrong=structuredClone(data);wrong.payload.candidate.source.url='https://example.com/wrong';await page.route('**/intro-r7.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(wrong)}));await page.reload();await page.waitForFunction(()=>document.querySelector('#r7-status').textContent.includes('已停止展示'));assert.equal(await page.locator('#r7-content').isVisible(),false);assert.equal(await page.locator('#r7-confirm').isDisabled(),true);assert.equal(await page.locator('#r7-copy').isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.ok(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===origin));assert.deepEqual(errors,[]);
  console.log(JSON.stringify({viewport:width,result:'PASS',candidate:'actual R7',page_confirmation:'exact hash, invalidated on reload and navigation',storage_writes:0,post_requests:0,remote_requests:0}));await context.close();
 }
 assert.ok(accesses.filter(r=>r.url==='/intro-r7.json').every(r=>r.cookie==='fixture=private'));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
