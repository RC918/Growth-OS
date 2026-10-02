import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
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
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'匯出成果與來源 JSON'}).click();const download=await downloadPromise;const report=JSON.parse(await readFile(await download.path(),'utf8'));
 const bytes=Buffer.from(report.snapshot.content_base64,'base64');assert.equal(createHash('sha256').update(bytes).digest('hex'),report.snapshot.version);assert.equal(report.preview.published,false);assert.ok(Object.values(report.preview.fields).every(f=>f.suggested&&f.citations.length));
 await page.evaluate(()=>{window.originalClipboardWrite=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async()=>{throw Error('denied');};});await page.getByRole('button',{name:'複製全部文本'}).click();await page.locator('#copy-fallback:not([hidden])').waitFor();assert.match(await page.locator('#copy-fallback').inputValue(),/Bolt A/);
 await page.evaluate(()=>{navigator.clipboard.writeText=window.originalClipboardWrite;});
 async function retained(expected){
  await page.getByRole('button',{name:'複製全部文本'}).focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),copiedText);
  const event=page.waitForEvent('download');await page.getByRole('button',{name:'匯出成果與來源 JSON'}).focus();await page.keyboard.press('Enter');const file=await event;const value=JSON.parse(await readFile(await file.path(),'utf8'));
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
 const mixedDownload=page.waitForEvent('download');await page.getByRole('button',{name:'匯出成果與來源 JSON'}).click();const mixedFile=await mixedDownload;const mixedReport=JSON.parse(await readFile(await mixedFile.path(),'utf8'));
 await submit('/unscoped');assert.equal(await page.locator('#result-section').isVisible(),true);assert.match(await page.locator('#source-fallback').innerText(),/無法將公開描述明確歸屬/);
 await submit('/multiple');assert.equal(await page.locator('#result-section').isVisible(),true);assert.match(await page.locator('#source-fallback').innerText(),/選擇/);await retained(mixedReport);
 // Controlled late responses deliberately ignore AbortSignal to prove epoch isolation.
 await page.evaluate(()=>{window.realFetch=window.fetch;window.pending=[];window.fetch=()=>new Promise(resolve=>window.pending.push(resolve));});
 await input.fill('https://example.com/pending');await input.press('Enter');
 await page.evaluate(()=>{document.getElementById('source-form').requestSubmit();document.getElementById('source-form').requestSubmit();});
 assert.equal(await page.evaluate(()=>window.pending.length),1);
 await page.getByRole('button',{name:'取消讀取',exact:true}).focus();await page.keyboard.press('Enter');assert.match(await page.locator('#source-feedback').innerText(),/已取消/);
 const stale=structuredClone(report);stale.preview.fields.title.suggested='STALE RESPONSE';
 async function resolve(index,value){await page.evaluate(({index,value})=>window.pending[index]({ok:true,json:async()=>value}),{index,value});await page.evaluate(()=>new Promise(requestAnimationFrame));}
 await resolve(0,stale);await retained(mixedReport);assert.doesNotMatch(await page.locator('#result-fields').innerText(),/STALE RESPONSE/);
 await input.press('Enter');assert.equal(await page.evaluate(()=>window.pending.length),2);
 await input.fill('https://example.com/newer');await input.press('Enter');assert.equal(await page.evaluate(()=>window.pending.length),3);
 await resolve(2,report);await page.locator('#source-submit:not([disabled])').waitFor();await retained(report);
 await resolve(1,stale);await retained(report);assert.doesNotMatch(await page.locator('#result-fields').innerText(),/STALE RESPONSE/);
 await page.evaluate(()=>{window.fetch=window.realFetch;});
 await input.fill('not-a-url');await page.getByRole('button',{name:'取得第一份成果',exact:true}).click();assert.equal(await input.inputValue(),'not-a-url');assert.equal(await input.evaluate(e=>e.checkValidity()),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
 assert.equal(await page.getByText('已發布',{exact:true}).count(),0);
 await context.close();console.log('PASS '+width+'px URL/API/SQLite/parser/preview/citations/unknown/copy/export/fallback/recovery; no remote/storage/errors/overflow');
 }
}finally{if(browser)await browser.close();server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));await rm(temp,{recursive:true,force:true});}
