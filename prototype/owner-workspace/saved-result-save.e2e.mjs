// Complete UI → existing API → disposable SQL → exact v2 readback. No live transport.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {PGlite} from '@electric-sql/pglite';
import {spawn} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {fixtures,ids,bootstrapSQL,seedSQL,parent,request} from '../../supabase/drafts/first_result_save/fixtures.mjs';
const origin='http://127.0.0.1:8780',payload=(await fixtures())[0],op=parent(20);
const server=spawn('python3',['-m','http.server','8780','--bind','127.0.0.1','--directory','apps/web'],{stdio:'ignore'});
const wait=async f=>{for(let i=0;i<700;i++){if(await f())return;await new Promise(r=>setTimeout(r,10));}throw Error('barrier timeout');};
let baseline=bootstrapSQL;
for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())baseline+=(await readFile('supabase/migrations/'+file,'utf8')).replace('create extension if not exists pgcrypto;','');
baseline+=seedSQL;
for(const file of ['first_result_save/proposal.sql','first_result_save/disable_writes.sql','url_result/proposal.sql'])baseline+=await readFile('supabase/drafts/'+file,'utf8');
const allScenarios=['success','unknown','conflict','cancel','logout','wrong_readback','session_restore','reload_unknown','reload_empty','reload_known','reload_corrupt','storage_denied','storage_corrupt','storage_noop'];
const scenarios=process.argv.length>2?process.argv.slice(2):allScenarios;
assert.ok(scenarios.every(s=>allScenarios.includes(s)),'known test scenarios only');
let browser;
try{
 await wait(async()=>{try{return(await fetch(origin+'/workspace.html')).ok;}catch{return false;}});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 for(const width of [1280,390])for(const scenario of scenarios){
  const db=await PGlite.create();await db.exec(baseline);
  await db.exec('grant execute on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated');
  let actor=ids.owner,authToken='synthetic';
  const auth=async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role authenticated');};await auth();
  const save=async(req,expected,p)=>Object.values((await db.query('select public.save_url_result_draft($1,$2,$3,$4,$5)',[ids.org,op,req,expected,JSON.stringify(p)])).rows[0])[0];
  const first=await save(request(20),0,payload),original=(await db.query('select * from public.content_versions where id=$1',[first])).rows[0];
  let context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage();
  const errors=[],unexpected=[],posts=[];let chain=Promise.resolve(),release=null,second=null,reconciles=0,holdDetail=false,detailRelease=null,driftDetail=false,wrongRecovery=scenario==='reload_known';
  page.on('pageerror',e=>errors.push(e.message));
  const routeTransport=async route=>{
   const req=route.request(),u=new URL(req.url()),respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(u.origin===origin){if(u.pathname==='/url-result-config.mjs')return route.fulfill({contentType:'text/javascript',body:'export const urlSaveEnabled=true;export const urlResultSchemaEnabled=true;export const urlSaveTrial=null;'});return route.continue();}
   if(u.origin!=='https://vhzryhibmpvglzcmfnaa.supabase.co'){unexpected.push(req.url());return route.abort();}
   assert.equal(req.headers().authorization,'Bearer '+authToken);
   if(u.pathname==='/auth/v1/user')return respond({id:actor});
   const task=chain.then(async()=>{
    await auth();
    if(req.method()==='POST'){
     assert.equal(u.pathname,'/rest/v1/rpc/save_url_result_draft');const p=req.postDataJSON();posts.push(p);const marker=await req.frame().evaluate(()=>JSON.parse(sessionStorage.getItem('growth-os:url-revision-attempt:v1')).operation);assert.equal(marker.request_id,p.p_request_id);assert.equal(marker.resolved,false);assert.equal(Object.values(marker).some(value=>value&&typeof value==='object'),false);assert.equal(p.p_opportunity_id,op);assert.equal(p.p_expected_version,1);assert.equal(p.p_organization_id,ids.org);assert.deepEqual(p.p_payload.snapshot,payload.snapshot);assert.deepEqual(p.p_payload.review.original_suggestions,payload.review.original_suggestions);
     if(scenario==='reload_empty')return null;
     if(scenario==='conflict')await save(request(25),1,payload);
     second=await save(p.p_request_id,p.p_expected_version,p.p_payload);return second;
    }
    assert.equal(req.method(),'GET');const table=u.pathname.split('/').at(-1),columns=u.searchParams.get('select');assert.match(table,/^[a-z_]+$/);assert.match(columns,/^[a-z_,]+$/);
    const args=[],where=[];for(const [key,value]of u.searchParams)if(!['select','order','limit'].includes(key)){assert.match(key,/^[a-z_]+$/);assert.ok(value.startsWith('eq.'));args.push(value.slice(3));where.push(`${key}=$${args.length}`);}
    let sql=`select ${columns} from public.${table}`+(where.length?' where '+where.join(' and '):'');
    if(u.searchParams.has('order')){const parts=u.searchParams.get('order').split(',');for(const part of parts)assert.match(part,/^[a-z_]+\.(asc|desc)$/);sql+=' order by '+parts.map(p=>p.replace('.',' ')).join(',');}
    if(u.searchParams.has('limit')){const n=Number(u.searchParams.get('limit'));assert.ok(Number.isSafeInteger(n)&&n>0&&n<=501);sql+=' limit '+n;}
    const rows=(await db.query(sql,args)).rows;
    if(u.searchParams.has('first_result_request_id')){reconciles++;if(['unknown','reload_unknown'].includes(scenario)&&reconciles===1)return [];if((scenario==='wrong_readback'||wrongRecovery)&&rows.length)rows[0].id=parent(99);}
    if(driftDetail && u.searchParams.get('id')==='eq.'+second && rows.length)rows[0].version_number=3;
    return rows;
   });chain=task.catch(()=>{});
   try{const value=await task;if(holdDetail && u.searchParams.get('id')==='eq.'+second)await new Promise(r=>detailRelease=r);if(req.method()==='POST'){if(['cancel','logout'].includes(scenario))await new Promise(r=>release=r);if(['unknown','reload_unknown','reload_empty','reload_corrupt'].includes(scenario))return route.abort();}return respond(value);}catch(e){if(e.code)return respond({},e.code==='42501'?403:409);unexpected.push(e.stack);return route.abort();}
  };
  await context.route('**/*',routeTransport);
  await page.goto(origin+'/workspace.html#access_token=synthetic&token_type=bearer&expires_in=3600');await page.locator('#workspace').waitFor({state:'visible'});
  const card=page.locator(`.opportunity-card[data-opportunity-id="${op}"]`);await card.locator('.typed-loader > summary').click();await card.locator('.resume-review').click();await card.locator('textarea').first().waitFor();
  await card.locator('textarea[data-field="title"]').fill('New v2 '+scenario);for(const key of ['title','meta_description','description'])await card.locator(`[data-check="${key}"]`).check();
  await card.locator('.resume-confirm').click();await card.locator('.resume-status').filter({hasText:'本頁已確認'}).waitFor();await card.locator('.resume-prepare').click();await card.locator('.resume-intent').waitFor({state:'visible'});
  const intent=JSON.parse(await card.locator('.resume-intent-json').textContent());assert.equal(intent.binding.base_version_id,first);
  if(scenario.startsWith('storage_'))await page.evaluate(mode=>{
   if(mode==='storage_corrupt')sessionStorage.setItem('growth-os:url-revision-attempt:v1','broken');
   else Storage.prototype.setItem=mode==='storage_denied'?()=>{throw Error('denied');}:()=>{};
  },scenario);
  await card.locator('.resume-save').click();
  if(scenario.startsWith('storage_')){
   await card.locator('.resume-status').filter({hasText:'未送出'}).waitFor();assert.equal(posts.length,0);assert.equal(await card.locator('textarea[data-field="title"]').inputValue(),'New v2 '+scenario);assert.equal(await card.locator('.resume-save').isDisabled(),true);
   await chain;await db.exec('reset role');assert.deepEqual((await db.query('select * from public.content_versions where id=$1',[first])).rows[0],original);assert.equal((await db.query('select count(*)::int n from public.content_versions where opportunity_id=$1',[op])).rows[0].n,1);
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);console.log(`PASS ${width}px ${scenario}: marker failure blocks dispatch, edits and v1 retained, zero POST`);await context.close();await db.close();continue;
  }
  if(scenario.startsWith('reload_')){
   await card.locator('.resume-status').filter({hasText:'只查詢原 request'}).waitFor();assert.equal(await card.locator('textarea[data-field="title"]').inputValue(),'New v2 '+scenario);
   const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('growth-os:url-revision-attempt:v1')).operation);assert.equal(stored.request_id,intent.request.request_id);assert.equal(stored.known_id,scenario==='reload_known'?second:null);
   // Closing/reopening the editor cannot create a replacement request.
   const loader=card.locator('.typed-loader').first();await loader.locator(':scope > summary').click();await wait(async()=>await card.locator('.resume-review').count()===0);await loader.locator(':scope > summary').click();await card.locator('.resume-review').click();await card.locator('.resume-status').filter({hasText:'有未決續編'}).waitFor();assert.equal(await card.locator('textarea').count(),0);
   await page.locator('#sign-out').click();if(scenario==='reload_corrupt')await page.evaluate(()=>sessionStorage.setItem('growth-os:url-revision-attempt:v1','broken'));await page.reload();await page.locator('#sign-in').waitFor({state:'visible'});
   const loginSameTab=async(who,label)=>{actor=who;authToken='synthetic-recovery-'+label;await page.goto('about:blank');await page.goto(origin+'/workspace.html#access_token='+authToken+'&token_type=bearer&expires_in=3600');try{await page.locator('#workspace').waitFor({state:'visible',timeout:5000});}catch(e){throw Error((await page.locator('#login-form .hint').innerText())+' '+JSON.stringify(errors)+' '+JSON.stringify(unexpected));}};
   if(scenario==='reload_corrupt'){
    await loginSameTab(ids.owner,'owner');await page.locator('.revision-recovery-status').filter({hasText:'不可確認'}).waitFor();assert.equal(await page.locator('.revision-recovery-read').isDisabled(),true);assert.equal(posts.length,1);
    await chain;await db.exec('reset role');assert.deepEqual((await db.query('select * from public.content_versions where id=$1',[first])).rows[0],original);assert.equal((await db.query('select count(*)::int n from public.content_versions where opportunity_id=$1',[op])).rows[0].n,2);
    assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);console.log(`PASS ${width}px reload_corrupt: damaged pending metadata after reload blocks recovery and repost; v1 unchanged`);await context.close();await db.close();continue;
   }
   await loginSameTab(ids.owner2,'wrong-owner');await page.locator('.revision-recovery-status').filter({hasText:'身份或工作區不符'}).waitFor();assert.equal(await page.locator('.revision-recovery-result .typed-draft').count(),0);assert.equal(posts.length,1);
   await page.locator('#sign-out').click();await loginSameTab(ids.owner,'owner');
   if(scenario==='reload_known'){
    await page.locator('.revision-recovery-status').filter({hasText:'恢復版本識別不符'}).waitFor();assert.equal(await page.locator('.revision-recovery-result .typed-draft').count(),0);wrongRecovery=false;
   }else await page.locator('.revision-recovery-status').filter({hasText:'結果仍未知'}).waitFor();
   assert.equal(posts.length,1);assert.equal((await page.evaluate(()=>JSON.parse(sessionStorage.getItem('growth-os:url-revision-attempt:v1')).operation)).request_id,intent.request.request_id);
   await page.locator('.revision-recovery-read').click();
   if(scenario==='reload_empty'){
    await page.locator('.revision-recovery-status').filter({hasText:'結果仍未知'}).waitFor();assert.equal(await page.locator('.revision-recovery-result .typed-draft').count(),0);assert.equal((await page.evaluate(()=>JSON.parse(sessionStorage.getItem('growth-os:url-revision-attempt:v1')).operation)).resolved,false);
   }else{
    await page.locator('.revision-recovery-status').filter({hasText:'已恢復第 2 版'}).waitFor();assert.equal(await page.locator('.revision-recovery-result .typed-draft').getAttribute('data-version-id'),second);const full=JSON.parse(await page.locator('.revision-recovery-result .typed-draft > details').last().locator('pre').textContent());assert.deepEqual(full.payload,intent.request.payload);
    const recovered=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('growth-os:url-revision-attempt:v1')).operation);assert.equal(recovered.resolved,true);assert.equal(recovered.known_id,second);
   }
   await chain;await db.exec('reset role');assert.deepEqual((await db.query('select * from public.content_versions where id=$1',[first])).rows[0],original);assert.equal((await db.query('select count(*)::int n from public.content_versions where opportunity_id=$1',[op])).rows[0].n,scenario==='reload_empty'?1:2);assert.equal(posts.length,1);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
   console.log(`PASS ${width}px ${scenario}: same-tab editor/reload/logout/login, wrong actor refused, exact request/known UUID, empty GET never reposts, metadata only, v1 unchanged`);await context.close();await db.close();continue;
  }

  if(['cancel','logout'].includes(scenario)){await wait(()=>release);if(scenario==='cancel')await card.locator('.resume-cancel').click();else await page.locator('#sign-out').click();release();await page.waitForTimeout(100);}
  if(['success','session_restore'].includes(scenario))await card.locator('.resume-status').filter({hasText:'已保存第 2 版'}).waitFor();
  if(scenario==='unknown'){
   await card.locator('.resume-status').filter({hasText:'只查詢原 request'}).waitFor();await card.locator('.resume-reconcile').click();await card.locator('.resume-status').filter({hasText:'結果仍未知'}).waitFor();assert.equal(await card.locator('.resume-save').isDisabled(),true);await card.locator('.resume-reconcile').click();await card.locator('.resume-status').filter({hasText:'已保存第 2 版'}).waitFor();
  }
  if(scenario==='cancel'){assert.ok(!(await card.locator('.resume-status').innerText()).includes('已保存第 2 版'));await card.locator('.resume-reconcile').click();await card.locator('.resume-status').filter({hasText:'已保存第 2 版'}).waitFor();}
  if(['conflict','wrong_readback'].includes(scenario)){
   await card.locator('.resume-status').filter({hasText:'只查詢原 request'}).waitFor();assert.equal(await card.locator('textarea[data-field="title"]').inputValue(),'New v2 '+scenario);assert.equal(await card.locator('.resume-save').isDisabled(),true);await card.locator('.resume-reconcile').click();await page.waitForTimeout(100);assert.equal(await card.locator('.resume-saved-result .typed-draft').count(),0);
  }
  if(scenario==='logout'){assert.equal(await page.locator('#workspace').isVisible(),false);assert.equal(await page.locator('.resume-saved-result .typed-draft').count(),0);}
  assert.equal(posts.length,1);assert.equal(posts[0].p_request_id,intent.request.request_id);
  await chain;await db.exec('reset role');assert.deepEqual((await db.query('select * from public.content_versions where id=$1',[first])).rows[0],original);
  const versions=(await db.query('select * from public.content_versions where opportunity_id=$1 order by version_number',[op])).rows;assert.equal(versions.length,2);assert.equal((await db.query("select * from public.audit_events where event_type='url_result_draft_saved'")).rows.length,2);
  if(scenario!=='conflict')assert.deepEqual(versions[1].first_result_payload,intent.request.payload);
  if(['success','unknown','cancel'].includes(scenario)){assert.equal(await card.locator('.resume-saved-result .typed-draft').getAttribute('data-version-id'),second);assert.equal(await card.locator('.typed-draft').first().getAttribute('data-version-id'),first);}
  if(scenario==='session_restore'){
   await page.locator('#sign-out').click();assert.equal(await page.locator('#workspace').isVisible(),false);
   async function freshSession(who,label){
    await context.close();actor=who;authToken='synthetic-new-'+label;
    context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',routeTransport);
    await page.goto(origin+'/workspace.html#access_token='+authToken+'&token_type=bearer&expires_in=3600');await page.locator('#workspace').waitFor({state:'visible'});
    assert.equal(await page.locator('.resume-intent-json').count(),0,'new context has no prior in-memory intent');
    assert.equal(await page.locator('.resume-saved-result .typed-draft').count(),0,'no retained success panel');
   }
   async function readVersion(id,expected){
    const section=page.locator(`.typed-version[data-version-id="${id}"]`);await section.locator('.typed-loader > summary').click();await section.locator('.typed-draft').waitFor();
    const complete=JSON.parse(await section.locator('.typed-draft > details').last().locator('pre').textContent());assert.deepEqual(complete.payload,expected);
    assert.equal(await section.locator('.typed-draft').getAttribute('data-version-id'),id);return section;
   }
   await freshSession(ids.owner,'owner');
   assert.deepEqual(await page.locator(`.opportunity-card[data-opportunity-id="${op}"] > .typed-version`).evaluateAll(nodes=>nodes.map(n=>n.dataset.versionId)),[second,first]);
   const current=await readVersion(second,intent.request.payload),history=await readVersion(first,payload);
   assert.equal(await current.locator('.resume-review').count(),1);assert.equal(await history.locator('.resume-review').count(),0,'history cannot overwrite latest base');
   // A late detail response from the ended session cannot populate its old DOM.
   await current.locator('.typed-loader > summary').click();await wait(async()=>await current.locator('.typed-draft').count()===0);
   holdDetail=true;detailRelease=null;await current.locator('.typed-loader > summary').click();await wait(()=>detailRelease);
   await page.locator('#sign-out').click();holdDetail=false;detailRelease();await page.waitForTimeout(100);assert.equal(await page.locator('.typed-draft').count(),0);
   await freshSession(ids.viewer,'viewer');await readVersion(second,intent.request.payload);await readVersion(first,payload);assert.equal(await page.locator('.resume-review').count(),0);
   const viewerCurrent=page.locator(`.typed-version[data-version-id="${second}"]`);await viewerCurrent.locator('.typed-loader > summary').click();await wait(async()=>await viewerCurrent.locator('.typed-draft').count()===0);driftDetail=true;
   await viewerCurrent.locator('.typed-loader > summary').click();await viewerCurrent.locator('.typed-read-feedback').filter({hasText:'版本資料與列表不一致'}).waitFor();assert.equal(await viewerCurrent.locator('.typed-draft').count(),0);driftDetail=false;
   await page.locator('#sign-out').click();await freshSession(ids.foreign,'foreign');assert.equal(await page.locator(`.opportunity-card[data-opportunity-id="${op}"]`).count(),0);
   await chain;await auth();assert.equal((await db.query('select id from public.content_versions where id=$1',[second])).rows.length,0,'real isolated RLS hides existing v2 from foreign tenant');
   await db.exec('reset role');assert.deepEqual((await db.query('select * from public.content_versions where id=$1',[first])).rows[0],original);
   assert.equal((await db.query('select count(*)::int n from public.content_versions where opportunity_id=$1',[op])).rows[0].n,2);assert.equal(posts.length,1,'all new sessions GET-only');
   console.log(`PASS ${width}px fresh Owner session exact v2 + complete v1 history; viewer readonly, foreign tenant RLS, stale version and logout late-read denial; no extra POST`);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);console.log(`PASS ${width}px ${scenario}: exact v2/unknown GET-only/conflict retained/cancel+session guard; v1 unchanged, 1/2/2, one synthetic POST`);
  await context.close();await db.close();
 }
}finally{if(browser)await browser.close();server.kill();}
