// Localhost assets only. All non-local requests are blocked, never fulfilled remotely.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(process.env.GROWTH_PLAYWRIGHT_PATH||new URL('../../package.json',import.meta.url));
const {chromium}=require('playwright');
const files=resolve('apps/web');
const server=createServer(async(req,res)=>{
 try{const path=resolve(files,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(files+'/'))throw Error();
  res.setHeader('Content-Type',extname(path)==='.mjs'?'text/javascript':extname(path)==='.css'?'text/css':'text/html');res.end(await readFile(path));
 }catch{res.statusCode=404;res.end();}
});
await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
const origin=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({...(process.env.GROWTH_CHROMIUM_PATH?{executablePath:process.env.GROWTH_CHROMIUM_PATH}:{})});
 for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage();const remote=[],errors=[];
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();remote.push(route.request().url());return route.abort();});
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(origin+'/offline-draft-review.html');
  await page.getByText('先檢查來源與提議；確認不代表保存或發布。',{exact:true}).waitFor();
  assert.match(await page.locator('#draft-source-text').innerText(),/合成零件/);
  assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),/connect-src 'none'/);
  const confirm=page.getByRole('button',{name:'確認目前草稿',exact:true}),save=page.getByRole('button',{name:'模擬保存下一項',exact:true});
  assert.equal(await save.isDisabled(),true);assert.equal(await page.locator('#draft-history article').count(),1);
  await confirm.click();await page.getByText('本次草稿已確認；尚未模擬保存。',{exact:true}).waitFor();assert.equal(await save.isDisabled(),false);
  if(process.env.GROWTH_UI_OUTPUT){await mkdir(process.env.GROWTH_UI_OUTPUT,{recursive:true});await page.screenshot({path:resolve(process.env.GROWTH_UI_OUTPUT,`Growth-OS-offline-draft-${width}.png`),fullPage:true});}
  await page.getByLabel('推廣內容',{exact:true}).fill('合成修訂零件 <img src="https://invalid.example/leak">');
  assert.equal(await save.isDisabled(),true);assert.match(await page.locator('#draft-phase').innerText(),/重新確認/);
  await confirm.click();await page.getByText('本次草稿已確認；尚未模擬保存。',{exact:true}).waitFor();
  await page.getByRole('button',{name:'取消本次草稿',exact:true}).click();assert.equal(await page.locator('#draft-history article').count(),1);assert.equal(await page.locator('#draft-review textarea').count(),0);
  assert.equal(await page.locator('#draft-feedback').evaluate(el=>el===document.activeElement),true);
  await page.getByRole('button',{name:'重新查看草稿',exact:true}).click();assert.equal(await save.isDisabled(),true);assert.match(await page.getByLabel('推廣內容',{exact:true}).inputValue(),/合成修訂零件/);
  assert.equal(await page.getByLabel('推廣內容',{exact:true}).evaluate(el=>el===document.activeElement),true);
  await confirm.click();await page.getByText('本次草稿已確認；尚未模擬保存。',{exact:true}).waitFor();await save.click();
  await page.getByText('已追加並讀回本頁模擬版本；下一項需重新確認。',{exact:true}).waitFor();
  assert.equal(await page.locator('#draft-history article').count(),2);assert.equal(await save.isDisabled(),true);assert.equal(await page.locator('img').count(),0);
  assert.match(await page.locator('#draft-history').innerText(),/<img src=/);assert.match(await page.locator('#draft-source-text').innerText(),/合成測試：希望海外採購人員找到合成零件/);
  await page.getByRole('button',{name:'取消本次草稿',exact:true}).click();assert.equal(await page.locator('#draft-history article').count(),2);
  await page.getByRole('button',{name:'重新查看草稿',exact:true}).click();await page.getByLabel('目標受眾',{exact:true}).fill(' ');
  await confirm.click();await page.getByText('請填寫 1 到 2000 字的內容。',{exact:true}).waitFor();assert.equal(await save.isDisabled(),true);
  await page.getByLabel('目標受眾',{exact:true}).fill('合成採購人員');await confirm.click();await page.getByText('本次草稿已確認；尚未模擬保存。',{exact:true}).waitFor();await save.click();
  await page.getByText('兩項已模擬保存 · 資料仍未收集完整',{exact:true}).waitFor();assert.equal(await page.locator('#draft-history article').count(),3);assert.match(await page.locator('#draft-review').innerText(),/市場與語言.*流量渠道.*網站或連結.*觀察指標/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByLabel('合成案例',{exact:true}).selectOption('shop');await page.getByText('已切換合成案例，本頁模擬紀錄已重設；沒有遠端資料變更。',{exact:true}).waitFor();assert.match(await page.locator('#draft-source-text').innerText(),/合成杯子/);assert.equal(await page.locator('#draft-history article').count(),1);assert.equal(await save.isDisabled(),true);
  await page.reload();await page.getByText('先檢查來源與提議；確認不代表保存或發布。',{exact:true}).waitFor();assert.equal(await page.locator('#draft-history article').count(),1);
  assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
  assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}px offline draft: sources, edit invalidation, cancel/reopen, reconfirm, ordered memory saves/readback, missing data, immutable history, text-only rendering, refresh reset, no remote requests, no storage, no overflow/errors`);
 }
}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
