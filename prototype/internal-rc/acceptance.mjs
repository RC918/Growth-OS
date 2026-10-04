// Whole RC acceptance candidate. NOT executed until the persistent environment is approved.
// Two separate invocations: phase-a exits completely; phase-b starts from disk/new real Auth.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {root,prefix} from './deploy/compose.mjs';
import {readSecret} from './runtime.mjs';
import {enterWorkspaceSession} from '../owner-workspace/session-browser.mjs';
import {checks} from '../../supabase/drafts/url_review/fixture.mjs';
const phase=process.argv[2];if(!['phase-a','phase-b'].includes(phase))throw Error('Explicit RC phase required');
const config=JSON.parse(await readFile(root+'/config.json','utf8')),origin=config.listen_origin,identities=JSON.parse(await readSecret(root+'/secrets/identities.json'));
assert.equal(config.bound.run,prefix);assert.ok(Date.now()<config.bound.expires_at);assert.equal(config.backend_origin,'https://growth-internal-rc.supabase.co');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});let context,page,token;
const snapshot=()=>JSON.parse(execFileSync('docker',['exec','-i',prefix+'-db','psql','-XAt','-U','postgres','-v','ON_ERROR_STOP=1'],{input:"select jsonb_build_object('versions',(select coalesce(jsonb_agg(to_jsonb(v) order by id),'[]') from content_versions v),'reviews',(select coalesce(jsonb_agg(to_jsonb(v) order by id),'[]') from content_reviews v),'audit',(select coalesce(jsonb_agg(to_jsonb(v) order by id),'[]') from audit_events v));",encoding:'utf8'}));
async function login(role,newContext=true){
 if(newContext){await context?.close();context=await browser.newContext({viewport:{width:phase==='phase-a'?1280:390,height:844},serviceWorkers:'block'});page=await context.newPage();assert.deepEqual(await context.cookies(),[]);}
 const credentials=identities[role];const r=await fetch(config.auth_url.replace(/\/$/,'')+'/token?grant_type=password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:credentials.email,password:credentials.password}),redirect:'error'});assert.equal(r.status,200,'native Auth must issue the session');const session=await r.json();assert.equal(session.user.id,credentials.id);assert.notEqual(session.access_token,token);token=session.access_token;
 await enterWorkspaceSession(page,{origin,access_token:token,expires_in:session.expires_in});return token;
}
const request=async(action,input)=>{const r=await fetch(origin+'/api/wordpress-publication/'+action,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(input)});return {status:r.status,data:await r.json()};};
async function open(id){const v=page.locator(`.typed-version[data-version-id="${id}"]`);await v.locator('.typed-loader > summary').click();await v.locator('.typed-draft').waitFor();return v;}
const payloadOf=async view=>JSON.parse(await view.locator('.typed-draft > details').last().locator('pre').textContent()).payload;
async function publish(view){await view.locator('.wp-preview').click();await view.locator('.wp-status').filter({hasText:'尚未發布；請核對'}).waitFor();await view.locator('.wp-confirm').check();await view.locator('.wp-publish').click();}
try{
 if(phase==='phase-a'){
  context=await browser.newContext({viewport:{width:1280,height:844},serviceWorkers:'block'});page=await context.newPage();await page.goto(origin+'/first-result.html');await page.locator('#source-url').fill(config.bound.target_url);
  const response=page.waitForResponse(r=>r.url().endsWith('/api/product-source'));await page.locator('#source-submit').click();const source=await(await response).json();assert.ok(source.snapshot.html.includes('itemprop="description"'));await page.locator('#review-title').waitFor();
  for(const key of ['title','meta_description','description']){await page.locator('#review-'+key).fill(source.preview.fields[key].suggested+' RC edited');await page.locator('#review-check-'+key).check();}await page.locator('#review-confirm').click();
  const exported=page.waitForEvent('download');await page.locator('#export-result').click();const payload=JSON.parse(await readFile(await(await exported).path(),'utf8'));assert.deepEqual(payload.snapshot,source.snapshot);
  const popup=context.waitForEvent('page');await page.locator('#handoff-result').click();page=await popup;await page.waitForLoadState();await login('owner',false);
  await page.locator('#save-url-result').click();await page.locator('#url-save-feedback').filter({hasText:'已保存第 1 版'}).waitFor();const state=snapshot();assert.equal(state.versions.length,1);const id=state.versions[0].id;
  await page.locator('#sign-out').click();await login('owner');let view=await open(id);assert.deepEqual(await payloadOf(view),payload);
  for(const key of Object.keys(checks))await view.locator(`[data-review-check="${key}"]`).check();await view.locator('.url-review-confirm').click();await view.locator('.url-review-status').filter({hasText:'此已保存版本已確認'}).waitFor();
  await publish(view);await view.locator('.wp-status').filter({hasText:'已發布並由 API 與網頁讀回核對'}).waitFor();const evidence=JSON.parse(await view.locator('.wp-evidence').textContent());
  const m=view.locator('.publication-measurement');await m.locator('.measurement-read').click();await m.locator('.measurement-status').filter({hasText:'量測已讀回'}).waitFor();await m.locator('.measure-save').click();await m.locator('.measurement-status').filter({hasText:'觀測已保存'}).waitFor();const measurement=(await request('measurement',{version_id:id})).data;assert.deepEqual(measurement.data,{baseline:null,followup:null});assert.equal(measurement.assessment.comparison,null);
  await view.locator('.wp-restore').click();await view.locator('.wp-status').filter({hasText:'已恢復'}).waitFor();await publish(view);await view.locator('.wp-status').filter({hasText:'提交結果未知'}).waitFor();
  const journal=JSON.parse(await readFile(config.journal_path,'utf8')),pending=journal.events.at(-1).value.operation;assert.equal(pending.state,'submitting');
  await writeFile(root+'/evidence/bookmark.json',JSON.stringify({version_id:id,payload,evidence,measurement,pending_id:pending.id,sql:snapshot(),bound:config.bound},null,2),{flag:'wx',mode:0o600});
  console.log('PHASE A complete: actual native Auth/SQL, real controlled HTML, HTTP service, durable publication/unknown measurement/pending; browser runner now exits.');
 }else{
  const bookmark=JSON.parse(await readFile(root+'/evidence/bookmark.json','utf8'));assert.deepEqual(config.bound,bookmark.bound);await login('owner');const view=await open(bookmark.version_id);assert.deepEqual(await payloadOf(view),bookmark.payload);assert.deepEqual(snapshot(),bookmark.sql);
  const history=await request('history',{version_id:bookmark.version_id});assert.equal(history.status,200);assert.equal(history.data.at(-1).id,bookmark.pending_id);assert.equal(history.data.at(-1).state,'unknown');
  assert.equal((await request('publish',{version_id:bookmark.version_id,intent_id:bookmark.pending_id,page_id:1001,confirm:true})).status,403);assert.equal((await request('preview',{version_id:bookmark.version_id})).status,403);
  await view.locator('.wp-history').click();await view.locator('.wp-status').filter({hasText:'提交結果未知'}).waitFor();await view.locator('.wp-readback').click();await view.locator('.wp-status').filter({hasText:'讀回仍是發布前內容'}).waitFor();
  const measurement=await request('measurement',{version_id:bookmark.version_id,publication_id:bookmark.measurement.publication.id});assert.equal(measurement.status,200);assert.deepEqual(measurement.data.data,bookmark.measurement.data);assert.deepEqual(measurement.data.publication.evidence,bookmark.evidence);assert.equal(measurement.data.assessment.comparison,null);
  const journalBefore=await readFile(config.journal_path,'utf8');
  for(const role of ['viewer','foreign']){await login(role);assert.equal((await request('measurement',{version_id:bookmark.version_id})).status,403);assert.equal((await request('readback',{version_id:bookmark.version_id,intent_id:bookmark.pending_id})).status,403);
   const r=await fetch(origin+'/backend/rest/v1/content_versions?select=id,first_result_payload&organization_id=eq.'+config.bound.organization_id,{headers:{authorization:'Bearer '+token}});assert.equal(r.status,200);assert.equal((await r.json()).length,role==='viewer'?1:0);
   const v=bookmark.sql.versions[0],review=bookmark.sql.reviews[0];
   for(const [rpc,input]of [['save_url_result_draft',{p_organization_id:config.bound.organization_id,p_opportunity_id:v.opportunity_id,p_request_id:randomUUID(),p_expected_version:1,p_payload:bookmark.payload}],['review_url_result',{p_organization_id:config.bound.organization_id,p_version_id:v.id,p_request_id:randomUUID(),p_source_digest:review.url_review_source_digest,p_content_digest:review.url_review_content_digest,p_version_digest:review.url_review_version_digest,p_checks:checks}]]){const denied=await fetch(origin+'/backend/rest/v1/rpc/'+rpc,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(input)});assert.equal(denied.status,403);}
  }
  assert.equal(await readFile(config.journal_path,'utf8'),journalBefore);assert.deepEqual(snapshot(),bookmark.sql);await page.screenshot({path:root+'/evidence/mobile-tenant.png',fullPage:true});
  console.log('PHASE B complete: all old browser/runner/service processes gone; new native Auth session recovers exact persisted SQL/publication/measurement/pending, GET-only reconcile and tenant denial. Unknown remains unknown, no traffic claim.');
 }
}catch(error){throw Error(String(error.stack??error).replace(/#access_token=[^\s"'<>]+/g,'#[redacted]').replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer [redacted]'));}finally{await context?.close();await browser.close();}
