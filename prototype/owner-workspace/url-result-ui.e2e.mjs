// Existing product + workspace UI and actual candidate SQL. Synthetic Auth/HTTP only.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {PGlite} from '@electric-sql/pglite';
import {spawn} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {fixtures,ids,bootstrapSQL,seedSQL} from '../../supabase/drafts/first_result_save/fixtures.mjs';
const origin='http://127.0.0.1:8775',reports=await fixtures();
const server=spawn('python3',['-m','http.server','8775','--bind','127.0.0.1','--directory','apps/web'],{stdio:'ignore'});
const wait=async fn=>{for(let i=0;i<500;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('barrier timeout');};
let browser;
try{
 await wait(async()=>{try{return(await fetch(origin+'/workspace.html')).ok;}catch{return false;}});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 for(const width of [1280,390]){
  const db=await PGlite.create();await db.exec(bootstrapSQL);
  for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec((await readFile('supabase/migrations/'+f,'utf8')).replace('create extension if not exists pgcrypto;',''));
  await db.exec(seedSQL);await db.exec('delete from public.growth_opportunities');
  await db.exec(await readFile('supabase/drafts/first_result_save/proposal.sql','utf8'));await db.exec(await readFile('supabase/drafts/first_result_save/disable_writes.sql','utf8'));await db.exec(await readFile('supabase/drafts/url_result/proposal.sql','utf8'));
  await db.exec('grant execute on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated');
  const ctx=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});const errors=[],unexpected=[],posts=[];let role='owner',enabled=true,unknown=false,hold=null,release=null,membershipMode='normal';let chain=Promise.resolve(),hideReconcile=false;
  ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await ctx.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());const respond=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
   if(url.origin===origin){
    if(url.pathname==='/url-result-config.mjs')return route.fulfill({contentType:'text/javascript',body:`export const urlSaveEnabled=${enabled};export const urlResultSchemaEnabled=true;`});
    if(url.pathname==='/api/product-source'){
     const raw=structuredClone(reports[0]);for(const [key,field]of Object.entries(raw.preview.fields)){field.suggested=raw.review.original_suggestions[key];delete field.user_edited;delete field.citation_role;}delete raw.review;raw.preview.status='awaiting_review';return respond(raw);
    }
    return route.continue();
   }
   if(url.origin!=='https://vhzryhibmpvglzcmfnaa.supabase.co'){unexpected.push(req.url());return route.abort();}
   const actor=ids[role]??ids.owner;
   if(url.pathname==='/auth/v1/user')return respond({id:actor});
   if(url.pathname.endsWith('/organization_members')&&membershipMode!=='normal')return respond(membershipMode==='zero'?[]:[{organization_id:ids.org,role},{organization_id:ids.other,role}]);
   const task=chain.then(async()=>{
    await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role authenticated');
    if(req.method()==='POST'){
     assert.equal(url.pathname,'/rest/v1/rpc/save_url_result_draft');const p=req.postDataJSON();posts.push(p);
     const rows=(await db.query('select public.save_url_result_draft($1,$2,$3,$4,$5)',[p.p_organization_id,p.p_opportunity_id,p.p_request_id,p.p_expected_version,JSON.stringify(p.p_payload)])).rows;return Object.values(rows[0])[0];
    }
    assert.equal(req.method(),'GET');const table=url.pathname.split('/').at(-1);assert.match(table,/^[a-z_]+$/);
    const columns=url.searchParams.get('select');assert.match(columns,/^[a-z_,]+$/);
    const args=[],where=[];for(const [key,val]of url.searchParams)if(!['select','order','limit'].includes(key)){assert.match(key,/^[a-z_]+$/);assert.ok(val.startsWith('eq.'));args.push(val.slice(3));where.push(`${key}=$${args.length}`);}
    let sql=`select ${columns} from public.${table}`+(where.length?' where '+where.join(' and '):'');
    if(url.searchParams.has('order')){const parts=url.searchParams.get('order').split(',');for(const p of parts)assert.match(p,/^[a-z_]+\.(asc|desc)$/);sql+=' order by '+parts.map(p=>p.replace('.',' ')).join(',');}
    if(url.searchParams.has('limit')){const n=Number(url.searchParams.get('limit'));assert.ok(Number.isSafeInteger(n)&&n>0&&n<=501);sql+=' limit '+n;}
    const rows=(await db.query(sql,args)).rows;if(hideReconcile&&url.searchParams.has('first_result_request_id')){hideReconcile=false;return [];}return rows;
   });chain=task.catch(()=>{});
   try{const result=await task;if(req.method()==='POST'){if(hold)await new Promise(r=>release=r);if(unknown){unknown=false;return route.abort();}}return respond(result);}
   catch(e){if(e.code)return respond({},e.code==='42501'?403:409);unexpected.push(e.stack);return route.abort();}
  });
  const product=await ctx.newPage();await product.goto(origin+'/first-result.html');
  await product.locator('#source-url').fill('https://example.com/products/bolt');await product.locator('#source-submit').click();await product.locator('#review-title').waitFor();
  await product.locator('#review-title').fill('已編輯 🧪 title');for(const key of ['title','meta_description','description'])await product.locator('#review-check-'+key).check();await product.locator('#review-confirm').click();await product.getByText('本頁已確認 · 未保存 · 未發布',{exact:true}).waitFor();
  const download=product.waitForEvent('download');await product.locator('#export-result').click();const exported=JSON.parse(await readFile(await(await download).path(),'utf8'));
  const opened=ctx.waitForEvent('page');await product.locator('#handoff-result').click();const page=await opened;await page.waitForLoadState();await page.addInitScript(()=>{window.testOffers=[];addEventListener('message',e=>{if(e.data?.type==='url-result-offer')window.testOffers.push(e.data);});});
  const login=async(p=page)=>{await p.goto('about:blank');await p.goto(origin+'/workspace.html#access_token=synthetic&token_type=bearer&expires_in=3600');try{await p.locator('#workspace').waitFor({state:'visible',timeout:5000});}catch(e){throw Error((await p.locator('#login-form .hint').innerText())+' '+JSON.stringify(unexpected)+' '+JSON.stringify(errors));}};
  await login();await page.locator('#url-save-preview .typed-draft').waitFor();
  assert.equal(posts.length,0,'handoff and login never auto-save');
  const shown=JSON.parse(await page.locator('#url-save-preview details').last().locator('pre').textContent());assert.deepEqual(shown.payload,exported,'no rehydration changes to originals/checks/history');
  assert.equal(await page.locator('#profile-status').textContent(),'尚待核准');
  // A different same-origin window cannot inject a result, even with a valid nonce.
  await page.evaluate(p=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{type:'url-result-offer',nonce:crypto.randomUUID(),payload:p}})),reports[1]);
  assert.equal(await page.locator('#url-save-preview [data-field=title]').textContent(),exported.preview.fields.title.suggested);
  await page.evaluate(p=>window.dispatchEvent(new MessageEvent('message',{origin:'https://wrong.example',source:window.opener,data:{type:'url-result-offer',nonce:crypto.randomUUID(),payload:p}})),reports[1]);
  assert.equal(await page.locator('#url-save-preview [data-field=title]').textContent(),exported.preview.fields.title.suggested);
  await page.locator('#save-url-result').click();await page.locator('#url-save-feedback').filter({hasText:'已保存第 1 版'}).waitFor();assert.equal(posts.length,1);assert.deepEqual(posts[0].p_payload,exported);
  await page.getByText('URL 成果 · 待專用審核 · 未發布',{exact:true}).waitFor();assert.equal(await page.locator('.opportunity-card form').count(),0);assert.doesNotMatch(await page.locator('.opportunity-card').innerText(),/null|需查核來源或審核紀錄|尚無可追溯來源/);
  await page.locator('.typed-loader > summary').focus();await page.keyboard.press('Enter');await page.locator('.opportunity-card .typed-draft').waitFor();
  const exact=JSON.parse(await page.locator('.opportunity-card .typed-draft details').last().locator('pre').textContent());assert.deepEqual(exact.payload,exported);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window.opener,data:window.testOffers[0]})));
  assert.match(await page.locator('#url-save-feedback').innerText(),/已保存第 1 版/);assert.equal(await page.locator('#save-url-result').isDisabled(),true,'nonce replay cannot reopen saved intent');
  // Real import path appends same snapshot; unknown HTTP after DB commit reconciles without another POST.
  const importResult=async(p=exported)=>{await page.getByLabel('匯入成果與來源 JSON').setInputFiles({name:'result.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await page.locator('#url-save-preview .typed-draft').waitFor();};
  await importResult();await page.getByLabel('保存歸屬').selectOption(posts[0].p_opportunity_id);unknown=true;await page.locator('#save-url-result').click();await page.getByRole('button',{name:'只查詢保存結果'}).waitFor();await wait(()=>posts.length===2);await wait(async()=>!await page.getByRole('button',{name:'只查詢保存結果'}).isDisabled());
  hideReconcile=true;await page.getByRole('button',{name:'只查詢保存結果'}).click();await page.locator('#url-save-feedback').filter({hasText:'結果仍未知'}).waitFor();assert.equal(posts.length,2);assert.equal(await page.locator('#save-url-result').isDisabled(),true);
  await page.getByRole('button',{name:'只查詢保存結果'}).click();await page.locator('#url-save-feedback').filter({hasText:'已保存第 2 版'}).waitFor();assert.equal(posts.length,2);
  // Cancel/changed review invalidates transferred preview; original page remains usable.
  await product.locator('#cancel-handoff').click();await product.locator('#review-title').fill('另一個本頁修訂');assert.equal(await product.locator('#result-section').isVisible(),true);
  const nextWindow=ctx.waitForEvent('page');await product.locator('#handoff-result').click();const cancelled=await nextWindow;await cancelled.waitForLoadState();await login(cancelled);await cancelled.locator('#url-save-preview .typed-draft').waitFor();await product.locator('#review-title').fill('來源頁修改使交接失效');await wait(async()=>await cancelled.locator('#url-save-preview .typed-draft').count()===0);await cancelled.close();assert.equal(await product.locator('#review-title').inputValue(),'來源頁修改使交接失效');
  // A committed save with a held HTTP response cannot revive UI after signout/context change.
  await importResult();await page.getByLabel('保存歸屬').selectOption(posts[0].p_opportunity_id);hold=true;await page.locator('#save-url-result').click();await wait(()=>!!release);await page.locator('#sign-out').click();
  const late=page.waitForResponse(r=>r.url().includes('/rpc/save_url_result_draft'));release();await (await late).finished();hold=null;
  assert.equal(await page.locator('#url-save-preview .typed-draft').count(),0);assert.doesNotMatch(await page.locator('#url-save-feedback').innerText(),/已保存第 3 版/);
  role='foreign';await login();assert.equal(await page.locator('.opportunity-card').count(),0);await page.locator('#sign-out').click();role='owner';await login();
  // Signout and synthetic fresh login reads the persisted SQL version.
  await page.locator('#sign-out').click();await login();await page.locator('.typed-loader > summary').first().click();await page.locator('.opportunity-card .typed-draft').waitFor();assert.equal(posts.length,3);
  for(const memberRole of ['viewer','editor']){await page.locator('#sign-out').click();role=memberRole;await login();await importResult();assert.equal(await page.locator('#save-url-result').isDisabled(),true);}
  await page.locator('#sign-out').click();role='owner';for(const mode of ['zero','multiple']){membershipMode=mode;await page.goto('about:blank');await page.goto(origin+'/workspace.html#access_token=synthetic&token_type=bearer&expires_in=3600');await page.locator('#login-form .hint').filter({hasText:'既有工作區'}).waitFor();assert.equal(await page.locator('#workspace').isVisible(),false);}membershipMode='normal';
  // Once schema exists, a closed write gate preserves URL-specific readonly rendering.
  enabled=false;await login();await page.getByText('URL 成果 · 待專用審核 · 未發布',{exact:true}).waitFor();assert.doesNotMatch(await page.locator('.opportunity-card').innerText(),/null|需查核來源/);await importResult();assert.equal(await page.locator('#save-url-result').isDisabled(),true);assert.equal(posts.length,3);
  await chain;await db.exec('reset role');const scalar=async s=>Object.values((await db.query(s)).rows[0])[0];
  assert.equal(await scalar("select count(*)::int from public.growth_opportunities where entry_kind='url_result'"),1);assert.equal(await scalar('select count(*)::int from public.content_versions'),3);assert.equal(await scalar("select count(*)::int from public.audit_events where event_type='url_result_draft_saved'"),3);
  assert.equal(await scalar('select count(*)::int from public.business_profiles'),0);assert.equal(await scalar('select count(*)::int from public.opportunity_sources'),0);assert.equal(await scalar('select count(*)::int from public.opportunity_decisions'),0);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);await ctx.close();await db.close();console.log(`PASS URL ${width}px real product Review → window handoff/import → workspace confirmation → candidate SQL → exact readback; first+two appends row budget 1/3/3, unknown GET-only, roles, no profile, closed default`);
 }
}finally{if(browser)await browser.close();server.kill();}
