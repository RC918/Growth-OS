import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const files=resolve('apps/web');
const server=createServer(async(req,res)=>{
 try{const path=resolve(files,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(files+'/'))throw Error();
 res.setHeader('Content-Type',extname(path)==='.mjs'?'text/javascript':extname(path)==='.css'?'text/css':'text/html');res.end(await readFile(path));
 }catch{res.statusCode=404;res.end();}
});
await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
const origin=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage(),remote=[],errors=[];
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){remote.push(route.request().url());return route.abort();}return route.continue();});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(origin+'/offline-growth-plan.html');
 const approve=page.locator('#plan-approve'),start=page.locator('#plan-start'),complete=page.locator('#plan-complete'),edit=page.getByLabel('預覽交付物'),result=page.getByLabel('內部結果位置或失敗原因');
 assert.equal(await start.isDisabled(),true);assert.equal(await complete.isDisabled(),true);assert.equal(await page.locator('#plan-history article').count(),1);
 assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),/connect-src 'none'/);
 // Real keyboard activation, with status focus returned for announcements.
 await approve.focus();await page.keyboard.press('Enter');assert.equal(await start.isDisabled(),false);
 await edit.fill('尚未保存的修訂');assert.equal(await start.isDisabled(),true);
 await page.getByRole('button',{name:'捨棄未保存修改'}).click();assert.equal(await edit.inputValue(),'產品標題與描述預覽（尚未生成）');assert.equal(await start.isDisabled(),false);
 await start.focus();await page.keyboard.press('Space');assert.equal(await complete.isDisabled(),false);
 await complete.click();assert.match(await page.locator('#plan-feedback').innerText(),/請提供內部結果/);assert.equal(await page.locator('#plan-history article').count(),3);
 await result.fill('合成內部預覽 <img src="https://invalid.example/leak">');await complete.click();assert.match(await page.locator('#plan-current').innerText(),/內部模擬完成/);assert.equal(await page.locator('#plan-history article').count(),4);assert.equal(await page.locator('#plan-history img').count(),0);
 await edit.fill('');await page.getByRole('button',{name:'建立修訂版本'}).click();assert.match(await page.locator('#plan-feedback').innerText(),/請填寫/);assert.equal(await edit.inputValue(),'');assert.equal(await page.locator('#plan-history article').count(),4);
 await edit.fill('第二版交付物');await page.getByRole('button',{name:'建立修訂版本'}).click();assert.match(await page.locator('#plan-current').innerText(),/計畫版本 2 · 待確認/);assert.equal(await start.isDisabled(),true);assert.equal(await page.locator('#plan-history article').count(),5);assert.match(await page.locator('#plan-history').innerText(),/合成內部預覽/);
 await approve.click();await start.click();await result.fill('合成缺資料');await page.getByRole('button',{name:'記錄模擬失敗'}).click();assert.match(await page.locator('#plan-current').innerText(),/模擬失敗/);await start.click();assert.match(await page.locator('#plan-current').innerText(),/模擬進行中/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);
 await page.reload();assert.equal(await page.locator('#plan-history article').count(),1);assert.match(await page.locator('#plan-current').innerText(),/計畫版本 1 · 待確認/);
 assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);await context.close();
 console.log(`PASS ${width}px: approval/edit/cancel/revision/complete/failure/retry/history/reload; no remote/storage/errors/overflow`);
 }
}finally{if(browser)await browser.close();await new Promise(yes=>server.close(yes));}
