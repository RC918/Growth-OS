// Entire browser transport is synthetic; candidate SQL executes on isolated PGlite.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {PGlite} from '@electric-sql/pglite';
import {spawn} from 'node:child_process';
import {frozen,renderBound} from '../../supabase/drafts/url_result/bound/generate.mjs';
import {baselineSQL} from '../../supabase/drafts/url_result/bound/baseline.mjs';
import {fixtures,ids} from '../../supabase/drafts/first_result_save/fixtures.mjs';
const origin='http://127.0.0.1:8777',reports=await fixtures(),{manifest:m,payload}=await frozen();
const pack=await renderBound({expiresAt:'2099-01-01T00:00:00Z',previewURL:'https://offline.invalid/workspace.html'});
const server=spawn('python3',['-m','http.server','8777','--bind','127.0.0.1','--directory','apps/web'],{stdio:'ignore'});
const wait=async fn=>{for(let i=0;i<700;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('barrier timeout');};
let browser;
try{
 await wait(async()=>{try{return(await fetch(origin+'/workspace.html')).ok;}catch{return false;}});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});console.log('Chromium '+browser.version());
 for(const width of [1280,390]){
  const db=await PGlite.create();await db.exec(await baselineSQL({pglite:true}));await db.exec(pack.opening);
  const ctx=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),errors=[],unexpected=[],posts=[];
  // Loopback target is test-only; generator requires HTTPS for every candidate.
  let trial={...pack.config,workspace_url:origin+'/workspace.html'},reads=0,role='owner',enabled=true,unknown=false,hold=null,release=null,membershipMode='normal',hideReconcile=false,chain=Promise.resolve();
  ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await ctx.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());const respond=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
   if(url.origin===origin){
    if(url.pathname==='/url-result-config.mjs')return route.fulfill({contentType:'text/javascript',body:`export const urlSaveEnabled=${enabled};export const urlResultSchemaEnabled=true;export const urlSaveTrial=${JSON.stringify(trial)};`});
    if(url.pathname==='/api/product-source'){
     const raw=structuredClone(reports[0]);for(const [key,field]of Object.entries(raw.preview.fields)){field.suggested=raw.review.original_suggestions[key];delete field.user_edited;delete field.citation_role;}delete raw.review;raw.preview.status='awaiting_review';return respond(raw);
    }
    return route.continue();
   }
   if(url.origin!=='https://vhzryhibmpvglzcmfnaa.supabase.co'){unexpected.push(req.url());return route.abort();}
   const actor=role==='owner'?m.actor_id:ids[role];
   if(url.pathname==='/auth/v1/user')return respond({id:actor});
   if(url.pathname.endsWith('/organization_members')&&membershipMode!=='normal')return respond(membershipMode==='zero'?[]:[{organization_id:ids.org,role},{organization_id:ids.other,role}]);
   if(url.searchParams.has('first_result_request_id')){assert.equal(url.searchParams.get('first_result_request_id'),'eq.'+m.request_id);reads++;}
   const task=chain.then(async()=>{
    await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role authenticated');
    if(req.method()==='POST'){
     assert.equal(url.pathname,'/rest/v1/rpc/save_url_result_draft');const p=req.postDataJSON();posts.push(p);assert.ok(reads>0);assert.equal(p.p_opportunity_id,m.opportunity_id);assert.equal(p.p_request_id,m.request_id);assert.equal(p.p_expected_version,0);assert.deepEqual(p.p_payload,payload);
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

  const page=await ctx.newPage();
  const login=async()=>{await page.goto('about:blank');await page.goto(origin+'/workspace.html#access_token=synthetic&token_type=bearer&expires_in=3600');await page.locator('#workspace').waitFor({state:'visible'});await wait(async()=>!await page.locator('#url-save-feedback').innerText().then(s=>s.includes('先查詢')));};
  const file=page.getByLabel('匯入成果與來源 JSON'),save=page.locator('#save-url-result'),feedback=page.locator('#url-save-feedback'),get=page.getByRole('button',{name:'只查詢保存結果'});
  const upload=async data=>{await file.setInputFiles({name:'frozen.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});};
  await login();await feedback.filter({hasText:'未找到固定版本'}).waitFor();assert.ok(reads>0);assert.equal(posts.length,0);
  await upload(reports[1]);await feedback.filter({hasText:'只接受已凍結'}).waitFor();assert.equal(await save.isDisabled(),true);
  // Expired client gate cannot dispatch even if the SQL test window is open.
  trial={...trial,expires_at:'2000-01-01T00:00:00.000Z'};await login();await upload(payload);await page.locator('#url-save-preview .typed-draft').waitFor();assert.equal(await save.isDisabled(),true);assert.equal(posts.length,0);
  trial={...trial,expires_at:pack.config.expires_at};await login();await upload(payload);await page.locator('#url-save-preview .typed-draft').waitFor();assert.equal(await save.isDisabled(),false);
  assert.equal(await page.getByLabel('保存歸屬').isDisabled(),true);unknown=true;await save.click();await get.waitFor();await wait(async()=>!await get.isDisabled());assert.equal(posts.length,1);
  hideReconcile=true;await get.click();await feedback.filter({hasText:'結果仍未知'}).waitFor();assert.equal(await save.isDisabled(),true);assert.equal(await file.isDisabled(),true);assert.equal(posts.length,1);
  await get.click();await feedback.filter({hasText:'唯讀取回'}).waitFor();assert.equal(posts.length,1);
  const shown=JSON.parse(await page.locator('#url-save-preview details').last().locator('pre').textContent());assert.deepEqual(shown.payload,payload);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  // A fresh module has no memory of the prior attempt: fixed GET restores readonly result.
  const previousReads=reads;await login();await feedback.filter({hasText:'唯讀取回'}).waitFor();assert.ok(reads>previousReads);assert.equal(await file.isDisabled(),true);assert.equal(await save.isDisabled(),true);assert.equal(posts.length,1);
  await chain;await db.exec('reset role');await db.exec(pack.cleanup);enabled=false;await login();await feedback.filter({hasText:'唯讀取回'}).waitFor();assert.equal(await save.isDisabled(),true);assert.equal(posts.length,1);
  await chain;await db.exec('reset role');const scalar=async s=>Object.values((await db.query(s)).rows[0])[0];
  for(const [table,where]of [['growth_opportunities',"where entry_kind='url_result'"],['content_versions',''],['audit_events',"where event_type='url_result_draft_saved'"]])assert.equal(await scalar(`select count(*)::int from public.${table} ${where}`),1);
  for(const role of ['anon','authenticated','service_role'])for(const fn of ['public.save_url_result_draft','private.save_url_result_draft_impl'])assert.equal(await scalar(`select has_function_privilege('${role}','${fn}(uuid,uuid,uuid,integer,jsonb)','EXECUTE')`),false);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);await ctx.close();await db.close();console.log(`PASS bound ${width}px fixed GET-first, frozen import, expiry, one POST, unknown GET-only, fresh readonly and cleanup retained 1/1/1`);
 }
}finally{if(browser)await browser.close();server.kill();}
