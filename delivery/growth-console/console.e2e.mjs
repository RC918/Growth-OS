import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
const temp=await mkdtemp(join(tmpdir(),'growth-console-'));
const server=spawn('python3',['-B','prototype/public-audit/product_ui_fixture.py',join(temp,'sources.sqlite3')],{stdio:['ignore','pipe','pipe']});let browser;
try{
 const port=await new Promise((resolve,reject)=>{server.stdout.once('data',d=>resolve(Number(d.toString().trim())));server.once('exit',c=>reject(Error('fixture exit '+c)));});
 const origin='http://127.0.0.1:'+port;
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 for(const width of [1280,390,320]){
  server.kill('SIGUSR1');const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage();const errors=[],remote=[],posts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(new URL(r.url()).pathname);});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){remote.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(origin+'/growth-console.html');const url=page.locator('#source-url');
  assert.match(await page.locator('#mode-banner').innerText(),/真網址模式/);
  await url.fill('https://example.com/products/bolt');await url.press('Enter');await page.locator('#result-panel:not([hidden])').waitFor();
  assert.match(await page.locator('#task-phase').innerText(),/需要你確認/);assert.match(await page.locator('#result-fields').innerText(),/Bolt A/);assert.equal(await page.locator('#review-confirm').isDisabled(),true);
  if(width<768)await page.locator('#guide-toggle').click();
  for(const key of ['title','meta_description','description']){
   await page.locator('#guide-action').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#check-'+key).evaluate(e=>document.activeElement===e),true);await page.keyboard.press('Space');
  }
  await page.locator('#guide-action').click();assert.equal(await page.locator('#review-confirm').evaluate(e=>document.activeElement===e),true);await page.keyboard.press('Enter');await page.locator('#review-state').filter({hasText:'本頁已確認'}).waitFor();
  assert.match(await page.locator('#task-phase').innerText(),/本頁確認完成/);assert.match(await page.locator('#guide-reason').innerText(),/尚未保存/);
  await page.locator('#field-description').fill('Preserve this manual version.');assert.equal(await page.locator('#check-description').isChecked(),false);assert.match(await page.locator('#review-state').innerText(),/^待確認/);
  await page.locator('#later').click();assert.equal(await page.locator('#overview-panel').isVisible(),true);await page.locator('#return-result').click();assert.equal(await page.locator('#field-description').inputValue(),'Preserve this manual version.');
  await page.locator('#guide-close').click();assert.equal(await page.locator('#guide-toggle').evaluate(e=>document.activeElement===e),true);assert.equal(await page.locator('#guidance').isVisible(),false);await page.locator('#guide-toggle').click();assert.equal(await page.locator('#guide-heading').evaluate(e=>document.activeElement===e),true);
  const mainText=await page.locator('#field-description').inputValue();const wasOpen=await page.locator('#task-details').isVisible();await page.locator('#task-toggle').click();assert.equal(await page.locator('#task-details').isVisible(),!wasOpen);await page.locator('#task-toggle').click();assert.equal(await page.locator('#field-description').inputValue(),mainText);
  async function overview(){if(width<1024)await page.locator('#nav-toggle').click();await page.locator('[data-view=overview]').click();}
  await overview();await url.fill('https://example.com/timeout');await page.locator('#source-submit').click();await page.locator('#source-feedback').filter({hasText:'逾時'}).waitFor();assert.equal(await url.inputValue(),'https://example.com/timeout');assert.match(await page.locator('#task-phase').innerText(),/未完成/);
  if(width<1024)await page.locator('#nav-toggle').click();await page.locator('[data-view=result]').click();assert.equal(await page.locator('#field-description').inputValue(),mainText);assert.equal(await page.locator('#review-confirm').isDisabled(),true);
  // Synthetic error responses exercise the actual loader and visible failure copy, never a public fetch.
  for(const [reason,label] of [['timeout','逾時'],['dns_failed','解析'],['tls_failed','安全連線'],['http_denied','拒絕'],['http_status','成功狀態'],['unknown','未知']]){
   await page.route('**/api/product-source',route=>route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({code:'robots_unavailable',detail:'SECRET',diagnostic:{stage:'robots',reason,http_status:reason==='http_denied'?403:null}})}));
   await overview();await url.fill('https://example.com/product');await page.locator('#source-submit').click();
   await page.locator('#source-feedback').filter({hasText:label}).waitFor();assert.equal(await url.inputValue(),'https://example.com/product');assert.ok(!(await page.locator('body').innerText()).includes('SECRET'));
   if(width<1024)await page.locator('#nav-toggle').click();await page.locator('[data-view=result]').click();assert.equal(await page.locator('#field-description').inputValue(),mainText);assert.equal(await page.locator('#review-confirm').isDisabled(),true);
   await page.unroute('**/api/product-source');
  }
  // Hold a real HTTP response locally, then cancel; no synthetic completion timers.
  await overview();let release;const barrier=new Promise(r=>release=r);
  await page.route('**/api/product-source',async route=>{const response=await route.fetch();await barrier;try{await route.fulfill({response});}catch{}});
  await url.fill('https://example.com/products/bolt');await page.locator('#source-submit').click();await page.locator('#task-phase').filter({hasText:'正在讀取'}).waitFor();assert.equal(await page.locator('#guide-action').isVisible(),false);await page.locator('#source-cancel').click();release();await page.unroute('**/api/product-source');assert.match(await page.locator('#task-phase').innerText(),/未知/);
  const count=posts.length;await page.locator('#prototype-tools summary').click();
  for(const kind of ['start','running','review','failed','complete','return']){
   await page.locator('[data-scenario='+kind+']').click();await page.waitForFunction(kind=>document.getElementById('task-id').textContent==='prototype-'+kind,kind);
   assert.match(await page.locator('#mode-banner').innerText(),/合成互動原型/);assert.equal(posts.length,count);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.locator('[data-scenario=review]').click();await page.waitForFunction(()=>document.getElementById('task-id').textContent==='prototype-review');
  await page.screenshot({path:`/tmp/growth-console-${width}.png`,fullPage:true});
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'200% text must reflow');
  if(width<768)await page.locator('#guide-toggle').click();
  for(const selector of ['#guide-action','#guide-close','#task-toggle','#review-confirm'])assert.ok((await page.locator(selector).boundingBox()).height>=44);
  const overlap=await page.evaluate(()=>{const a=document.getElementById('task-card').getBoundingClientRect(),b=document.getElementById('review-confirm').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});assert.equal(overlap,false);
  assert.equal(await page.locator('#task-phase').getAttribute('aria-live'),'polite');assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('task-card')).animationName),'none');
  await page.locator('#exit-prototype').click();assert.equal(await page.locator('#source-url').inputValue(),'');
  await page.reload();assert.match(await page.locator('#task-phase').innerText(),/尚未開始/);assert.equal(await page.locator('#result-panel').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.deepEqual(await context.cookies(),[]);assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);assert.ok(posts.every(p=>p==='/api/product-source'));
  console.log(`PASS console ${width}: URL HTTP/parser/SQLite → cited result → exact page-only review; six labelled scenes; failure/late response; return, focus, 200% text, reduced motion, zero hosted writes`);await context.close();
 }
 // Exercise the exact additive Sites route/module package; no Python backend is implied.
 const manifest=JSON.parse(await readFile('delivery/growth-console/SHA256.json'));
 const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());requests.push(route.request().method()+' '+u.pathname);
  if(u.origin!=='https://console.example.invalid')return route.abort();
  if(u.pathname==='/api/product-source')return route.fulfill({status:404,contentType:'application/json',body:'{"code":"not_found"}'});
  const file=u.pathname==='/growth-console'?'growth-console.html':u.pathname.replace('/console-assets/','');
  assert.ok(Object.hasOwn(manifest.files,file));
  return route.fulfill({contentType:file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html',body:await readFile('delivery/growth-console/dist/'+file)});
 });
 await page.goto('https://console.example.invalid/growth-console');await page.locator('#source-url').fill('https://example.com/products/bolt');await page.locator('#source-submit').click();await page.locator('#source-feedback').filter({hasText:'尚未連接可用的來源服務'}).waitFor();
 assert.equal(await page.locator('#source-url').inputValue(),'https://example.com/products/bolt');assert.deepEqual(errors,[]);assert.equal(requests.filter(x=>x.startsWith('POST')).length,1);
 await page.locator('#prototype-tools summary').click();await page.locator('[data-scenario=review]').click();await page.locator('#result-panel:not([hidden])').waitFor();assert.match(await page.locator('#mode-banner').innerText(),/合成互動原型/);assert.deepEqual(errors,[]);await context.close();
 console.log('PASS exact /growth-console package: asset graph, unavailable backend retains URL, labelled prototype available; no hosted API claim');
}finally{if(browser)await browser.close();server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));await rm(temp,{recursive:true,force:true});}
