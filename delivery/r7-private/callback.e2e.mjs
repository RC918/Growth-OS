// Non-secret synthetic fragments only. Does not reproduce or bypass hosted Sites Auth.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {fixture} from '../../prototype/intro-trial/r7-save-fixture.mjs';
const root='delivery/r7-private/dist/',pilot='https://wqepyttadrcnphtyjpjy.supabase.co',fragment='#access_token=a&token_type=bearer&expires_in=3600';
const manifest=JSON.parse(await readFile('delivery/r7-private/SHA256.json','utf8')),files={};for(const name of Object.keys(manifest.files))files[name.slice(5)]=await readFile('delivery/r7-private/'+name,'utf8');
let browser,site;
const server=createServer((req,res)=>{const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/r7-workspace.html'){res.writeHead(307,{location:'/r7-workspace'}).end();return;}
 const name=['/r7-workspace','/wrong'].includes(u.pathname)?'r7-workspace.html':u.pathname.slice(1);let body=files[name];if(body===undefined){res.writeHead(404).end();return;}
 if(name==='r7-workspace-runtime.mjs')body=`export const r7Runtime={origin:'${pilot}',key:'sb_publishable_fixture',accessEnabled:true};`;
 res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'text/html');res.end(body);
});
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));site='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 for(const width of [1280,390]){
 async function open(path='/r7-workspace',holdPath=null){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage(),calls=[],errors=[],f=fixture();let release;const held=new Promise(r=>release=r);
  await page.clock.install();page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());
   if(u.origin===site)return route.continue();
   assert.equal(u.origin,pilot);assert.equal(req.method(),'GET');assert.ok(['/auth/v1/user','/rest/v1/r7_members'].includes(u.pathname));calls.push(u.pathname);
   const result=await f.fetchImpl(req.url(),{method:'GET',headers:{Authorization:req.headers().authorization}});if(u.pathname===holdPath)await held;
   await route.fulfill({contentType:'application/json',body:JSON.stringify(await result.json())}).catch(()=>{});
  });
  await page.goto(site+path);return {context,page,calls,errors,release,state:s=>page.locator('#auth-status[data-state="'+s+'"]')};
 }
 // Standard clean URL redirect preserves synthetic fragment; exact target is canonical.
 let x=await open('/r7-workspace.html'+fragment);await x.state('authenticated').waitFor();assert.equal(new URL(x.page.url()).pathname,'/r7-workspace');assert.equal(new URL(x.page.url()).hash,'');assert.deepEqual(x.calls,['/auth/v1/user','/rest/v1/r7_members']);await x.context.close();
 // Missing/removed fragment never triggers Auth, OTP or a fake restored session.
 x=await open();await x.state('missing-callback').waitFor();assert.equal(x.calls.length,0);await x.page.reload();await x.state('missing-callback').waitFor();assert.equal(x.calls.length,0);await x.context.close();
 // Late arrival and duplicate events: only one verification, canceled intent cannot resurrect.
 x=await open('/r7-workspace','/auth/v1/user');await x.state('missing-callback').waitFor();await x.page.evaluate(f=>location.hash=f,fragment);await x.state('verifying').waitFor();await x.page.waitForFunction(()=>location.hash==='');
 await x.page.evaluate(f=>{location.hash=f;window.dispatchEvent(new HashChangeEvent('hashchange'));},fragment);assert.equal(x.calls.length,1);await x.page.locator('#r7-signout').click();await x.state('signed-out').waitFor();x.release();await x.page.clock.runFor(100);assert.equal(await x.page.locator('#intro-save-panel').isVisible(),false);assert.equal(x.calls.length,1);await x.context.close();
 // A delayed valid callback completes once, and refresh has no persisted token.
 x=await open('/r7-workspace','/auth/v1/user');await x.page.evaluate(f=>location.hash=f,fragment);await x.state('verifying').waitFor();x.release();await x.state('authenticated').waitFor();await x.page.evaluate(f=>{location.hash=f;window.dispatchEvent(new HashChangeEvent('hashchange'));},fragment);await x.page.waitForFunction(()=>location.hash==='');assert.equal(x.calls.length,2);await x.page.reload();await x.state('missing-callback').waitFor();assert.equal(x.calls.length,2);await x.context.close();
 for(const path of ['/auth/v1/user','/rest/v1/r7_members']){
  x=await open('/r7-workspace'+fragment,path);await x.state('verifying').waitFor();await x.page.waitForFunction(()=>location.hash==='');
  // Wait until the target GET has actually started before advancing the browser clock.
  await assertEventually(()=>x.calls.includes(path));await x.page.clock.runFor(10001);await x.state('timeout').waitFor();x.release();await x.page.clock.runFor(100);assert.equal(await x.page.locator('#intro-save-panel').isVisible(),false);assert.equal(await x.page.locator('#r7-login button').isDisabled(),true);assert.deepEqual(x.errors,[]);await x.context.close();
 }
 for(const path of ['/wrong'+fragment,'/r7-workspace?wrong=1'+fragment,'/r7-workspace#access_token=a&token_type=bearer&expires_in=0']){
  x=await open(path);await x.page.locator('#auth-status[data-state="invalid-callback"],#auth-status[data-state="verification-failed"]').waitFor();assert.equal(x.calls.length,0);assert.equal(new URL(x.page.url()).hash,'');assert.equal(await x.page.locator('#intro-save-panel').isVisible(),false);assert.deepEqual(await x.page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(x.errors,[]);await x.page.screenshot({path:'/tmp/r7-callback-'+width+'.png',fullPage:true});await x.context.close();
 }
 console.log(JSON.stringify({viewport:width,result:'PASS',clean_redirect:true,late_hash_once:true,stale_cancelled:true,auth_and_membership_timeout:true,wrong_callback_denied:true,refresh_not_authenticated:true,remote_calls:0,otp_posts:0}));
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
async function assertEventually(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.ok(check());}
