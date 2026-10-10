// Exact packaged static files, HTTPS interception only; no external requests or real Auth.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {fixture} from '../../prototype/intro-trial/r7-save-fixture.mjs';
const root='delivery/r7-private/',site='https://private-fixture.test',pilot='https://wqepyttadrcnphtyjpjy.supabase.co';
const manifest=JSON.parse(await readFile(root+'SHA256.json','utf8')),files={};
assert.deepEqual((await readdir(root+'dist')).sort(),Object.keys(manifest.files).map(n=>n.slice(5)).sort());
for(const [path,hash] of Object.entries(manifest.files)){const body=await readFile(root+path);assert.equal(createHash('sha256').update(body).digest('hex'),hash);files[path.slice(5)]=body.toString();}
for(const n of ['r7-workspace.html','r7-workspace.mjs','r7-workspace-api.mjs','r7-workspace-runtime.mjs','intro-save.mjs','intro-save-panel.mjs','intro-save-config.mjs'])assert.equal(files[n],await readFile('apps/web/'+n,'utf8'));
for(const [name,body] of Object.entries(files))if(name.endsWith('.mjs'))for(const m of body.matchAll(/from ['"]\.\/([^'"]+)['"]/g))assert.ok(files[m[1]],'missing packaged import '+m[1]);
const original=JSON.parse(await readFile('apps/web/intro-r7.json','utf8'));assert.deepEqual(JSON.parse(files['intro-r7.json']),original);
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 for(const width of [1280,390]){
 const backend=fixture(),apiCalls=[],errors=[];
 async function open({configured=false,writer=false,fragment='',membership=true}={}){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin===site){const name=u.pathname.slice(1)||'index.html';let body=files[name];if(body===undefined)return route.fulfill({status:404,body:''});
    if(configured&&name==='r7-workspace-runtime.mjs')body=`export const r7Runtime={origin:'${pilot}',key:'sb_publishable_fixture',accessEnabled:true};`;
    if(writer&&name==='intro-save-config.mjs')body='export const introSaveEnabled=true;';
    return route.fulfill({contentType:name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'text/html',body});
   }
   assert.equal(u.origin,pilot,'unexpected external destination');apiCalls.push({path:u.pathname,method:req.method(),body:req.postData(),url:req.url()});
   assert.ok(['/auth/v1/otp','/auth/v1/user','/rest/v1/r7_members','/rest/v1/intro_versions','/rest/v1/rpc/save_r7_intro','/rest/v1/rpc/confirm_r7_intro'].includes(u.pathname));
   if(u.pathname==='/auth/v1/otp')return route.fulfill({contentType:'application/json',body:'{}'});
   if(!membership&&u.pathname==='/rest/v1/r7_members')return route.fulfill({contentType:'application/json',body:'[]'});
   const result=await backend.fetchImpl(req.url(),{method:req.method(),headers:{Authorization:req.headers().authorization},body:req.postData()});
   return route.fulfill({status:result.ok?200:result.status,contentType:'application/json',body:JSON.stringify(result.ok?await result.json():{})});
  });
  await page.goto(site+'/r7-workspace.html'+fragment);return {context,page};
 }
 const fragment='#access_token=a&token_type=bearer&expires_in=3600';
 let x=await open({fragment});await x.page.waitForFunction(()=>location.hash==='');assert.equal(await x.page.locator('#r7-login').isVisible(),false);assert.equal(apiCalls.length,0);await x.context.close();
 x=await open({configured:true,membership:false,fragment});await x.page.waitForFunction(()=>document.querySelector('#auth-status').textContent.includes('資格'));assert.equal(await x.page.locator('#intro-save-panel').isVisible(),false);assert.equal(backend.audit.length,0);await x.context.close();
 x=await open({configured:true,writer:true});await x.page.locator('#email').fill('fixture@example.test');await x.page.getByRole('button',{name:'取得登入連結'}).click();await x.page.waitForFunction(()=>document.querySelector('#auth-status').textContent.includes('已請求'));
 const otp=apiCalls.find(c=>c.path==='/auth/v1/otp');assert.equal(JSON.parse(otp.body).create_user,false);assert.equal(new URL(otp.url).searchParams.get('redirect_to'),site+'/r7-workspace.html');await x.context.close();
 x=await open({configured:true,writer:true,fragment});const p=x.page;await p.locator('#intro-save-panel:not([hidden])').waitFor();assert.equal(new URL(p.url()).hash,'');
 await p.getByRole('button',{name:'讀取候選與已保存版本'}).click();await p.waitForFunction(()=>document.querySelector('#intro-save-status').textContent.includes('尚未保存'));assert.ok((await p.locator('#intro-save-panel').innerText()).includes(original.payload.candidate.output.candidate));
 await p.getByRole('checkbox').check();await p.getByRole('button',{name:'保存此候選',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#intro-save-status').textContent.includes('已保存並讀回'));await p.getByRole('checkbox').check();await p.getByRole('button',{name:'確認已保存版本',exact:true}).click();await p.getByRole('button',{name:'已確認此保存版本'}).waitFor();assert.equal(backend.audit.length,2);
 await p.locator('#r7-signout').click();assert.equal(await p.locator('#intro-save-panel').isVisible(),false);assert.deepEqual(await p.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);await x.context.close();
 const writes=apiCalls.filter(c=>c.path.includes('/rpc/')).length;
 x=await open({configured:true,writer:false,fragment});await x.page.locator('#intro-save-panel:not([hidden])').waitFor();await x.page.getByRole('button',{name:'讀取候選與已保存版本'}).click();await x.page.waitForFunction(()=>document.querySelector('#intro-save-status').textContent.includes('已確認並讀回第 1 版'));
 assert.equal(await x.page.getByRole('button',{name:'保存此候選',exact:true}).isDisabled(),true);assert.equal(await x.page.getByRole('button',{name:'已確認此保存版本'}).isDisabled(),true);assert.equal(apiCalls.filter(c=>c.path.includes('/rpc/')).length,writes);
 assert.deepEqual(await x.page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await x.page.screenshot({path:'/tmp/r7-package-'+width+'.png',fullPage:true});await x.context.close();
 console.log(JSON.stringify({viewport:width,result:'PASS',artifact:'13 packaged assets',default_closed:true,no_membership_denied:true,exact_callback:true,save_confirm:2,fresh_read_only_context:true,real_remote_calls:0}));
 }
}finally{await browser?.close();}
