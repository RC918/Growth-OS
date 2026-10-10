import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

// Exercise the shipped route/module graph and real DOM event. Every network
// request is intercepted; OTP responses are mocks, never hosted Auth calls.
export async function verifyLoginRoute(){
 const manifest=JSON.parse(await readFile('delivery/w1-private/SHA256.json','utf8'));
 const origin='https://w1.example.invalid',api='https://wqepyttadrcnphtyjpjy.supabase.co';
 const config={origin:api,key:'sb_publishable_isolated',redirectOrigin:origin,productId:'00000000-0000-0000-0000-000000000001',accessEnabled:true,writerEnabled:true};
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try{for(const width of [1280,390])for(const response of [200,429,'network-error','blocked-script','missing-module','init-failure','js-disabled']){
  const unavailable=['blocked-script','missing-module','init-failure','js-disabled'].includes(response);
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',javaScriptEnabled:response!=='js-disabled'});
  let otp=0,releaseOtp;const otpBarrier=new Promise(resolve=>{releaseOtp=resolve;}),errors=[],unexpected=[],modules=new Set();
  if(response==='init-failure')await context.addInitScript(()=>{history.replaceState=()=>{throw Error('isolated initialization failure');};});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin===origin){
    const file=u.pathname==='/w1-workspace'?'index.html':u.pathname.startsWith('/w1-assets/')?u.pathname.slice('/w1-assets/'.length):null;
    if(!file||!Object.hasOwn(manifest,file)){unexpected.push(u.pathname);return route.abort();}
    if(response==='blocked-script'&&file==='w1-workspace-entry.js')return route.abort('blockedbyclient');
    if(response==='missing-module'&&file==='intro-candidate.mjs')return route.fulfill({status:404,contentType:'text/plain',body:'missing dependency'});
    if(file.endsWith('.mjs'))modules.add(file);
    const body=file==='w1-workspace-config.mjs'?'export default '+JSON.stringify(config):await readFile('delivery/w1-private/dist/'+file);
    return route.fulfill({status:200,contentType:(/\.m?js$/).test(file)?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body});
   }
   if(u.origin===api&&u.pathname==='/auth/v1/otp'&&req.method()==='POST'){
    otp++;assert.equal(u.searchParams.get('redirect_to'),origin+'/w1-workspace');
    assert.deepEqual(req.postDataJSON(),{email:'owner@example.invalid',create_user:false});
    await otpBarrier;
    if(response==='network-error')return route.abort('failed');
    return route.fulfill({status:response,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:'{}'});
   }
   unexpected.push(req.method()+' '+u.pathname);return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/w1-workspace');
  const layout=await page.evaluate(()=>{const input=document.getElementById('email').getBoundingClientRect(),button=document.getElementById('send-link').getBoundingClientRect();return {gap:button.top-input.bottom,height:button.height};});
  assert.equal(layout.gap,16);assert.ok(layout.height>=44);
  if(unavailable){
   assert.equal(await page.locator('#send-link').isDisabled(),true);
   const hint=response==='missing-module'?'登入元件載入失敗':response==='init-failure'?'登入介面初始化失敗':'登入介面初始化中';
   await page.locator('#auth-status').filter({hasText:hint}).waitFor();
   if(response==='js-disabled')assert.equal(await page.locator('noscript').isVisible(),true);
   await page.locator('#email').fill('owner@example.invalid');await page.locator('#email').press('Enter',{noWaitAfter:true});
   assert.equal(await page.locator('#send-link').isDisabled(),true);assert.equal(otp,0);
   assert.deepEqual(unexpected,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(response==='missing-module')await page.screenshot({path:`/tmp/w1-login-failsafe-${width}.png`,fullPage:true});
   await context.close();console.log(`PASS W1 login route ${width}: ${response}, visible not-ready message, disabled submit, zero OTP`);continue;
  }
  await page.locator('#auth-status').filter({hasText:'登入介面已就緒'}).waitFor();await page.locator('#email').fill('owner@example.invalid');
  await page.locator('#send-link').click();
  assert.equal(await page.locator('#send-link').getAttribute('aria-busy'),'true');
  assert.equal(await page.locator('#send-link').textContent(),'正在寄送…');
  if(response===200)await page.screenshot({path:`/tmp/w1-login-loading-${width}.png`,fullPage:true});
  releaseOtp();
  const expected=response===200?'若此信箱已有工作區資格':'寄送未完成或結果待核對';
  await page.locator('#auth-status').filter({hasText:expected}).waitFor();
  assert.equal(await page.locator('#send-link').isDisabled(),true);assert.equal(otp,1);
  assert.equal(await page.locator('#send-link').getAttribute('aria-busy'),'false');
  await page.locator('#email-form').evaluate(el=>el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(otp,1,'Repeated submit must never send another OTP');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  assert.deepEqual([...modules].sort(),Object.keys(manifest).filter(f=>f.endsWith('.mjs')).sort());
  assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.deepEqual(await context.cookies(),[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await context.close();console.log(`PASS W1 login route ${width}: mock ${response}, visible result, single POST, complete /w1-assets module graph`);
 }}finally{await browser.close();}
}
if(process.argv[1]?.endsWith('/login-route.test.mjs'))await verifyLoginRoute();
