import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {build} from './build.mjs';
await build();
const fields=['title','meta_description','description'];
const fixture=()=>({snapshot:{id:'test-a',version:'source-a',original_url:'https://example.invalid/a',final_url:'https://example.invalid/a',citations:[]},facts:{},inferences:[],missing:['price'],preview:{source_snapshot_id:'test-a',source_version:'source-a',fields:Object.fromEntries(fields.map(k=>[k,{original:'原文 '+k,suggested:'候選 '+k,reason:'測試用來源',citations:['s1']}])),pending_confirmation:['price']}});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined}),checks=[];
try{for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',permissions:['clipboard-read','clipboard-write'],acceptDownloads:true}),page=await context.newPage(),errors=[],requests=[];
 const origin='http://localhost:4319';let result=fixture();
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());requests.push([req.method(),u.pathname]);assert.equal(u.origin,origin);
  if(u.pathname==='/api/product-source'){assert.equal(req.method(),'POST');return route.fulfill({json:result});}
  assert.equal(req.method(),'GET');const name=u.pathname.slice(1);assert.ok(/^[a-z-]+\.(html|mjs|css)$/.test(name));return route.fulfill({contentType:name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',body:await readFile('delivery/web-preview/dist/'+name)});
 });page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/first-result.html');await page.locator('#source-url').fill('https://example.invalid/a');await page.locator('#source-submit').click();await page.locator('#result-section').waitFor();
 const reason=page.locator('#review-next-reason'),cta=page.locator('#review-next'),description=page.locator('#review-description');
 const focus=()=>page.evaluate(()=>document.activeElement.id);
 async function go(id){await cta.focus();await page.keyboard.press('Enter');assert.equal(await focus(),id);}
 assert.equal(await reason.getAttribute('role'),'status');assert.equal(await reason.getAttribute('aria-live'),'polite');assert.equal(await reason.getAttribute('aria-atomic'),'true');assert.equal(await cta.getAttribute('aria-describedby'),'review-next-reason');
 await go('review-check-title');assert.equal(await page.locator('#review-check-title').isChecked(),false);
 await description.fill('保留的使用者文字');assert.equal(await focus(),'review-description');assert.match(await reason.textContent(),/已修改的 產品描述/);assert.match(await reason.textContent(),/不等於內容錯誤/);
 await page.locator('#review-title').fill(' ');assert.match(await reason.textContent(),/先修正 Title/);await go('review-title');assert.equal(await description.inputValue(),'保留的使用者文字');
 await page.locator('#review-title').fill('候選 title');await go('review-check-description');await page.keyboard.press('Space');assert.equal(await focus(),'review-check-description');assert.match(await reason.textContent(),/下一步核對 Title/);
 await go('review-check-title');await page.keyboard.press('Space');await go('review-check-meta_description');await page.keyboard.press('Space');assert.match(await reason.textContent(),/三欄均已核對/);await go('review-confirm');assert.equal(await page.locator('#review-state').textContent(),'待確認 · 未保存 · 未發布');
 // Hold digest completion to verify pending, cancellation, and late confirmation.
 await page.evaluate(()=>{window.realDigest=crypto.subtle.digest.bind(crypto.subtle);crypto.subtle.digest=(...args)=>new Promise(resolve=>{window.releaseDigest=()=>window.realDigest(...args).then(resolve);});});
 await page.keyboard.press('Enter');await reason.filter({hasText:'正在確認'}).waitFor();assert.equal(await cta.isVisible(),false);await description.fill('再次編輯保留');assert.equal(await focus(),'review-description');await page.evaluate(()=>{window.releaseDigest();crypto.subtle.digest=window.realDigest;});await page.waitForTimeout(30);assert.match(await reason.textContent(),/已修改的 產品描述/);assert.match(await page.locator('#review-state').textContent(),/待確認/);
 await go('review-check-description');await page.keyboard.press('Space');await go('review-confirm');await page.keyboard.press('Enter');await reason.filter({hasText:'可複製文本'}).waitFor();await go('copy-result');await page.keyboard.press('Enter');assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/再次編輯保留/);assert.match(await page.locator('#result-feedback').textContent(),/未保存、未發布/);
 await page.keyboard.press('Tab');assert.equal(await focus(),'export-result');const downloading=page.waitForEvent('download');await page.keyboard.press('Enter');const d=await downloading;const exported=JSON.parse(await readFile(await d.path(),'utf8'));assert.equal(exported.preview.fields.description.suggested,'再次編輯保留');assert.equal(exported.review.persisted,false);assert.equal(exported.preview.published,false);
 // Source changes retain edits; pending/cancelled source responses cannot replace them.
 await page.evaluate(()=>{window.pendingFetch=[];window.realFetch=fetch;window.fetch=()=>new Promise(resolve=>window.pendingFetch.push(resolve));});
 await page.locator('#source-url').fill('https://example.invalid/b');assert.equal(await focus(),'source-url');assert.doesNotMatch(await reason.textContent(),/可複製文本/);assert.equal(await description.inputValue(),'再次編輯保留');await page.locator('#source-submit').click();assert.match(await reason.textContent(),/暫停核稿導航/);assert.equal(await cta.isVisible(),false);
 await page.locator('#source-cancel').click();assert.equal(await description.inputValue(),'再次編輯保留');await page.evaluate(r=>window.pendingFetch[0](new Response(JSON.stringify(r))),{...fixture(),preview:{...fixture().preview,fields:{...fixture().preview.fields,title:{...fixture().preview.fields.title,suggested:'LATE'}}}});await page.waitForTimeout(30);assert.notEqual(await page.locator('#review-title').inputValue(),'LATE');assert.doesNotMatch(await reason.textContent(),/可複製文本/);
 await page.evaluate(()=>window.fetch=window.realFetch);result=fixture();result.snapshot.id='test-b';result.snapshot.version='source-b';result.preview.source_snapshot_id='test-b';result.preview.source_version='source-b';await page.locator('#source-submit').click();await page.locator('#retained-source').filter({hasText:'source-b'}).waitFor();assert.match(await reason.textContent(),/下一步核對 Title/);assert.equal(await page.locator('#review-check-description').isChecked(),false);
 await description.fill('待取消');await page.locator('#review-cancel').click();assert.equal(await description.inputValue(),'候選 description');assert.match(await reason.textContent(),/下一步核對 Title/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(await cta.evaluate(e=>e.getBoundingClientRect().height)>=44);assert.deepEqual(errors,[]);assert.equal(requests.filter(([method])=>method==='POST').length,2);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 await page.screenshot({path:`/tmp/review-navigation-${width}.png`,fullPage:true});checks.push(`${width}: priority/focus/keyboard/live-region/edit retention/pending/late/source/cancel/copy/export; no extra API or storage`);console.log('PASS review navigation '+checks.at(-1));await context.close();
}await writeFile('/tmp/review-navigation-evidence.json',JSON.stringify({scope:'derived same-route UI with synthetic transport; not deployed',checks},null,2));}finally{await browser.close();}
