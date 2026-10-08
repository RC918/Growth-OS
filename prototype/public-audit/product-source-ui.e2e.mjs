import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createResultReview} from '../../apps/web/first-result-review.mjs';
import {validateReport} from '../../apps/web/first-result-payload.mjs';
const temp=await mkdtemp(join(tmpdir(),'growth-source-ui-'));
const server=spawn('python3',['-B','prototype/public-audit/product_ui_fixture.py',join(temp,'sources.sqlite3')],{stdio:['ignore','pipe','pipe']});
let browser;
try{
 const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fixture HTTP server did not start')),10000);server.stdout.once('data',data=>{clearTimeout(timer);resolve(Number(data.toString().trim()));});server.once('exit',code=>{clearTimeout(timer);reject(Error('Fixture server exited '+code));});});
 const origin='http://127.0.0.1:'+port;browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 for(const width of [1280,390]){
 server.kill('SIGUSR1'); // Separate viewport cases start with a fresh test-only rate window.
 const context=await browser.newContext({viewport:{width,height:844},permissions:['clipboard-read','clipboard-write'],acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage(),remote=[],errors=[];
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){remote.push(route.request().url());return route.abort();}return route.continue();});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('422')&&!m.text().includes('400'))errors.push(m.text());});
 // Chromium silently drops download #11 in a one-second renderer burst.
 // Use real downloads throughout; pace each batch, not the event timeout.
 // https://github.com/chromium/chromium/blob/145.0.7632.6/third_party/blink/renderer/core/frame/local_frame.cc#L3897-L3912
 let downloadCount=0,lastDownloadAt=0;
 async function exportReport(keyboard=false){
  if(downloadCount>0&&downloadCount%10===0){
   const delay=Math.max(0,1100-(performance.now()-lastDownloadAt));
   if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  }
  const event=page.waitForEvent('download');
  const button=page.getByRole('button',{name:'匯出成果與來源 JSON'});
  if(keyboard){await button.focus();await page.keyboard.press('Enter');}else await button.click();
  const file=await event;lastDownloadAt=performance.now();downloadCount++;
  return JSON.parse(await readFile(await file.path(),'utf8'));
 }
 await page.goto(origin+'/first-result.html');const input=page.getByLabel('產品頁網址');
 async function submit(path){await input.fill('https://example.com'+path);await page.getByRole('button',{name:'取得第一份成果',exact:true}).click();await page.locator('#source-submit:not([disabled])').waitFor();}
 await submit('/capacity');assert.equal(await page.locator('#result-section').isVisible(),false);assert.match(await page.locator('#source-feedback').innerText(),/不會釋放容量/);
 await submit('/old');assert.equal(await page.locator('#result-section').isVisible(),true);
 assert.equal(await page.locator('#result-fields .comparison').count(),3);assert.match(await page.locator('#result-fields').innerText(),/Bolt A/);assert.match(await page.locator('#result-fields').innerText(),/原文/);assert.match(await page.locator('#result-fields').innerText(),/建議/);assert.match(await page.locator('#result-fields').innerText(),/來源支持/);
 await page.getByText('來源快照與產品理解',{exact:true}).click();
 assert.match(await page.locator('#source-summary').innerText(),/original_url: https:\/\/example.com\/old/);assert.match(await page.locator('#source-summary').innerText(),/final_url: https:\/\/example.com\/products\/bolt/);
 assert.match(await page.locator('#source-facts').innerText(),/fact/);assert.match(await page.locator('#source-facts').innerText(),/inference/);assert.match(await page.locator('#source-facts').innerText(),/unknown/);assert.match(await page.locator('#result-missing').innerText(),/價格/);
 assert.match(await page.locator('#source-citations').innerText(),/Public steel bolt/);
 await page.getByRole('button',{name:'複製全部文本'}).click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Bolt A/);const copiedText=await page.evaluate(()=>navigator.clipboard.readText());
 const report=await exportReport();
 const bytes=Buffer.from(report.snapshot.content_base64,'base64');assert.equal(createHash('sha256').update(bytes).digest('hex'),report.snapshot.version);assert.equal(report.preview.published,false);assert.ok(Object.values(report.preview.fields).every(f=>f.suggested&&f.citations.length));
 await page.evaluate(()=>{window.originalClipboardWrite=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async()=>{throw Error('denied');};});await page.getByRole('button',{name:'複製全部文本'}).click();await page.locator('#copy-fallback:not([hidden])').waitFor();assert.match(await page.locator('#copy-fallback').inputValue(),/Bolt A/);
 await page.evaluate(()=>{navigator.clipboard.writeText=window.originalClipboardWrite;});
 async function retained(expected){
  await page.getByRole('button',{name:'複製全部文本'}).focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),copiedText);
  const value=await exportReport(true);
  assert.deepEqual(value,expected);assert.equal(createHash('sha256').update(Buffer.from(value.snapshot.content_base64,'base64')).digest('hex'),value.snapshot.version);
 }
 await input.fill('https://example.com/changed');await retained(report);
 for(const [path,text] of [['/capacity','不會釋放容量'],['/timeout','超時'],['/oversized','1 MB'],['/complexity','解析上限'],['/unknown','產品頁']]){
  await submit(path);assert.equal(await input.inputValue(),'https://example.com'+path);assert.match(await page.locator('#source-feedback').innerText(),new RegExp(text));assert.equal(await page.locator('#result-section').isVisible(),true);await retained(report);assert.match(await page.locator('#source-feedback').innerText(),new RegExp(text));
 }
 server.kill('SIGUSR1');
 await submit('/catalog');await page.getByRole('button',{name:'使用候選：Bolt A'}).click();await page.locator('#source-submit:not([disabled])').waitFor();assert.equal(await input.inputValue(),'https://example.com/products/bolt');assert.equal(await page.locator('#result-section').isVisible(),true);
 server.kill('SIGUSR1');
 await submit('/mixed');assert.equal(await page.locator('#result-section').isVisible(),true);
 assert.match(await page.locator('#result-fields').innerText(),/Public steel bolt/);
 assert.doesNotMatch(await page.locator('#result-fields').innerText(),/Free delivery|Free returns|900 watt|1200 watt|Other drill/);
 const mixedReport=await exportReport();
 await submit('/unscoped');assert.equal(await page.locator('#result-section').isVisible(),true);assert.match(await page.locator('#source-fallback').innerText(),/無法將公開描述明確歸屬/);
 await submit('/multiple');assert.equal(await page.locator('#result-section').isVisible(),true);assert.match(await page.locator('#source-fallback').innerText(),/選擇/);await retained(mixedReport);
 // Controlled late responses deliberately ignore AbortSignal to prove epoch isolation.
 await page.evaluate(()=>{window.realFetch=window.fetch;window.pending=[];window.fetch=()=>new Promise(resolve=>window.pending.push(resolve));});
 await input.fill('https://example.com/pending');await input.press('Enter');
 await page.evaluate(()=>{document.getElementById('source-form').requestSubmit();document.getElementById('source-form').requestSubmit();});
 assert.equal(await page.evaluate(()=>window.pending.length),1);assert.equal(await page.locator('#source-submit').getAttribute('aria-busy'),'true');assert.match(await page.locator('#source-submit').innerText(),/正在取得/);
 await page.getByRole('button',{name:'取消讀取',exact:true}).focus();await page.keyboard.press('Enter');assert.match(await page.locator('#source-feedback').innerText(),/已取消/);
 const stale=structuredClone(report);stale.preview.fields.title.suggested='STALE RESPONSE';
 async function resolve(index,value){await page.evaluate(({index,value})=>window.pending[index]({ok:true,json:async()=>value}),{index,value});await page.evaluate(()=>new Promise(requestAnimationFrame));}
 await resolve(0,stale);await retained(mixedReport);assert.doesNotMatch(await page.locator('#review-title').inputValue(),/STALE RESPONSE/);
 await input.press('Enter');assert.equal(await page.evaluate(()=>window.pending.length),2);
 await input.fill('https://example.com/newer');await input.press('Enter');assert.equal(await page.evaluate(()=>window.pending.length),3);
 await resolve(2,report);await page.locator('#source-submit:not([disabled])').waitFor();await retained(report);
 await resolve(1,stale);await retained(report);assert.doesNotMatch(await page.locator('#review-title').inputValue(),/STALE RESPONSE/);
 await page.evaluate(()=>{window.fetch=window.realFetch;});
 await input.fill('not-a-url');await page.getByRole('button',{name:'取得第一份成果',exact:true}).click();assert.equal(await input.inputValue(),'not-a-url');assert.equal(await input.evaluate(e=>e.checkValidity()),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
 assert.equal(await page.getByText('已發布',{exact:true}).count(),0);
 server.kill('SIGUSR1');
 await submit('/woo');assert.equal(await page.locator('#result-section').isVisible(),true);
 assert.match(await page.locator('#result-fields').innerText(),/Steel bolt for workshop assembly/);
 assert.doesNotMatch(await page.locator('#result-fields').innerText(),/Shipping|delivery|unrelated drill/);
 await page.getByRole('button',{name:'複製全部文本'}).focus();await page.keyboard.press('Enter');assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Steel bolt for workshop assembly/);
 const wooReport=await exportReport(true);assert.equal(wooReport.extraction.method,'woocommerce_single_product');
 assert.equal(createHash('sha256').update(Buffer.from(wooReport.snapshot.content_base64,'base64')).digest('hex'),wooReport.snapshot.version);
 assert.ok(Object.values(wooReport.preview.fields).every(f=>f.suggested&&f.citations.every(id=>wooReport.snapshot.citations.some(c=>c.id===id&&c.source_version===wooReport.snapshot.version))));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
 await submit('/woo-micro');assert.match(await page.locator('#review-description').inputValue(),/Hexagonal head/);
 await page.getByRole('button',{name:'複製全部文本'}).focus();await page.keyboard.press('Enter');assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Hexagonal head/);
 const microReport=await exportReport(true);assert.equal(microReport.extraction.method,'explicit_product_microdata');assert.equal(microReport.facts.features[0].value,'Hexagonal head');
 assert.equal(createHash('sha256').update(Buffer.from(microReport.snapshot.content_base64,'base64')).digest('hex'),microReport.snapshot.version);
 for(const f of [microReport.facts.description,...microReport.facts.features]){assert.equal(f.product_scope.product_name,'Bolt A');assert.ok(microReport.facts.product_name.citations.every(id=>f.citations.includes(id)));}
 const conflictResponse=page.waitForResponse(r=>r.url().endsWith('/api/product-source')&&r.request().method()==='POST');
 await submit('/woo-conflict');const conflictReport=await (await conflictResponse).json();assert.equal(conflictReport.preview,null);assert.equal(conflictReport.extraction.method,'conflicting_product_evidence');
 assert.match(await page.locator('#source-feedback').innerText(),/本次未產生新成果/);assert.match(await page.locator('#review-description').inputValue(),/Hexagonal head/);
 assert.deepEqual(await exportReport(true),microReport);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
 await submit('/woo-named');
 await page.getByRole('button',{name:'複製全部文本'}).focus();await page.keyboard.press('Enter');
 const namedCopy=await page.evaluate(()=>navigator.clipboard.readText());assert.match(namedCopy,/Bolt A is a steel fastener for workshop assembly/);assert.doesNotMatch(namedCopy,/Bolt A\. Bolt A/);
 const namedReport=await exportReport(true);assert.equal(namedReport.preview.fields.description.suggested,'Bolt A is a steel fastener for workshop assembly.');
 assert.equal(namedReport.preview.fields.description.original,namedReport.facts.description.value);
 assert.equal(createHash('sha256').update(Buffer.from(namedReport.snapshot.content_base64,'base64')).digest('hex'),namedReport.snapshot.version);
 assert.ok(namedReport.facts.description.citations.every(id=>namedReport.preview.fields.description.citations.includes(id)));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
 // Review the actual result in place; no goal/intake or remote authority.
 const keys=['title','meta_description','description'];
 async function checkUsedFacts(){for(const key of keys){const box=page.locator('#review-check-'+key);if(!await box.isChecked()){await box.focus();await page.keyboard.press('Space');}}}
 async function confirmReview(){await page.locator('#review-confirm').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.getElementById('review-state').textContent.startsWith('本頁已確認'));}
 async function editText(key,text){const field=page.locator('#review-'+key);await field.focus();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type(text);}
 assert.equal(await page.locator('#review-confirm').isDisabled(),true);
 for(const key of keys){const value=await page.locator('#review-'+key).inputValue();await editText(key,'   ');assert.equal(await page.locator('#review-'+key).getAttribute('aria-invalid'),'true');assert.match(await page.locator('#review-error-'+key).innerText(),/不能只有空白/);assert.ok((await page.locator('#review-'+key).getAttribute('aria-describedby')).includes('review-error-'+key));assert.equal(await page.locator('#review-confirm').isDisabled(),true);await editText(key,value);assert.equal(await page.locator('#review-'+key).getAttribute('aria-invalid'),'false');}
 await page.locator('#review-description').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('#review-check-description').evaluate(e=>e===document.activeElement),true);assert.ok(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle!=='none'));
 await editText('title','Revised workshop bolt');assert.match(await page.locator('#review-origin-title').innerText(),/使用者修改/);
 assert.equal(await page.locator('#result-fields .comparison').first().locator('div').first().locator('p').innerText(),namedReport.preview.fields.title.original);
 await checkUsedFacts();await confirmReview();assert.match(await page.locator('#review-state').innerText(),/本頁已確認 · 未保存 · 未發布/);
 const reviewed=await exportReport(true);assert.equal(reviewed.preview.fields.title.suggested,'Revised workshop bolt');assert.equal(reviewed.preview.fields.title.citation_role,'reference_only_for_user_edit');
 assert.deepEqual(reviewed.snapshot,namedReport.snapshot);assert.deepEqual(reviewed.facts,namedReport.facts);
 const fields=Object.fromEntries(await Promise.all(keys.map(async key=>[key,await page.locator('#review-'+key).inputValue()])));
 const binding={original_url:reviewed.snapshot.original_url,final_url:reviewed.snapshot.final_url,snapshot_id:reviewed.snapshot.id,source_version:reviewed.snapshot.version};
 const contentHash='sha256:'+createHash('sha256').update(JSON.stringify({schema_version:1,...binding,revision:reviewed.review.revision,fields})).digest('hex');
 assert.equal(reviewed.review.content_digest,contentHash);assert.equal(reviewed.review.confirmation.content_digest,contentHash);assert.deepEqual(reviewed.review.confirmation.fact_checks,reviewed.review.fact_checks);
 await page.locator('#copy-result').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),keys.map(key=>({title:'Title',meta_description:'Meta description',description:'產品描述'}[key])+':\n'+fields[key]).join('\n\n'));
 await editText('meta_description','User wording for review.');assert.match(await page.locator('#review-state').innerText(),/^待確認/);assert.equal(await page.locator('#review-check-meta_description').isChecked(),false);
 await page.locator('#review-cancel').focus();await page.keyboard.press('Enter');
 const cancelled=await exportReport(true);assert.equal(cancelled.review.confirmation,null);assert.equal(cancelled.preview.fields.title.suggested,namedReport.preview.fields.title.suggested);assert.ok(Object.values(cancelled.review.fact_checks).every(v=>!v));
 await checkUsedFacts();await confirmReview();await input.fill('https://example.com/another-source');
 const invalidated=await exportReport(true);assert.equal(invalidated.review.confirmation,null);assert.deepEqual(invalidated.snapshot,namedReport.snapshot);
 async function deferDigests(){await page.evaluate(()=>{window.realDigest=crypto.subtle.digest.bind(crypto.subtle);window.reviewDigests=[];crypto.subtle.digest=(...args)=>new Promise((resolve,reject)=>window.reviewDigests.push(()=>window.realDigest(...args).then(resolve,reject)));});}
 async function finishDigest(index){await page.evaluate(index=>window.reviewDigests[index](),index);await page.evaluate(()=>new Promise(requestAnimationFrame));}
 async function restoreDigest(){await page.evaluate(()=>{crypto.subtle.digest=window.realDigest;});}
 await deferDigests();await page.locator('#review-confirm').click();await page.evaluate(()=>document.getElementById('review-confirm').dispatchEvent(new MouseEvent('click')));assert.equal(await page.evaluate(()=>window.reviewDigests.length),1);assert.equal(await page.locator('#review-confirm').getAttribute('aria-busy'),'true');assert.match(await page.locator('#review-confirm').innerText(),/正在確認/);
 await editText('title','New revision wins');await checkUsedFacts();await page.locator('#review-confirm').click();assert.equal(await page.evaluate(()=>window.reviewDigests.length),2);
 await finishDigest(1);await finishDigest(0);await restoreDigest();assert.match(await page.locator('#review-state').innerText(),/^本頁已確認/);
 const newest=await exportReport(true);assert.equal(newest.preview.fields.title.suggested,'New revision wins');assert.equal(newest.review.confirmation.revision,newest.review.revision);
 await editText('title','Obsolete source review');await checkUsedFacts();await deferDigests();await page.locator('#review-confirm').click();
 await submit('/woo');await finishDigest(0);await restoreDigest();assert.match(await page.locator('#review-state').innerText(),/^待確認/);
 const replaced=await exportReport(true);assert.notEqual(replaced.snapshot.id,namedReport.snapshot.id);assert.equal(replaced.review.confirmation,null);assert.equal(replaced.preview.fields.title.suggested,'Bolt A');
 await deferDigests();await page.locator('#export-result').click();await editText('title','Visible after export drift');await finishDigest(0);await restoreDigest();
 await page.waitForFunction(()=>!document.getElementById('export-result').disabled);assert.match(await page.locator('#result-feedback').innerText(),/匯出期間/);
 const afterDrift=await exportReport(true);assert.equal(afterDrift.preview.fields.title.suggested,'Visible after export drift');assert.equal(afterDrift.review.confirmation,null);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
 assert.equal(downloadCount,22);
 // New service/software contracts remain preview-only, including scripted clicks.
 server.kill('SIGUSR1');
 const oldEndpointResponse=page.waitForResponse(r=>r.url().endsWith('/api/product-source')&&r.request().method()==='POST');
 await submit('/service');assert.equal((await (await oldEndpointResponse).json()).preview,null);
 await page.goto(origin+'/service-result.html');
 const deniedOrigin=await context.request.post(origin+'/api/service-source',{headers:{Origin:'https://attacker.example'},data:{url:'https://example.com/service'}});
 assert.equal(deniedOrigin.status(),403);
 const deniedQuery=await context.request.post(origin+'/api/service-source',{data:{url:'https://example.com/service?private=1'}});
 assert.equal(deniedQuery.status(),400);
 const serviceResponse=page.waitForResponse(r=>r.url().endsWith('/api/service-source')&&r.request().method()==='POST');
 await submit('/service');const service=await (await serviceResponse).json();
 assert.equal(service.page_type,'service');
 assert.match(await page.locator('#result-title').innerText(),/服務／工具/);
 assert.match(await page.locator('#review-origin-description').innerText(),/保留原文；未產生改善/);
 assert.match(await page.locator('#review-origin-title').innerText(),/來源整理/);
 await page.getByText('來源快照與產品理解',{exact:true}).click();
 assert.match(await page.locator('#source-facts').innerText(),/服務／工具名稱/);
 for(const id of ['review-confirm','handoff-result','export-result'])assert.equal(await page.locator('#'+id).isVisible(),false);
 await assert.rejects(()=>createResultReview(service).export().then(validateReport),/INVALID_EVIDENCE_SCHEMA/);
 const extraRequests=[],downloads=[];const requestListener=r=>extraRequests.push(r.url());const downloadListener=d=>downloads.push(d);
 page.on('request',requestListener);page.on('download',downloadListener);
 await page.evaluate(()=>{for(const id of ['review-confirm','handoff-result','export-result'])document.getElementById(id).dispatchEvent(new MouseEvent('click'));});
 await page.locator('#copy-result').focus();await page.keyboard.press('Enter');
 assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Workshop help/);
 assert.equal(context.pages().length,1);assert.deepEqual(extraRequests,[]);assert.deepEqual(downloads,[]);
 page.off('request',requestListener);page.off('download',downloadListener);
 await editText('description','User supplied draft text.');assert.match(await page.locator('#review-origin-description').innerText(),/使用者修改；未核實/);
 await page.locator('#review-cancel').click();assert.match(await page.locator('#review-origin-description').innerText(),/保留原文/);
 await submit('/service-conflict');assert.match(await page.locator('#source-fallback').innerText(),/無法可靠辨識/);
 assert.equal(await page.locator('#review-title').inputValue(),'Workshop help');
 await submit('/software');assert.match(await page.locator('#review-status').innerText(),/軟體工具/);
 const subpageResponse=page.waitForResponse(r=>r.url().endsWith('/api/service-source')&&r.request().method()==='POST');
 await submit('/subpage');const subpage=await (await subpageResponse).json();
 assert.equal(subpage.page_type,'static_subpage');assert.match(await page.locator('#result-title').innerText(),/靜態子頁介紹/);
 assert.match(await page.locator('#source-facts').innerText(),/子頁名稱/);assert.match(await page.locator('#source-facts').innerText(),/Ready for your next workshop/);
 for(const key of ['title','meta_description','description'])assert.match(await page.locator('#review-origin-'+key).innerText(),/保留原文；未產生改善/);
 assert.equal(await page.locator('#review-title').inputValue(),'Workshop checklist | Sample');
 assert.match(await page.locator('#review-description').inputValue(),/^Describe the workshop goals/);
 assert.doesNotMatch(await page.locator('#result-fields').innerText(),/GLOBAL PRODUCT TEXT|Entire suite|DO NOT EXTRACT|SUPPLEMENT ONLY|Available without signup/);
 for(const id of ['review-confirm','handoff-result','export-result'])assert.equal(await page.locator('#'+id).isVisible(),false);
 await assert.rejects(()=>createResultReview(subpage).export().then(validateReport),/INVALID_EVIDENCE_SCHEMA/);
 extraRequests.length=0;downloads.length=0;page.on('request',requestListener);page.on('download',downloadListener);
 await page.evaluate(()=>{for(const id of ['review-confirm','handoff-result','export-result'])document.getElementById(id).dispatchEvent(new MouseEvent('click'));});
 await page.locator('#copy-result').click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Describe the workshop goals/);
 assert.deepEqual(extraRequests,[]);assert.deepEqual(downloads,[]);assert.equal(context.pages().length,1);
 page.off('request',requestListener);page.off('download',downloadListener);
 await editText('description','A user supplied introduction.');assert.match(await page.locator('#review-origin-description').innerText(),/使用者修改；未核實/);
 await page.locator('#review-cancel').click();assert.match(await page.locator('#review-origin-description').innerText(),/保留原文；未產生改善/);
 await submit('/subpage-conflict');assert.match(await page.locator('#source-fallback').innerText(),/無法可靠綁定靜態子頁介紹/);
 assert.equal(await page.locator('#review-title').inputValue(),'Workshop checklist | Sample');
 console.log('PASS '+width+'px static subpage URL binding, distinct header introduction, unchanged fields, edit/copy, conflict retention and closed downstream; synthetic only');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await submit('/products/bolt');assert.equal(await page.locator('#export-result').isVisible(),true);assert.equal(await page.locator('#handoff-result').isVisible(),true);
 assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
 console.log('PASS '+width+'px service/software source comparison, unchanged markers, edit/copy, conflict retention, closed handoff/export/import; synthetic only');
 await context.close();console.log('PASS '+width+'px URL/API/SQLite/parser/preview/citations/unknown/copy/export/fallback/recovery; 22 real downloads; no remote/storage/errors/overflow');
 }
}finally{if(browser)await browser.close();server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));await rm(temp,{recursive:true,force:true});}
