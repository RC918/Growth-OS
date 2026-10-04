// One unattended entry: independent fail-closed tests → unchanged native PG17 suite → real UI/API + disposable SQL.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {fixtures,ids} from '../../supabase/drafts/first_result_save/fixtures.mjs';
import {createSessionRig,createAuthTransport,validateOptions,backend,redact} from './auth-session-fixture.mjs';
const args=process.argv.slice(2),options={mode:args[args.indexOf('--mode')+1],target:args[args.indexOf('--target')+1]};
validateOptions(options); // Before subprocess, server, DB, browser or network. NODE_ENV is irrelevant.
const origin=options.target;
const run=path=>execFileSync(process.execPath,path,{stdio:'inherit'});
let browser;
try{
 run(['--test','prototype/owner-workspace/auth-session-fixture.test.mjs']);
 run(['supabase/drafts/url_result/native.mjs']); // Same existing assertions, no image pull or new framework.
 const payload=(await fixtures())[0];
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 for(const width of [1280,390]){
  const rig=await createSessionRig(options),transport=createAuthTransport({...options,isolation:rig.isolation});let context,page,token=null,previousToken=null,blockedTargets=0,lateRelease=null,lateStarted=null,holdDetail=false;
  const contexts=[],errors=[];const before=await rig.snapshot();
  try{
   async function fresh(role){
    if(context){const old=page;await context.close();assert.equal(old.isClosed(),true);rig.retire(token);previousToken=token;}
    context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});contexts.push(context);page=await context.newPage();page.on('pageerror',e=>errors.push(redact(e)));
    await context.route('**/*',async route=>{
     const req=route.request(),u=new URL(req.url());
     try{
      if(u.origin===origin){
       if(u.pathname==='/url-result-config.mjs')return route.fulfill({contentType:'text/javascript',body:'export const urlSaveEnabled=true;export const urlResultSchemaEnabled=true;export const urlSaveTrial=null;'});
       return route.fulfill(await rig.asset(u.pathname));
      }
      if(u.origin!==backend){blockedTargets++;return route.abort();}
      const response=await transport({url:req.url(),method:req.method(),headers:req.headers(),body:req.method()==='POST'?req.postDataJSON():undefined});
      if(holdDetail&&u.pathname==='/rest/v1/content_versions'&&u.searchParams.get('select')?.includes('first_result_payload')){lateStarted?.();await new Promise(resolve=>lateRelease=resolve);}
      return route.fulfill({status:response.status,contentType:'application/json',body:JSON.stringify(response.data)});
     }catch(error){errors.push(redact(error));return route.abort();}
    });
    await page.goto(origin+'/workspace.html');assert.equal(await page.locator('#workspace').isVisible(),false);
    assert.equal(await page.locator('.resume-editor textarea').count(),0);assert.equal(await page.locator('.typed-draft').count(),0);assert.deepEqual(await context.cookies(),[]);
    assert.deepEqual(await page.evaluate(()=>({session:Object.keys(sessionStorage),local:Object.keys(localStorage)})),{session:[],local:[]});
    token=rig.issue(role);assert.ok(token!==previousToken,'fresh context receives a newly issued per-run token');
    await page.goto('about:blank'); // A callback is a new document navigation, not an in-page hash edit.
    await page.goto(origin+'/workspace.html#access_token='+token+'&token_type=bearer&expires_in=60');await page.locator('#workspace').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>location.hash),'');
   }
   async function open(id){const view=page.locator(`.typed-version[data-version-id="${id}"]`);await view.locator('.typed-loader > summary').click();await view.locator('.typed-draft').waitFor();return view;}
   const readPayload=async view=>JSON.parse(await view.locator('.typed-draft > details').last().locator('pre').textContent()).payload;
   const request=async(path,{method='GET',body}={})=>page.evaluate(async({url,method,body,token})=>{const r=await fetch(url,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};},{url:backend+path,method,body,token});
   await fresh('owner');
   await page.getByLabel('匯入成果與來源 JSON').setInputFiles({name:'synthetic-result.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});await page.locator('#url-save-preview .typed-draft').waitFor();await page.locator('#save-url-result').click();await page.locator('#url-save-feedback').filter({hasText:'已保存第 1 版'}).waitFor();
   const saved=rig.stats().lastSave;assert.ok(saved?.id);assert.deepEqual(saved.request.p_payload,payload);assert.equal(saved.request.p_organization_id,ids.org);assert.equal(rig.stats().mutations,1);
   let view=await open(saved.id);assert.deepEqual(await readPayload(view),payload);await view.locator('.resume-review').click();await view.locator('textarea').first().fill('UNSAVED DOM MUST NOT SURVIVE');
   await page.evaluate(()=>{sessionStorage.setItem('old-context-sentinel','old');localStorage.setItem('old-context-sentinel','old');});await context.addCookies([{name:'old_context',value:'old',url:origin}]);
   await page.locator('#sign-out').click();assert.equal(await page.locator('#workspace').isVisible(),false);assert.equal(await page.locator('.resume-editor textarea').count(),0);
   // Product signOut clears page memory only. Do not misreport it as server revocation.
   assert.equal((await transport({url:backend+'/auth/v1/user',headers:{authorization:'Bearer '+token}})).status,200);
   await fresh('owner');view=await open(saved.id);assert.deepEqual(await readPayload(view),payload);assert.equal(await view.locator('.resume-editor textarea').count(),0);assert.ok(!(await page.locator('body').textContent()).includes('UNSAVED DOM MUST NOT SURVIVE'));
   const afterSave=await rig.snapshot();assert.equal(afterSave.content_versions.length,before.content_versions.length+1);assert.equal(afterSave.audit_events.length,before.audit_events.length+1);assert.equal(afterSave.growth_opportunities.length,before.growth_opportunities.length+1);
   assert.equal(afterSave.content_versions.find(v=>v.id===saved.id).created_by,ids.owner);
   console.log(`PASS synthetic session ${width}px: Owner Save → Logout → fresh context/new token/empty storage/empty editor → exact version/payload readback; no OTP`);
   // A delayed authenticated detail response cannot populate the ended page session.
   await view.locator('.typed-loader > summary').click();await view.locator('.typed-draft').waitFor({state:'detached'});holdDetail=true;const started=new Promise(r=>lateStarted=r);await view.locator('.typed-loader > summary').click();await started;await page.locator('#sign-out').click();holdDetail=false;lateRelease();await page.waitForTimeout(60);assert.equal(await page.locator('.typed-draft').count(),0);
   for(const role of ['viewer','foreign']){
    await fresh(role);if(role==='viewer'){view=await open(saved.id);assert.deepEqual(await readPayload(view),payload);assert.equal(await page.locator('.resume-review').count(),0);}else assert.equal(await page.locator(`.typed-version[data-version-id="${saved.id}"]`).count(),0);
    await page.getByLabel('匯入成果與來源 JSON').setInputFiles({name:'synthetic-result.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});await page.locator('#url-save-preview .typed-draft').waitFor();
    // Foreign Owner may write their own org; this denial is explicitly scoped to OrgA.
    if(role==='viewer')assert.equal(await page.locator('#save-url-result').isDisabled(),true);
    const snapshot=await rig.snapshot();const read=await request('/rest/v1/content_versions?'+new URLSearchParams({select:'id,first_result_payload',organization_id:'eq.'+ids.org,id:'eq.'+saved.id}));assert.equal(read.status,200);assert.equal(read.data.length,role==='viewer'?1:0);if(role==='viewer')assert.deepEqual(read.data[0].first_result_payload,payload);
    const deny=await request('/rest/v1/rpc/save_url_result_draft',{method:'POST',body:{...saved.request,p_request_id:randomUUID(),p_expected_version:1}});assert.equal(deny.status,403);assert.deepEqual(await rig.snapshot(),snapshot);
   }
   assert.equal(rig.stats().denied,2);assert.equal(rig.stats().mutations,1);assert.deepEqual(await rig.snapshot(),afterSave);
   assert.equal(blockedTargets,0);assert.equal(await page.evaluate(async()=>{try{await fetch('https://unapproved.invalid/auth/v1/otp',{method:'POST'});return false;}catch{return true;}}),true);assert.equal(blockedTargets,0,'product CSP rejects the probe before transport');const probe=await context.newPage();try{await assert.rejects(probe.goto('https://unapproved.invalid/auth/v1/otp'));}finally{await probe.close();}assert.equal(blockedTargets,1,'runner aborts an unknown destination independently of product CSP');assert.deepEqual(await rig.snapshot(),afterSave);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
   console.log(`PASS SQL RLS/permission ${width}px: authenticated fixed actor, viewer read/no write, foreign OrgA read/write denied, zero rejected-case data/audit delta; unknown destination aborted`);
  }finally{lateRelease?.();for(const c of contexts)await c.close();await rig.close();}
 }
 console.log('PASS unattended regression entry. Real Auth engine issuance/JWT verification/OTP/2FA NOT TESTED. Product signOut is page-memory clearing only.');
}catch(error){throw Error(redact(error.stack??error));}finally{if(browser)await browser.close();}
