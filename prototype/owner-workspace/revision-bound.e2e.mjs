// Actual bounded editor/API/config → synthetic HTTP + isolated SQL. No real auth/network.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {PGlite} from '@electric-sql/pglite';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {revisionBaseline} from '../../supabase/drafts/url_result/revision-bound/fixture.mjs';
import {render,root,source} from '../../supabase/drafts/url_result/revision-bound/candidate.mjs';
const local='http://127.0.0.1:8782',origin='https://revision.invalid',m=JSON.parse(await readFile(new URL('manifest.json',root),'utf8')),s=await source();
const server=spawn('python3',['-m','http.server','8782','--bind','127.0.0.1','--directory','apps/web'],{stdio:'ignore'});
const wait=async f=>{for(let i=0;i<700;i++){if(await f())return;await new Promise(r=>setTimeout(r,10));}throw Error('barrier timeout');};
let browser;
try{
 await wait(async()=>{try{return(await fetch(local+'/workspace.html')).ok;}catch{return false;}});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 const baseline=await revisionBaseline({pglite:true});
 for(const width of [1280,390])for(const scenario of ['success','unknown','empty','wrong_payload','expiry','storage','wrong_request','unbound']){
  const db=await PGlite.create();await db.exec(baseline);const pack=await render({...m,workspace_url:origin+'/workspace.html'},{cutoff:scenario==='unbound'?undefined:'2099-01-01T00:00:00.000Z'});
  if(scenario!=='unbound')await db.exec(pack.opening);
  const old=(await db.query('select * from public.content_versions where id=$1',[m.base_version_id])).rows[0],parent=(await db.query('select * from public.growth_opportunities where id=$1',[m.opportunity_id])).rows[0];
  let enabled=true,chain=Promise.resolve(),token=null,loginRequests=0,savePosts=0,saved=null,gets=0;
  const errors=[],unexpected=[],context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url()),respond=(x,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(x)});
   if(u.origin===origin){if(u.pathname==='/url-result-config.mjs')return route.fulfill({contentType:'text/javascript',body:(enabled?pack.openConfig:pack.closedConfig).replace(scenario==='wrong_request'?m.request_id:'__unused__',scenario==='wrong_request'?'00000000-0000-4000-8000-000000000099':'__unused__')});const asset=await fetch(local+u.pathname);return route.fulfill({status:asset.status,contentType:asset.headers.get('content-type'),body:Buffer.from(await asset.arrayBuffer())});}
   if(u.origin!=='https://vhzryhibmpvglzcmfnaa.supabase.co'){unexpected.push(req.url());return route.abort();}
   if(u.pathname==='/auth/v1/otp'){assert.equal(req.method(),'POST');assert.equal(req.postDataJSON().create_user,false);loginRequests++;return respond({});}
   assert.equal(req.headers().authorization,'Bearer '+token);
   if(u.pathname==='/auth/v1/user')return respond({id:m.actor_id});
   const task=chain.then(async()=>{
    await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[m.actor_id]);await db.exec('set role authenticated');
    if(req.method()==='POST'){
     assert.equal(u.pathname,'/rest/v1/rpc/save_url_result_draft');savePosts++;const p=req.postDataJSON();assert.equal(p.p_request_id,m.request_id);assert.equal(p.p_expected_version,1);assert.deepEqual(p.p_payload,s.payload);
     const marker=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('growth-os:url-revision-attempt:v1')).operation);assert.equal(marker.request_id,m.request_id);assert.equal(marker.resolved,false);assert.equal(marker.intent_digest,m.intent_digest);assert.ok(Object.values(marker).every(x=>x===null||typeof x!=='object'));
     if(scenario==='empty')return null;
     saved=Object.values((await db.query('select public.save_url_result_draft($1,$2,$3,$4,$5)',[p.p_organization_id,p.p_opportunity_id,p.p_request_id,p.p_expected_version,JSON.stringify(p.p_payload)])).rows[0])[0];return saved;
    }
    assert.equal(req.method(),'GET');const table=u.pathname.split('/').at(-1),cols=u.searchParams.get('select');assert.match(table,/^[a-z_]+$/);assert.match(cols,/^[a-z_,]+$/);const params=[],where=[];
    for(const [key,val]of u.searchParams)if(!['select','order','limit'].includes(key)){assert.match(key,/^[a-z_]+$/);assert.ok(val.startsWith('eq.'));params.push(val.slice(3));where.push(`${key}=$${params.length}`);}
    let sql=`select ${cols} from public.${table}`+(where.length?' where '+where.join(' and '):'');
    if(u.searchParams.has('order')){const parts=u.searchParams.get('order').split(',');parts.forEach(x=>assert.match(x,/^[a-z_]+\.(asc|desc)$/));sql+=' order by '+parts.map(x=>x.replace('.',' ')).join(',');}
    if(u.searchParams.has('limit')){const n=Number(u.searchParams.get('limit'));assert.ok(Number.isSafeInteger(n)&&n>0&&n<=501);sql+=' limit '+n;}
    const rows=(await db.query(sql,params)).rows;if(u.searchParams.has('first_result_request_id')){assert.equal(u.searchParams.get('first_result_request_id'),'eq.'+m.request_id);gets++;if(scenario==='unknown'&&gets===1)return [];}return rows;
   });chain=task.catch(()=>{});
   try{const value=await task;if(req.method()==='POST'&&['unknown','empty'].includes(scenario))return route.abort();return respond(value);}catch(e){unexpected.push(e.stack);return route.abort();}
  });
  // Open deployment loads before login1. A reload has no page-memory session.
  await page.goto(origin+'/workspace.html');await page.reload();assert.equal(await page.locator('#workspace').isVisible(),false);
  const login=async()=>{await page.locator('#login-form input[name=email]').fill('synthetic@example.invalid');await page.locator('#login-form button[type=submit]').click();await wait(()=>loginRequests>=(token?2:1));token='synthetic-bound-'+loginRequests;await page.goto('about:blank');await page.goto(origin+'/workspace.html#access_token='+token+'&token_type=bearer&expires_in=3600');await page.locator('#workspace').waitFor({state:'visible'});};
  await login();assert.equal(loginRequests,1);assert.equal(await page.locator('#save-url-result').count(),0);
  const version=page.locator(`.typed-version[data-version-id="${m.base_version_id}"]`);await version.locator('.typed-loader > summary').click();await version.locator('.typed-draft').waitFor();
  if(scenario==='unbound'){assert.equal(await page.locator('.resume-review').count(),0);assert.equal(savePosts,0);}
  else{
   await version.locator('.resume-review').click();await version.locator('textarea').first().waitFor();await version.locator('textarea[data-field=title]').fill(scenario==='wrong_payload'?'Unapproved title':s.payload.preview.fields.title.suggested);
   for(const field of ['title','meta_description','description'])await version.locator(`[data-check=${field}]`).check();await version.locator('.resume-confirm').click();await version.locator('.resume-status').filter({hasText:'本頁已確認'}).waitFor();await version.locator('.resume-prepare').click();
   if(['wrong_payload','wrong_request'].includes(scenario)){await version.locator('.resume-status').filter({hasText:'保存意圖未建立'}).waitFor();assert.equal(savePosts,0);}
   else{
    await version.locator('.resume-intent').waitFor({state:'visible'});const intent=JSON.parse(await version.locator('.resume-intent-json').textContent());assert.equal(intent.intent_digest,m.intent_digest);assert.equal(intent.request.request_id,m.request_id);assert.deepEqual(intent.request.payload,s.payload);
    if(scenario==='expiry')await page.evaluate(()=>{Date.now=()=>Date.parse('2100-01-01T00:00:00Z');});
    if(scenario==='storage')await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('storage denied');};});
    await version.locator('.resume-save').click();
    if(['expiry','storage'].includes(scenario)){await version.locator('.resume-status').filter({hasText:'未送出'}).waitFor();assert.equal(savePosts,0);}
    else if(scenario==='success')await version.locator('.resume-status').filter({hasText:'已保存第 2 版'}).waitFor();
    else{await version.locator('.resume-status').filter({hasText:'只查詢原 request'}).waitFor();await version.locator('.resume-reconcile').click();await version.locator('.resume-status').filter({hasText:'結果仍未知'}).waitFor();assert.equal(savePosts,1);}
   }
  }
  await chain;await db.exec('reset role');await db.exec(pack.cleanup);enabled=false;
  // SQL cleanup first; closed config deploy next; logout/reload then login2 only.
  await page.locator('#sign-out').click();await page.reload();assert.equal(await page.locator('#workspace').isVisible(),false);await login();assert.equal(loginRequests,2);
  if(['unknown','empty'].includes(scenario)){await page.locator('.revision-recovery-status').filter({hasText:scenario==='empty'?'結果仍未知':'已恢復第 2 版'}).waitFor();if(scenario==='empty'){await page.locator('.revision-recovery-read').click();await page.locator('.revision-recovery-status').filter({hasText:'結果仍未知'}).waitFor();}}
  for(const [id,payload]of [[m.base_version_id,s.old.payload],...(saved?[[saved,s.payload]]:[])]){const row=page.locator(`.typed-version[data-version-id="${id}"]`);await row.locator('.typed-loader > summary').click();await row.locator('.typed-draft').waitFor();assert.deepEqual(JSON.parse(await row.locator('.typed-draft > details').last().locator('pre').textContent()).payload,payload);}
  assert.equal(await page.locator('.resume-review').count(),0);assert.equal(await page.locator('#save-url-result').count(),0);assert.equal(savePosts,['success','unknown','empty'].includes(scenario)?1:0);
  await chain;await db.exec('reset role');assert.deepEqual((await db.query('select * from public.content_versions where id=$1',[m.base_version_id])).rows[0],old);assert.deepEqual((await db.query('select * from public.growth_opportunities where id=$1',[m.opportunity_id])).rows[0],parent);
  assert.equal((await db.query('select count(*)::int n from public.content_versions where opportunity_id=$1',[m.opportunity_id])).rows[0].n,saved?2:1);assert.equal((await db.query("select count(*)::int n from public.audit_events where event_type='url_result_draft_saved' and details->>'opportunity_id'=$1",[m.opportunity_id])).rows[0].n,saved?2:1);
  for(const fn of ['public.save_url_result_draft','private.save_url_result_draft_impl'])assert.equal((await db.query(`select has_function_privilege('authenticated','${fn}(uuid,uuid,uuid,integer,jsonb)','EXECUTE') ok`)).rows[0].ok,false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);console.log(`PASS ${width}px ${scenario}: exact bound, ${savePosts} Save POST / ${loginRequests} OTP requests, cleanup then reload/login2, v1 bytes retained`);await context.close();await db.close();
 }
}finally{if(browser)await browser.close();server.kill();}
