import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startPreviewServer} from './server.mjs';
import {createFixture,config,fragment} from './fixture.mjs';
const server=await startPreviewServer(),browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined}),checks=[];
const ok=s=>{checks.push(s);console.log('PASS W2 preparation '+s);};
try{for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),unexpected=[],errors=[];
 await context.route('**/*',r=>{const q=r.request();if(new URL(q.url()).origin===server.origin&&q.method()==='GET')return r.continue();unexpected.push(q.method()+' '+q.url());return r.abort();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.origin+'/prototype/w1-publication/index.html');assert.match(await page.locator('.badge').textContent(),/Synthetic.*免登入.*不會發布/);
 await page.locator('.publish-preview-read').focus();await page.keyboard.press('Enter');await page.locator('.publish-preview-status').filter({hasText:'預覽已讀取'}).waitFor();
 assert.match(await page.locator('.publish-version').textContent(),/第 2 版/);assert.match(await page.locator('.publish-after').textContent(),/不支援/);assert.match(await page.locator('.publish-previous').textContent(),/第 1 版.*不代表網站/s);
 assert.equal(await page.locator('.publish-unavailable').isDisabled(),true);assert.equal(await page.locator('.publish-blockers li').count(),8);
 assert.equal(await page.locator('.publish-preview-body').locator('details').isVisible(),true);await page.locator('.publish-preview-body summary').click();assert.match(await page.locator('.publish-preview-body details').textContent(),/擷取時間：未知/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`/tmp/w2-preparation-${width}.png`,fullPage:true});
 for(const [scenario,message] of [['unconfirmed','目前這個確切版本尚無有效確認'],['source-changed','來源已變更'],['conflict','商家答案與來源觀察衝突'],['foreign','無法核對'],['failed','無法核對']]){
  await page.locator('#scenario').selectOption(scenario);await page.locator('.publish-preview-read').click();await page.locator('.url-publish-preview').filter({hasText:message}).waitFor();assert.equal(await page.locator('.publish-unavailable').isDisabled(),true);
  if(['foreign','failed'].includes(scenario))assert.equal(await page.locator('.publish-preview-body').textContent(),'');
 }
 await page.locator('#scenario').selectOption('confirmed');await page.locator('.publish-preview-read').click();await page.locator('.publish-preview-status').filter({hasText:'預覽已讀取'}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.deepEqual(await context.cookies(),[]);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);await context.close();ok(`${width} no-login synthetic UI: exact v2, snapshot/previous differences, explicit blockers, failures and recovery, keyboard, no POST/storage/overflow`);

 // Actual shipped W1 route with synthetic GET transport; no real Auth or host.
 const f=createFixture(),c=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),manifest=JSON.parse(await readFile('delivery/w1-private/SHA256.json','utf8'));let hold=false,release,entered;
 await c.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());assert.equal(req.method(),'GET');
  if(u.origin===config.redirectOrigin){const file=u.pathname==='/w1-workspace'?'index.html':u.pathname.replace(/^\/w1-assets\//,'');assert.ok(Object.hasOwn(manifest,file));return route.fulfill({status:200,contentType:/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:file==='w1-workspace-config.mjs'?'export default '+JSON.stringify(config):await readFile('delivery/w1-private/dist/'+file)});}
  assert.equal(u.origin,config.origin);if(hold&&u.pathname.endsWith('/w1_reviews')){entered();await new Promise(r=>release=r);}
  const response=await f.transport(req.url(),{method:req.method()});return route.fulfill({status:response.status,headers:{'content-type':'application/json','access-control-allow-origin':config.redirectOrigin},body:await response.text()});
 });
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(config.redirectOrigin+'/w1-workspace'+fragment);await p.locator('#result').waitFor();await p.locator('.publish-preview-read').click();await p.locator('.publish-preview-status').filter({hasText:'預覽已讀取'}).waitFor();
 assert.match(await p.locator('.publish-after').textContent(),/不支援/);assert.equal(await p.locator('.publish-unavailable').isDisabled(),true);assert.match(await p.locator('#window-status').textContent(),/目前只能讀取已保存內容/);assert.equal(await p.locator('#save').isDisabled(),true);assert.equal(await p.locator('#review').isDisabled(),true);assert.match(await p.locator('.publish-version').textContent(),/第 2 版/);assert.equal(await p.locator('.publish-blockers li').count(),8);
 f.data.row.source_version=2;f.data.row.source_changed=true;f.data.row.review_valid=false;
 await p.locator('.publish-preview-read').click();await p.locator('.publish-preview-status').filter({hasText:'無法核對'}).waitFor();assert.equal(await p.locator('.publish-preview-body').textContent(),'');
 await p.locator('#refresh').click();await p.locator('#state').filter({hasText:'來源已變更'}).waitFor();await p.locator('.publish-preview-read').click();await p.locator('[data-blocker="SOURCE_CHANGED"]').waitFor();
 f.data.row.source_version=1;f.data.row.source_changed=false;f.data.row.review_valid=true;await p.locator('#refresh').click();await p.locator('#state').filter({hasText:'此確切版已確認'}).waitFor();
 hold=true;const waiting=new Promise(r=>entered=r);await p.locator('.publish-preview-read').click();await waiting;await p.locator('#logout').click();await p.locator('#result').waitFor({state:'hidden'});release();hold=false;
 await p.waitForLoadState('networkidle');assert.equal(await p.locator('.url-publish-preview').count(),0);assert.ok(f.calls.every(x=>x.method==='GET'));assert.deepEqual(errors,[]);await c.close();ok(`${width} shipped /w1-workspace: closed gate preview, stale version clears, refresh recovers blockers, logout rejects late read; GET only`);
 }
 await writeFile('/tmp/w2-preparation-evidence.json',JSON.stringify({result:'PASS',scope:'synthetic/local only; publication and real fresh-login remain unverified',checks},null,2));
}finally{await browser.close();await server.close();}
