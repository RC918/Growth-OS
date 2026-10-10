import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/apps/web/first-result.css"><main><h1>隔離工作區 fixture</h1><button id="login">模擬登入</button><button id="logout">模擬登出</button><section id="panel"></section></main><script type="module">
import {createWorkspaceApi} from '/apps/web/workspace-api.mjs';
import {createIntroSavePanel} from '/apps/web/intro-save-panel.mjs';
import {fixture} from '/prototype/intro-trial/r7-save-fixture.mjs';
const f=fixture();let api,panel;window.f=f;
function login(){api=createWorkspaceApi({origin:'https://wqepyttadrcnphtyjpjy.supabase.co',key:'sb_publishable_fixture',redirectOrigin:location.origin,introSaveEnabled:true,fetchImpl:f.fetchImpl});return api.completeMagicLink('#access_token=a&token_type=bearer&expires_in=3600').then(()=>{document.querySelector('#panel').replaceChildren();panel=createIntroSavePanel({root:document.querySelector('#panel'),api:api.intro,loadFrame:()=>fetch('/apps/web/intro-r7.json').then(r=>r.json())});});}
document.querySelector('#login').onclick=login;document.querySelector('#logout').onclick=()=>{api.signOut();panel.close();};await login();window.ready=true;
</script>`;
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}const p=new URL(req.url,'http://localhost').pathname;if(!/^\/(apps\/web\/|prototype\/intro-trial\/r7-save-fixture.mjs)/.test(p)||p.includes('..')){res.writeHead(404).end();return;}res.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.css')?'text/css':'application/json');res.end(await readFile('.'+p));}catch{res.writeHead(404).end();}});
let browser;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),requests=[],errors=[];
 await context.route('**/*',r=>{requests.push(r.request());return new URL(r.request().url()).origin===origin?r.continue():r.abort();});page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>window.ready);
 const read=()=>page.getByRole('button',{name:'讀取候選與已保存版本'}).click();const status=page.locator('#intro-save-status');
 await read();await page.waitForFunction(()=>document.querySelector('#intro-save-status').textContent.includes('尚未保存'));
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'保存此候選',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#intro-save-status').textContent.includes('已保存並讀回'));
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'確認已保存版本',exact:true}).click();await page.getByRole('button',{name:'已確認此保存版本',exact:true}).waitFor();assert.match(await status.innerText(),/已確認並讀回第 1 版/);
 await page.locator('#logout').click();assert.equal(await page.getByRole('button',{name:'讀取候選與已保存版本'}).isDisabled(),true);
 await page.locator('#login').click();await read();await page.getByRole('button',{name:'已確認此保存版本',exact:true}).waitFor();assert.match(await status.innerText(),/已確認並讀回第 1 版/);
 assert.equal(await page.evaluate(()=>window.f.audit.length),2);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.ok(requests.every(r=>r.method()==='GET'&&new URL(r.url()).origin===origin));assert.deepEqual(errors,[]);
 await page.screenshot({path:'/tmp/r7-save-'+width+'.png',fullPage:true});console.log(JSON.stringify({viewport:width,result:'PASS',backend:'in-memory simulator',login_readback:'independent client',real_remote_calls:0}));await context.close();
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
