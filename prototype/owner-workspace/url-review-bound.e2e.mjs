// Real candidate config/API/UI assembly; only synthetic HTTP/Auth and disposable SQL.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {PGlite} from '@electric-sql/pglite';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {baseline} from '../../supabase/drafts/url_review/bound/fixture.mjs';
import {manifest,render,source,root,checks,entries} from '../../supabase/drafts/url_review/bound/candidate.mjs';
const local='http://127.0.0.1:8784',m=await manifest(),s=await source(),origin=new URL(m.workspace_url).origin,setup=await baseline({pglite:true});
const pack=await render(m,{cutoff:'2099-01-01T00:00:00.000Z'}),unbound=await render(m),preserve=await readFile(new URL('preservation.sql',root),'utf8');
const server=spawn('python3',['-m','http.server','8784','--bind','127.0.0.1','--directory','apps/web'],{stdio:'ignore'});
const wait=async f=>{for(let i=0;i<700;i++){if(await f())return;await new Promise(r=>setTimeout(r,10));}throw Error('barrier timeout');};
const all=['success','unknown','empty','wrong_uuid','closed','unbound','identity','version','digest','request','expiry'];
const scenarios=process.argv.length>2?process.argv.slice(2):all;assert.ok(scenarios.every(x=>all.includes(x)));let browser;
try{
 await wait(async()=>{try{return(await fetch(local+'/workspace.html')).ok;}catch{return false;}});browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 for(const width of [1280,390])for(const scenario of scenarios){
  const db=await PGlite.create();await db.exec(setup);const snapshot=async()=>{await db.exec('reset role');return(await db.exec(preserve)).map(r=>r.rows);},before=await snapshot();await db.exec(pack.preflight);await db.exec(pack.opening);await db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',['synthetic-review-open',m.opening_migration_name,[pack.opening]]);
  let enabled=true,actor=scenario==='identity'?'10000000-0000-4000-8000-000000000004':m.actor_id,chain=Promise.resolve(),token=null,logins=0,posts=0,saved=null,gets=0,wrong=scenario==='wrong_uuid';
  const errors=[],unexpected=[],context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url()),respond=(v,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(v)});
   if(u.origin===origin){
    if(u.pathname==='/url-result-config.mjs'){
     let config=enabled?(scenario==='closed'?pack.closedConfig:scenario==='unbound'?unbound.openConfig:pack.openConfig):pack.closedConfig;
     if(enabled&&scenario==='version')config=config.replace(m.version_id,m.v1_id);
     if(enabled&&scenario==='digest')config=config.replace(m.content_digest,'sha256:'+'f'.repeat(64));
     if(enabled&&scenario==='request')config=config.replace(m.request_id,m.save_request_id);
     return route.fulfill({contentType:'text/javascript',body:config});
    }
    const asset=await fetch(local+u.pathname);return route.fulfill({status:asset.status,contentType:asset.headers.get('content-type'),body:Buffer.from(await asset.arrayBuffer())});
   }
   if(u.origin!=='https://vhzryhibmpvglzcmfnaa.supabase.co'){unexpected.push(req.url());return route.abort();}
   if(u.pathname==='/auth/v1/otp'){assert.equal(req.method(),'POST');assert.equal(req.postDataJSON().create_user,false);assert.equal(new URL(u.searchParams.get('redirect_to')).origin,origin);logins++;return respond({});}
   assert.equal(req.headers().authorization,'Bearer '+token);if(u.pathname==='/auth/v1/user')return respond({id:actor});
   const task=chain.then(async()=>{
    await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role authenticated');
    if(req.method()==='POST'){
     assert.equal(u.pathname,'/rest/v1/rpc/review_url_result');posts++;const p=req.postDataJSON();assert.deepEqual(p,{p_organization_id:m.organization_id,p_version_id:m.version_id,p_request_id:m.request_id,p_source_digest:m.source_digest,p_content_digest:m.content_digest,p_version_digest:m.version_digest,p_checks:checks});
     const marker=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('growth-os:url-review-attempt:v1')).operation);assert.equal(marker.request_id,m.request_id);assert.equal(marker.intent_digest,m.intent_digest);assert.equal(marker.resolved,false);assert.ok(Object.values(marker).every(v=>v===null||typeof v!=='object'));
     if(scenario==='empty')return null;
     saved=Object.values((await db.query('select public.review_url_result($1,$2,$3,$4,$5,$6,$7)',[p.p_organization_id,p.p_version_id,p.p_request_id,p.p_source_digest,p.p_content_digest,p.p_version_digest,JSON.stringify(p.p_checks)])).rows[0])[0];return saved;
    }
    assert.equal(req.method(),'GET');const table=u.pathname.split('/').at(-1),cols=u.searchParams.get('select');assert.match(table,/^[a-z_]+$/);assert.match(cols,/^[a-z_,]+$/);const args=[],where=[];
    for(const [key,val]of u.searchParams)if(!['select','order','limit'].includes(key)){assert.match(key,/^[a-z_]+$/);assert.ok(val.startsWith('eq.'));args.push(val.slice(3));where.push(`${key}=$${args.length}`);}
    let sql=`select ${cols} from public.${table}`+(where.length?' where '+where.join(' and '):'');
    if(u.searchParams.has('order')){const parts=u.searchParams.get('order').split(',');parts.forEach(x=>assert.match(x,/^[a-z_]+\.(asc|desc)$/));sql+=' order by '+parts.map(x=>x.replace('.',' ')).join(',');}
    if(u.searchParams.has('limit')){const n=Number(u.searchParams.get('limit'));assert.ok(Number.isSafeInteger(n)&&n>0&&n<=501);sql+=' limit '+n;}
    const rows=(await db.query(sql,args)).rows;
    if(u.searchParams.has('url_review_request_id')){assert.equal(u.searchParams.get('url_review_request_id'),'eq.'+(enabled&&scenario==='request'?m.save_request_id:m.request_id));if(posts){gets++;if(scenario==='unknown'&&gets===1)return [];if(wrong&&rows.length)rows[0].id=m.v1_id;}}
    return rows;
   });chain=task.catch(()=>{});
   try{const value=await task;if(req.method()==='POST'&&['unknown','empty'].includes(scenario))return route.abort();return respond(value);}catch(e){if(e.code)return respond({},409);unexpected.push(e.stack);return route.abort();}
  });
  // Open deploy → reload → login1. Never assume an earlier in-memory session survives.
  await page.goto(m.workspace_url);await page.reload();assert.equal(await page.locator('#workspace').isVisible(),false);
  const login=async()=>{const expected=logins+1;await page.locator('#login-form input[name=email]').fill('synthetic@example.invalid');await page.locator('#login-form button[type=submit]').click();await wait(()=>logins===expected);token='synthetic-review-bound-'+logins;await page.goto('about:blank');await page.goto(m.workspace_url+'#access_token='+token+'&token_type=bearer&expires_in=3600');await page.locator('#workspace').waitFor({state:'visible'});};
  const open=async id=>{const v=page.locator(`.typed-version[data-version-id="${id}"]`);await v.locator('.typed-loader > summary').click();await v.locator('.typed-draft').waitFor();return v;};
  await login();assert.equal(logins,1);assert.equal(await page.locator('#save-url-result').evaluateAll(nodes=>nodes.every(node=>node.disabled)),true);let view=await open(m.version_id);
  if(['version','unbound'].includes(scenario)){assert.equal(await view.locator('.url-review').count(),0);}
  else if(['identity','digest'].includes(scenario)){await view.locator('.url-review-status').filter({hasText:'不符'}).waitFor();assert.equal(await view.locator('.url-review-confirm').isDisabled(),true);}
  else if(scenario==='closed'){await view.locator('.url-review-status').filter({hasText:'待確認'}).waitFor();assert.equal(await view.locator('.url-review-confirm').isDisabled(),true);}
  else{
   await view.locator('.url-review-status').filter({hasText:'待確認'}).waitFor();for(const key of Object.keys(checks))await view.locator(`[data-review-check="${key}"]`).check();
   if(scenario==='expiry')await page.evaluate(()=>{Date.now=()=>Date.parse('2100-01-01T00:00:00.000Z');});
   await view.locator('.url-review-confirm').click();
   if(['request','expiry'].includes(scenario)){await view.locator('.url-review-status').filter({hasText:'未送出確認'}).waitFor();assert.equal(posts,0);}
   else if(scenario==='success')await view.locator('.url-review-status').filter({hasText:'此已保存版本已確認'}).waitFor();
   else{await view.locator('.url-review-status').filter({hasText:'只查詢原 request'}).waitFor();assert.equal(posts,1);if(scenario!=='wrong_uuid'){await view.locator('.url-review-read').click();await view.locator('.url-review-status').filter({hasText:'結果仍未知'}).waitFor();}assert.equal(await view.locator('.url-review-confirm').isDisabled(),true);}
  }
  // Always cleanup before closed deployment. No retained generic write grant.
  await chain;await db.exec('reset role');await db.exec(pack.cleanup);await db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',['synthetic-review-close',m.cleanup_migration_name,[pack.cleanup]]);enabled=false;
  // logout/reload/login2 creates a fresh API/session, retaining only same-tab pending metadata.
  await page.locator('#sign-out').click();await page.reload();assert.equal(await page.locator('#workspace').isVisible(),false);actor=m.actor_id;await login();assert.equal(logins,2);
  view=await open(m.version_id);
  if(scenario==='wrong_uuid'){await view.locator('.url-review-status').filter({hasText:'不符'}).waitFor();wrong=false;await view.locator('.url-review-read').click();}
  await view.locator('.url-review-status').filter({hasText:saved?'此已保存版本已確認':scenario==='empty'?'結果仍未知':'待確認'}).waitFor();
  if(saved){assert.ok((await view.locator('.url-review-status').innerText()).includes(saved));assert.ok((await view.locator('.url-review-status').innerText()).includes(m.version_id));}
  if(scenario==='empty'){await view.locator('.url-review-read').click();await view.locator('.url-review-status').filter({hasText:'結果仍未知'}).waitFor();assert.equal((await page.evaluate(()=>JSON.parse(sessionStorage.getItem('growth-os:url-review-attempt:v1')).operation)).resolved,false);}
  assert.equal(await view.locator('.url-review-confirm').isDisabled(),true);assert.deepEqual(JSON.parse(await view.locator('.typed-draft > details').last().locator('pre').textContent()).payload,s.payload);
  const v1=await open(m.v1_id);assert.deepEqual(JSON.parse(await v1.locator('.typed-draft > details').last().locator('pre').textContent()).payload,s.v1);assert.equal(await v1.locator('.url-review').count(),0);
  assert.equal(posts,['success','unknown','empty','wrong_uuid'].includes(scenario)?1:0);assert.equal(logins,2);assert.equal(await page.locator('#save-url-result').evaluateAll(nodes=>nodes.every(node=>node.disabled)),true);
  await chain;await db.exec('reset role');assert.deepEqual(await snapshot(),before);if(saved)await db.exec(pack.postflight);
  assert.equal((await db.query('select count(*)::int n from public.content_reviews where url_review_request_id=$1',[m.request_id])).rows[0].n,saved?1:0);assert.equal((await db.query("select count(*)::int n from public.audit_events where details->>'request_id'=$1",[m.request_id])).rows[0].n,saved?1:0);
  for(const f of entries)assert.equal((await db.query(`select has_function_privilege('authenticated','${f}','execute') ok`)).rows[0].ok,false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);console.log(`PASS ${width}px ${scenario}: ${posts} fixed Review POST / 2 OTP, cleanup then closed reload/login2 exact review/v2/v1; original rows/catalog/history unchanged`);await context.close();await db.close();
 }
}finally{if(browser)await browser.close();server.kill();}
