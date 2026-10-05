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
async function keyboardAcceptance(page){
 // Start from browser's initial focus. Navigate and activate only with real key events.
 const offering=page.getByLabel('推廣內容',{exact:true}),audience=page.getByLabel('目標受眾',{exact:true});
 const confirm=page.getByRole('button',{name:'確認目前草稿',exact:true}),save=page.getByRole('button',{name:'模擬保存下一項',exact:true}),cancel=page.getByRole('button',{name:'取消本次草稿',exact:true});
 const feedback=page.locator('#draft-feedback'),reopen=page.getByRole('button',{name:'重新查看草稿',exact:true});
 async function key(name,target){await page.keyboard.press(name);assert.equal(await target.evaluate(el=>el===document.activeElement),true,`${name}: expected focus on ${await target.evaluate(el=>el.id||el.textContent)}`);}
 async function confirmed(){await page.getByText('本次草稿已確認；尚未模擬保存。',{exact:true}).waitFor();assert.equal(await feedback.evaluate(el=>el===document.activeElement),true);}
 await key('Tab',page.locator('.brand'));await key('Tab',page.locator('#draft-fixture'));await key('Shift+Tab',page.locator('.brand'));await key('Tab',page.locator('#draft-fixture'));await key('Tab',offering);
 await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('keyboard-discard');await key('Tab',audience);await key('Tab',confirm);await page.keyboard.press('Enter');await confirmed();
 await key('Tab',offering);await key('Tab',audience);await key('Tab',confirm);await key('Tab',save);await key('Tab',cancel);await page.keyboard.press('Space');
 await page.getByText('已取消並捨棄未保存修改；既有模擬紀錄保留。',{exact:true}).waitFor();await key('Tab',reopen);await page.keyboard.press('Enter');assert.equal(await offering.evaluate(el=>el===document.activeElement),true);assert.equal(await offering.inputValue(),'合成零件');assert.equal(await save.isDisabled(),true);
 await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('keyboard-saved');await key('Tab',audience);await key('Tab',confirm);await page.keyboard.press('Space');await confirmed();
 await key('Tab',offering);await key('Tab',audience);await key('Tab',confirm);await key('Tab',save);await page.keyboard.press('Enter');
 await page.getByText('已追加並讀回本頁模擬版本；下一項需重新確認。',{exact:true}).waitFor();assert.equal(await page.locator('#draft-history article').count(),2);assert.equal(await save.isDisabled(),true);
 await key('Tab',audience);await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('keyboard-discard-audience');await key('Tab',confirm);await page.keyboard.press('Enter');await confirmed();
 await key('Tab',audience);await key('Tab',confirm);await key('Tab',save);await key('Tab',cancel);await page.keyboard.press('Enter');await page.getByText('已取消並捨棄未保存修改；既有模擬紀錄保留。',{exact:true}).waitFor();
 assert.equal(await page.locator('#draft-history article').count(),2);await key('Tab',reopen);await page.keyboard.press('Space');assert.equal(await audience.inputValue(),'海外採購人員');assert.equal(await audience.evaluate(el=>el===document.activeElement),true);assert.equal(await save.isDisabled(),true);
 await key('Tab',confirm);await page.keyboard.press('Enter');await confirmed();await key('Tab',audience);await key('Tab',confirm);await key('Tab',save);await page.keyboard.press('Space');
 await page.getByText('兩項已模擬保存 · 資料仍未收集完整',{exact:true}).waitFor();assert.equal(await page.locator('#draft-history article').count(),3);assert.match(await page.locator('#draft-history').innerText(),/keyboard-saved/);assert.doesNotMatch(await page.locator('#draft-history').innerText(),/keyboard-discard/);
 assert.equal(await feedback.evaluate(el=>el===document.activeElement),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
}
async function deniedContextAcceptance(browser,width,origin){
 // Injection exists ONLY in this localhost harness's served module. No product flag,
 // global hook, fixture role selector, Auth or remote transport is introduced.
 const source=await readFile(resolve(files,'offline-draft-session.mjs'),'utf8');
 const declaration='export function createOfflineDraftSession(';assert.equal(source.split(declaration).length,2);
 for(const mode of ['viewer','editor','cross-goal','goal-drift','role-drift','version-drift']){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage(),remote=[],errors=[];
  const injection=source.replace(declaration,'function testedOfflineDraftSession(')+`
export function createOfflineDraftSession(fixtureId){
 const base=createMemoryDraftStore(fixtureId);let reads=0;globalThis.__testAppends=0;
 return testedOfflineDraftSession(fixtureId,{store:{read(){
  reads++;if(${JSON.stringify(mode)}==='version-drift'&&reads===2){const prior=base.read();base.append({goalId:prior.goalId,expectedVersion:1,questionKey:'offering',answer:'外部合成版本'});}
  const value=base.read();
  if(['viewer','editor'].includes(${JSON.stringify(mode)}))value.role=${JSON.stringify(mode)};
  if(${JSON.stringify(mode)}==='role-drift'&&reads>1)value.role='viewer';
  if(${JSON.stringify(mode)}==='cross-goal'||(${JSON.stringify(mode)}==='goal-drift'&&reads>1)){value.goalId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';value.turns.forEach(t=>t.goal_id=value.goalId);}
  return value;
 },append(intent){globalThis.__testAppends++;return base.append(intent);}}});
}`;
  try{
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){remote.push(url.href);return route.abort();}if(url.pathname==='/offline-draft-session.mjs')return route.fulfill({status:200,contentType:'text/javascript',body:injection});return route.continue();});
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.goto(origin+'/offline-draft-review.html');await page.getByText('先檢查來源與提議；確認不代表保存或發布。',{exact:true}).waitFor();
   const confirm=page.getByRole('button',{name:'確認目前草稿',exact:true}),save=page.getByRole('button',{name:'模擬保存下一項',exact:true});
   if(['viewer','editor','cross-goal'].includes(mode)){
    assert.equal(await confirm.isDisabled(),true);assert.equal(await save.isDisabled(),true);for(const field of await page.locator('textarea').all())assert.equal(await field.isDisabled(),true);
    assert.match(await page.locator('#draft-review').innerText(),mode==='cross-goal'?/模擬目標或工作區不一致/:/目前模擬角色僅可檢視/);
   }else{
    await confirm.click();await page.getByText('本次草稿已確認；尚未模擬保存。',{exact:true}).waitFor();await save.click();
    await page.locator('#draft-feedback.error').waitFor();assert.match(await page.locator('#draft-feedback').innerText(),mode==='version-drift'?/模擬來源版本已變動/:mode==='goal-drift'?/模擬目標或工作區不一致/:/目前模擬角色僅可檢視/);
    assert.equal(await save.isDisabled(),true);assert.equal(await confirm.isDisabled(),mode!=='version-drift');
    assert.equal(await page.locator('#draft-history article').count(),mode==='version-drift'?2:1);
    if(mode==='version-drift')assert.match(await page.locator('#draft-history').innerText(),/外部合成版本/);
    assert.doesNotMatch(await page.locator('#draft-confirmed-state').innerText(),/確認綁定/);
   }
   assert.equal(await page.evaluate(()=>globalThis.__testAppends),0);assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   console.log(`PASS ${width}px harness ${mode}: UI denies operation/save, readable error, no application append or remote request/storage/errors`);
  }finally{await context.close();}
 }
}
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
  await page.getByRole('button',{name:'重新查看草稿',exact:true}).click();assert.equal(await save.isDisabled(),true);assert.equal(await page.getByLabel('推廣內容',{exact:true}).inputValue(),'合成零件');
  assert.equal(await page.getByLabel('推廣內容',{exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.getByLabel('推廣內容',{exact:true}).fill('合成修訂零件 <img src="https://invalid.example/leak">');
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
  await page.getByLabel('推廣內容',{exact:true}).fill('切換時捨棄');await confirm.click();await page.getByText('本次草稿已確認；尚未模擬保存。',{exact:true}).waitFor();
  await page.getByLabel('合成案例',{exact:true}).selectOption('parts');assert.equal(await page.getByLabel('推廣內容',{exact:true}).inputValue(),'合成零件');assert.equal(await save.isDisabled(),true);
  await page.reload();await page.getByText('先檢查來源與提議；確認不代表保存或發布。',{exact:true}).waitFor();assert.equal(await page.locator('#draft-history article').count(),1);
  await keyboardAcceptance(page);
  assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
  assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}px offline draft: sources, edit invalidation, cancel/reopen, reconfirm, ordered memory saves/readback, missing data, immutable history, text-only rendering, refresh reset, no remote requests, no storage, no overflow/errors; actual Tab/Shift+Tab/Enter/Space keyboard flow`);
  await deniedContextAcceptance(browser,width,origin);
 }
}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
