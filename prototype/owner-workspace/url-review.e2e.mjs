// Browser → existing API → isolated SQL. Synthetic auth/transport only.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonical} from './first-result-payload.mjs';
import {chromium} from 'playwright';
import {PGlite} from '@electric-sql/pglite';
import {spawn} from 'node:child_process';
import {baseline,reviewGrant,saveGrant,fixtures,ids,parent,request,checks} from '../../supabase/drafts/url_review/fixture.mjs';
import {restoreResultReview} from '../../apps/web/first-result-review.mjs';
const origin='http://127.0.0.1:8783',op=parent(20),payload=(await fixtures())[0],setup=await baseline();
const changed=await restoreResultReview(payload);changed.edit('title','Exact saved revision for Owner review');for(const key of ['title','meta_description','description'])changed.check(key,true);await changed.confirm();const revised=await changed.export();
const server=spawn('python3',['-m','http.server','8783','--bind','127.0.0.1','--directory','apps/web'],{stdio:'ignore'});
const wait=async fn=>{for(let i=0;i<700;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('barrier timeout');};
const all=['success','unknown_commit','unknown_empty','wrong_uuid','wrong_digest','stale','cancel_before','cancel_after','logout','source_drift','actor_drift','closed','preview_closed'];
const scenarios=process.argv.length>2?process.argv.slice(2):all;assert.ok(scenarios.every(s=>all.includes(s)));
let browser;
try{
 await wait(async()=>{try{return(await fetch(origin+'/workspace.html')).ok;}catch{return false;}});browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 for(const width of [1280,390])for(const scenario of scenarios){
  const db=await PGlite.create();await db.exec(setup+saveGrant+reviewGrant);let actor=ids.owner,token='synthetic-review';
  const auth=async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role authenticated');};await auth();
  const save=async(n,v,p=revised)=>Object.values((await db.query('select public.save_url_result_draft($1,$2,$3,$4,$5)',[ids.org,op,request(n),v,JSON.stringify(p)])).rows[0])[0];
  const first=await save(20,0,payload),second=await save(21,1),before=(await db.query('select * from public.content_versions order by version_number')).rows;
  const errors=[],unexpected=[],posts=[];let chain=Promise.resolve(),hold=null,reviewId=null,readCount=0,badRead=['wrong_uuid','wrong_digest'].includes(scenario),drift=false,third=null;
  let context,page;
  const transport=async route=>{
   const req=route.request(),u=new URL(req.url()),respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(u.origin===origin){if(u.pathname==='/url-result-config.mjs')return route.fulfill({contentType:'text/javascript',body:`export const urlSaveEnabled=false;export const urlResultSchemaEnabled=true;export const urlSaveTrial=null;${scenario==='closed'?'':scenario==='preview_closed'?'export const urlReviewSchemaEnabled=true;export const urlReviewEnabled=false;':'export const urlReviewEnabled=true;'}`});return route.continue();}
   if(u.origin!=='https://vhzryhibmpvglzcmfnaa.supabase.co'){unexpected.push(req.url());return route.abort();}
   assert.equal(req.headers().authorization,'Bearer '+token);
   if(u.pathname==='/auth/v1/user')return respond({id:drift&&scenario==='actor_drift'?ids.owner2:actor});
   const task=chain.then(async()=>{
    await auth();
    if(req.method()==='POST'){
     assert.equal(u.pathname,'/rest/v1/rpc/review_url_result');const p=req.postDataJSON();posts.push(p);assert.equal(p.p_version_id,second);assert.equal(p.p_organization_id,ids.org);assert.deepEqual(p.p_checks,checks);
     const marker=await req.frame().evaluate(()=>JSON.parse(sessionStorage.getItem('growth-os:url-review-attempt:v1')).operation);assert.equal(marker.request_id,p.p_request_id);assert.equal(marker.resolved,false);assert.equal(Object.values(marker).some(v=>v&&typeof v==='object'),false);
     if(scenario==='unknown_empty')return null;
     if(scenario==='stale')third=await save(22,2);
     reviewId=Object.values((await db.query('select public.review_url_result($1,$2,$3,$4,$5,$6,$7)',[p.p_organization_id,p.p_version_id,p.p_request_id,p.p_source_digest,p.p_content_digest,p.p_version_digest,JSON.stringify(p.p_checks)])).rows[0])[0];return reviewId;
    }
    assert.equal(req.method(),'GET');const table=u.pathname.split('/').at(-1),columns=u.searchParams.get('select');assert.match(table,/^[a-z_]+$/);assert.match(columns,/^[a-z_,]+$/);
    const args=[],where=[];for(const [k,v]of u.searchParams)if(!['select','order','limit'].includes(k)){assert.match(k,/^[a-z_]+$/);assert.ok(v.startsWith('eq.'));args.push(v.slice(3));where.push(`${k}=$${args.length}`);}
    let sql=`select ${columns} from public.${table}`+(where.length?' where '+where.join(' and '):'');
    if(u.searchParams.has('order')){const parts=u.searchParams.get('order').split(',');for(const p of parts)assert.match(p,/^[a-z_]+\.(asc|desc)$/);sql+=' order by '+parts.map(p=>p.replace('.',' ')).join(',');}
    if(u.searchParams.has('limit')){const n=Number(u.searchParams.get('limit'));assert.ok(Number.isSafeInteger(n)&&n>0&&n<=501);sql+=' limit '+n;}
    const rows=(await db.query(sql,args)).rows;
    if(drift&&scenario==='source_drift'&&table==='content_versions'&&columns.includes('first_result_payload')&&rows[0])rows[0].first_result_payload.snapshot.final_url='https://different.example/product';
    if(table==='content_reviews'&&u.searchParams.has('url_review_request_id')){
     readCount++;assert.equal(u.searchParams.get('url_review_request_id'),'eq.'+posts[0].p_request_id);
     if(scenario==='unknown_commit'&&readCount===1)return [];
     if(badRead&&rows.length){if(scenario==='wrong_uuid')rows[0].id=parent(99);else rows[0].url_review_content_digest='sha256:'+'f'.repeat(64);}
    }
    return rows;
   });chain=task.catch(()=>{});
   try{const value=await task;if(req.method()==='POST'){
    if(['cancel_after','logout'].includes(scenario))await new Promise(r=>hold=r);
    if(scenario.startsWith('unknown_'))return route.abort();
   }return respond(value);}catch(error){if(error.code)return respond({},error.code==='42501'?403:409);unexpected.push(error.stack);return route.abort();}
  };
  async function login(who=ids.owner,fresh=false){
   if(fresh&&context)await context.close();actor=who;token='synthetic-review-'+who;
   if(!context||fresh){context=await browser.newContext({viewport:{width,height:844},permissions:['clipboard-read','clipboard-write'],acceptDownloads:true,serviceWorkers:'block'});await context.route('**/*',transport);page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));}
   await page.goto('about:blank');await page.goto(origin+'/workspace.html#access_token='+token+'&token_type=bearer&expires_in=3600');await page.locator('#workspace').waitFor({state:'visible'});
  }
  async function open(id){const view=page.locator(`.typed-version[data-version-id="${id}"]`);await view.locator('.typed-loader > summary').click();await view.locator('.typed-draft').waitFor();return view;}
  async function fill(view){for(const key of Object.keys(checks))await view.locator(`[data-review-check="${key}"]`).check();}
  async function deliver(view,expected,historical=false){
   const beforePosts=posts.length,id=await view.getAttribute('data-version-id'),feedback=view.locator('.saved-delivery-status');
   await view.locator('.saved-copy').click();await feedback.filter({hasText:'已複製'}).waitFor();
   const text=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(text.includes(id));assert.ok(text.includes(ids.org));assert.ok(text.includes(expected.snapshot.final_url));assert.ok(text.includes('未發布'));
   assert.ok(text.includes(historical?'已保存歷史版本':'已保存讀取時最新版本'));
   const fields=Object.fromEntries(['title','meta_description','description'].map(k=>[k,expected.preview.fields[k].suggested]));
   assert.ok(text.endsWith(['Title:\n'+fields.title,'Meta description:\n'+fields.meta_description,'產品描述:\n'+fields.description].join('\n\n')));
   const event=page.waitForEvent('download');await view.locator('.saved-download').click();const download=await event;
   assert.equal(download.suggestedFilename(),`growth-os-saved-${id}.json`);const bytes=await readFile(await download.path()),out=JSON.parse(bytes.toString('utf8'));
   assert.equal(out.format,'growth-os.saved-url-result.v1');assert.equal(out.version.id,id);assert.equal(out.version.organization_id,ids.org);assert.equal(out.version.position,historical?'historical':'latest_at_read');
   assert.equal(out.version.payload_digest,'sha256:'+createHash('sha256').update(canonical(expected)).digest('hex'));
   assert.deepEqual(out.fields,fields);assert.deepEqual(out.payload,expected);assert.equal(out.source.candidate_url,expected.snapshot.final_url);assert.equal(out.source.source_digest,expected.snapshot.content_fingerprint);
   assert.equal(out.content_digest,expected.review.content_digest);assert.equal(out.published,false);assert.equal(out.publication_authorized,false);assert.equal(out.review_attested_by_export,false);assert.equal(posts.length,beforePosts);
   console.log(`PASS delivery ${width}px ${historical?'historical':'latest'}: real clipboard and ${bytes.length} download bytes match saved version ${id}; zero additional POST`);
  }
  const status=view=>view.locator('.url-review-status');
  await login();let view=await open(second);
   async function preview(expected){
    const beforePosts=posts.length,checkedBefore=await view.locator('[data-review-check]:checked').count();await view.locator('.publish-preview-read').click();await view.locator('.publish-preview-status').filter({hasText:'預覽已讀取'}).waitFor();
    assert.ok((await view.locator('.publish-target').innerText()).includes(revised.snapshot.final_url));assert.ok((await view.locator('.publish-target').innerText()).includes('不代表站點所有權'));
    for(const key of ['title','meta_description','description']){const field=view.locator(`[data-publish-field="${key}"]`);assert.equal(await field.locator('.publish-before').textContent(),revised.preview.fields[key].original);assert.equal(await field.locator('.publish-after').textContent(),revised.preview.fields[key].suggested);}
    assert.equal(await view.locator('[data-blocker="REVIEW_REQUIRED"]').count(),expected===false?1:0);assert.equal(await view.locator('[data-blocker="REVIEW_UNKNOWN"]').count(),expected==='unknown'?1:0);
    for(const code of ['PUBLICATION_CONFIRMATION_REQUIRED','PLATFORM_UNSELECTED','SITE_UNAUTHORIZED','LIVE_BASELINE_UNKNOWN','PUBLISH_UNAVAILABLE'])assert.equal(await view.locator(`[data-blocker="${code}"]`).count(),1);
    assert.equal(await view.locator('.publish-unavailable').isDisabled(),true);assert.equal(posts.length,beforePosts);
    assert.equal(await view.locator('[data-review-check]:checked').count(),checkedBefore,'preview never changes fact checks');
   }
  if(scenario==='closed'){
   assert.equal(await view.locator('.url-review').count(),0);assert.equal(posts.length,0);
  }else if(scenario==='preview_closed'){
   await status(view).filter({hasText:'待確認'}).waitFor();await preview(false);await deliver(view,revised);assert.equal(await view.locator('.url-review-confirm').isDisabled(),true);assert.equal(posts.length,0);
  }else{
   await status(view).filter({hasText:'待確認'}).waitFor();
   if(scenario==='success')await preview(false);

   const full=JSON.parse(await view.locator('.typed-draft > details').last().locator('pre').textContent());assert.deepEqual(full.payload,revised);assert.equal(await view.locator('.url-review-confirm').isDisabled(),true);
   // Partial facts cannot dispatch. Opening/cancelling editor clears all local checks.
   for(const key of ['title','meta_description','description','source'])await view.locator(`[data-review-check="${key}"]`).check();assert.equal(await view.locator('.url-review-confirm').isDisabled(),true);
   if(scenario==='success'){
    await view.locator('.resume-review').click();await view.locator('textarea').first().waitFor();assert.equal(await view.locator('[data-review-check]:checked').count(),0);assert.equal(await view.locator('.url-review-confirm').isDisabled(),true);
    assert.equal(await view.locator('.publish-preview-body').textContent(),'');assert.equal(await view.locator('.publish-preview-read').isDisabled(),true);
    await view.locator('textarea').first().fill('Unsaved change is not confirmed');await view.locator('.resume-cancel').click();assert.deepEqual(JSON.parse(await view.locator('.typed-draft > details').last().locator('pre').textContent()).payload,revised);
   }
   await fill(view);
   if(scenario==='cancel_before'){
    await view.locator('.url-review-cancel').click();await status(view).filter({hasText:'已取消核對'}).waitFor();assert.equal(await view.locator('[data-review-check]:checked').count(),0);assert.equal(posts.length,0);
   }else{
    drift=true;await view.locator('.url-review-confirm').click();
    if(['actor_drift','source_drift'].includes(scenario)){await status(view).filter({hasText:'未送出確認'}).waitFor();assert.equal(posts.length,0);}
    else{
     if(['cancel_after','logout'].includes(scenario)){
      await wait(()=>hold);if(scenario==='cancel_after')await view.locator('.url-review-cancel').click();else await page.locator('#sign-out').click();hold();await page.waitForTimeout(80);
      if(scenario==='cancel_after'){assert.ok(!(await status(view).innerText()).includes('此已保存版本已確認'));await view.locator('.url-review-read').click();}
      else{assert.equal(await page.locator('#workspace').isVisible(),false);assert.equal(await page.locator('.url-review').count(),0);await login(ids.owner,true);view=await open(second);}
     }
     if(scenario.startsWith('unknown_')){
      await status(view).filter({hasText:'只查詢原 request'}).waitFor();const marker=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('growth-os:url-review-attempt:v1')).operation);assert.equal(marker.known_id,null);assert.equal(marker.request_id,posts[0].p_request_id);
      await page.locator('#sign-out').click();await login(ids.owner2);view=await open(second);await status(view).filter({hasText:'身份或工作區不符'}).waitFor();assert.equal(await view.locator('.url-review-confirm').isDisabled(),true);
      await page.locator('#sign-out').click();await login();view=await open(second);await status(view).filter({hasText:'結果仍未知'}).waitFor();assert.equal(await view.locator('.url-review-confirm').isDisabled(),true);await view.locator('.url-review-read').click();
      if(scenario==='unknown_empty'){await status(view).filter({hasText:'結果仍未知'}).waitFor();assert.equal((await page.evaluate(()=>JSON.parse(sessionStorage.getItem('growth-os:url-review-attempt:v1')).operation)).resolved,false);await preview('unknown');}
     }
     if(badRead){await status(view).filter({hasText:'只查詢原 request'}).waitFor();assert.equal(await view.locator('.url-review-confirm').isDisabled(),true);badRead=false;await view.locator('.url-review-read').click();}
     if(scenario==='stale'){await status(view).filter({hasText:'只查詢原 request'}).waitFor();await view.locator('.url-review-read').click();await status(view).filter({hasText:'結果仍未知'}).waitFor();}
     if(!['unknown_empty','stale'].includes(scenario)){await status(view).filter({hasText:'此已保存版本已確認'}).waitFor();assert.ok((await status(view).innerText()).includes(reviewId));assert.ok((await status(view).innerText()).includes(second));assert.ok((await status(view).innerText()).includes('未發布'));}
     assert.equal(posts.length,1);
    }
   }
   if(scenario==='success'){
    // New browser context has no marker or prior page receipt; authoritative GET restores same UUID.
    await login(ids.owner,true);view=await open(second);await status(view).filter({hasText:reviewId}).waitFor();await preview(true);await deliver(view,revised);assert.equal(await view.locator('.url-review-confirm').isDisabled(),true);
    await view.locator('.resume-review').click();await view.locator('textarea').first().waitFor();await status(view).filter({hasText:'修改尚未保存'}).waitFor();assert.equal(await view.locator('.saved-copy').isDisabled(),true);assert.equal(await view.locator('.saved-download').isDisabled(),true);assert.equal(await view.locator('.url-review-confirm').isDisabled(),true);
    await chain;await auth();third=await save(22,2);await login(ids.owner,true);const newer=await open(third);await status(newer).filter({hasText:'待確認'}).waitFor();assert.equal(await newer.locator('[data-review-check]:checked').count(),0);
    view=await open(second);await status(view).filter({hasText:'歷史版本已確認'}).waitFor();assert.equal(await view.locator('.publish-preview-read').isDisabled(),true);assert.equal(await view.locator('.publish-preview-body').textContent(),'');assert.equal(await view.locator('.url-review-confirm').isVisible(),false);assert.ok((await status(view).innerText()).includes(reviewId));
    const original=await open(first);await status(original).filter({hasText:'待確認'}).waitFor();await deliver(original,payload,true);assert.deepEqual(JSON.parse(await original.locator('.typed-draft > details').last().locator('pre').textContent()).payload,payload);
    await login(ids.viewer,true);view=await open(second);await deliver(view,revised,true);assert.equal(await view.locator('.publish-preview-read').isDisabled(),true);assert.equal(await view.locator('.publish-preview-body').textContent(),'');await status(view).filter({hasText:reviewId}).waitFor();assert.equal(await view.locator('.url-review-confirm').isVisible(),false);assert.equal(await page.locator('.resume-review').count(),0);
    await login(ids.foreign,true);assert.equal(await page.locator(`.opportunity-card[data-opportunity-id="${op}"]`).count(),0);await chain;await auth();assert.equal((await db.query('select id from public.content_reviews')).rows.length,0);assert.equal(posts.length,1);
   }
   if(!['success','logout'].includes(scenario))assert.deepEqual(JSON.parse(await view.locator('.typed-draft > details').last().locator('pre').textContent()).payload,revised);
  }
  await chain;await db.exec('reset role');assert.deepEqual((await db.query('select * from public.content_versions where version_number<=2 order by version_number')).rows,before);
  const expected=['success','unknown_commit','wrong_uuid','wrong_digest','cancel_after','logout'].includes(scenario)?1:0;
  assert.equal((await db.query('select count(*)::int n from public.content_reviews')).rows[0].n,expected);assert.equal((await db.query("select count(*)::int n from public.audit_events where event_type='url_result_reviewed'")).rows[0].n,expected);
  assert.equal((await db.query('select count(*)::int n from public.content_versions')).rows[0].n,third?3:2);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');console.log(`PASS ${width}px ${scenario}: exact stored Review, preserved v1/v2, ${expected} review/audit, ${posts.length} POST`);await context.close();await db.close();
 }
}finally{if(browser)await browser.close();server.kill();}
