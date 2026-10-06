// Browser regression only: genuine GoTrue sessions + candidate native PostgREST, no hosted fallback.
import assert from 'node:assert/strict';
import http from 'node:http';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createHandler} from '../gateway.mjs';
import {freeOrigin} from '../../wordpress-pilot/host-fixture-client.mjs';
import {enterWorkspaceSession} from '../../owner-workspace/session-browser.mjs';
export async function verifyUI({login,call,authOrigin,restOrigin,payload,ids,snapshot,run}){
 const origin=await freeOrigin(),backend='https://wqepyttadrcnphtyjpjy.supabase.co';
 const config={public_origin:origin,supabase:{origin:backend,publishable_key:'sb_publishable_isolated'},source_origin:'http://127.0.0.1:1',publication_origin:'http://127.0.0.1:1',wordpress:{origin:'https://site.example.invalid'},activation:{expires_at:Date.now()+300000,publisher:false}};
 const server=http.createServer(await createHandler(config));await new Promise(r=>server.listen(Number(new URL(origin).port),'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});let context,session,page;const results=[];
 try{for(const width of [1280,390]){
  let savePosts=0,reviewPosts=0,loseSave=true,loseReview=true;const before=JSON.parse(snapshot());const errors=[];
  async function fresh(role){await context?.close();context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page=await context.newPage();
   await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.origin===origin)return route.continue();if(u.origin!==backend)return route.abort();
    let target,path;if(u.pathname==='/auth/v1/user'&&r.method()==='GET'){target=authOrigin;path='/user';}else if(u.pathname.startsWith('/rest/v1/')){target=restOrigin;path=u.pathname.slice('/rest/v1'.length)+u.search;}else return route.abort();
    const save=path==='/rpc/save_url_result_draft'&&r.method()==='POST',review=path==='/rpc/review_url_result'&&r.method()==='POST';if(save)savePosts++;if(review)reviewPosts++;
    const response=await call(target,path,{method:r.method(),token:r.headers().authorization?.slice(7),body:r.method()==='POST'?r.postDataJSON():undefined});
    if(save&&loseSave&&response.status===200){loseSave=false;return route.abort();}if(review&&loseReview&&response.status===200){loseReview=false;return route.abort();}
    return route.fulfill({status:response.status,contentType:'application/json',body:JSON.stringify(response.data)});
   });
   const old=session?.access_token;session=await login(role);assert.notEqual(session.access_token,old);await enterWorkspaceSession(page,{origin,access_token:session.access_token,expires_in:session.expires_in});assert.deepEqual(await context.cookies(),[]);assert.equal(await page.evaluate(()=>location.hash),'');
  }
  async function logout(){await page.locator('#sign-out').click();assert.equal(await page.locator('#workspace').isVisible(),false);assert.equal((await call(authOrigin,'/logout?scope=local',{method:'POST',token:session.access_token})).status,204);assert.equal((await call(authOrigin,'/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}})).status,400);}
  const open=async id=>{const view=page.locator(`.typed-version[data-version-id="${id}"]`);await view.locator('.typed-loader > summary').click();await view.locator('.typed-draft').waitFor();return view;};
  const read=async v=>JSON.parse(await v.locator('.typed-draft > details').last().locator('pre').textContent()).payload;
  await fresh('owner');await page.getByLabel('匯入成果與來源 JSON').setInputFiles({name:'native-source.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});await page.locator('#url-save-preview .typed-draft').waitFor();await page.locator('#save-url-result').click();await page.locator('#url-save-feedback').filter({hasText:'不會重試'}).waitFor();assert.equal(await page.locator('#save-url-result').isDisabled(),true);assert.equal(savePosts,1);
  await page.getByRole('button',{name:'只查詢保存結果',exact:true}).click();await page.locator('#url-save-feedback').filter({hasText:'已保存第 1 版'}).waitFor();assert.equal(savePosts,1);
  const saved=JSON.parse(snapshot()).versions.find(v=>!before.versions.some(b=>b.id===v.id));assert.ok(saved);assert.deepEqual(saved.first_result_payload,payload);
  await logout();await fresh('owner');let view=await open(saved.id);assert.deepEqual(await read(view),payload);await view.locator('.url-review-status').filter({hasText:'待確認'}).waitFor();
  for(const key of ['title','meta_description','description','source','blocking_facts_clear'])await view.locator(`[data-review-check="${key}"]`).check();await view.locator('.url-review-confirm').click();await view.locator('.url-review-status').filter({hasText:/Failed|fetch|查詢|未知/}).waitFor();assert.equal(reviewPosts,1);assert.equal(await view.locator('.url-review-confirm').isDisabled(),true);await view.locator('.url-review-read').click();await view.locator('.url-review-status').filter({hasText:'此已保存版本已確認'}).waitFor();assert.equal(reviewPosts,1);
  const exact=JSON.parse(snapshot());assert.equal(exact.versions.length,before.versions.length+1);assert.equal(exact.reviews.length,before.reviews.length+1);assert.equal(exact.audit.length,before.audit.length+2);
  await logout();await fresh('owner');view=await open(saved.id);assert.deepEqual(await read(view),payload);await view.locator('.url-review-status').filter({hasText:'此已保存版本已確認'}).waitFor();assert.deepEqual(JSON.parse(snapshot()),exact);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('.url-review').first().screenshot({path:'/tmp/'+run+'-'+width+'.png'});
  await logout();await fresh('viewer');view=await open(saved.id);assert.deepEqual(await read(view),payload);assert.equal(await page.locator('.resume-review').count(),0);assert.deepEqual(JSON.parse(snapshot()),exact);assert.deepEqual(errors,[]);
  results.push({width,save_posts:savePosts,review_posts:reviewPosts,native_logout_refresh_revoked:true,fresh_server_jwt:true,exact_payload:true,exact_review:true,lost_save_and_review_get_only:true,viewer_read_no_write:true,sql_delta:{versions:1,reviews:1,audit:2},horizontal_overflow:false});
 }}finally{await context?.close();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 await writeFile('/tmp/'+run+'-ui.json',JSON.stringify(results,null,2)+'\n',{mode:0o600});return results;
}
