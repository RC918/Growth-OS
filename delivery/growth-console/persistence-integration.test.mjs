import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {createConsoleTask} from '../../apps/web/growth-console-task.mjs';
import {createResultReview,restoreResultReview} from '../../apps/web/first-result-review.mjs';
import {assertSavedClaims} from '../../apps/web/saved-claim-context.mjs';
import {createWorkspaceApi} from '../../apps/web/claim-guarded-workspace-api.mjs';
import {canonical} from '../../apps/web/first-result-payload.mjs';
import {createRevisionMarker} from '../../apps/web/url-result-trial-marker.mjs';
import {deriveClaim,buildClaimIntegration} from '../web-preview/claim-integration.mjs';
import {startTestService,producerReport,testOrigin,ids,captureFailure,observeChromiumLaunch,waitForDevTools} from './persistence-integration.e2e.mjs';
const report=producerReport(),keys=['title','meta_description','description'];
async function exported(change='Made of steel.'){
 const review=createResultReview(report);review.edit('description',change);for(const k of keys)review.check(k,true);await review.confirm();return review.export();
}
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
function client(service){const store=storage();return createWorkspaceApi({origin:testOrigin,key:'sb_publishable_test_only',redirectOrigin:service.origin,fetchImpl:service.fetchImpl,urlSaveEnabled:true,urlResultSchemaEnabled:true,urlReviewEnabled:true,urlReviewSchemaEnabled:true,revisionMarker:createRevisionMarker(()=>store),reviewMarker:createRevisionMarker(()=>store,'review')});}
const login=(api,token)=>api.completeMagicLink('#access_token='+token+'&token_type=bearer&expires_in=3600');
const intent=payload=>({organization_id:ids.org,opportunity_id:randomUUID(),request_id:randomUUID(),expected_version:0,payload});
async function setup(t){const dir=await mkdtemp('/tmp/gos-claim-test-');const service=await startTestService({storePath:dir+'/store.json',report});t.after(async()=>{await service.close();await rm(dir,{recursive:true,force:true});});return {dir,service};}
const live={isCurrent:()=>true,onDispatch:()=>{}};
const mutations=s=>s.requests.filter(r=>r.method==='POST');

test('adapter checks saved edits against restored producer text without changing any persisted byte',async()=>{
 const payload=await exported(),before=canonical(payload),result=await assertSavedClaims(payload);
 assert.ok(['PASS','PASS_WITH_REVIEW'].includes(result.decision));assert.equal(canonical(payload),before);
 assert.equal(result.original_suggestions.description,report.preview.fields.description.suggested);
 assert.equal(result.fields.find(f=>f.field==='description').text,'Made of steel.');
 for(const change of [r=>delete r.review.original_suggestions,r=>r.review.original_suggestions.description='Forged',r=>r.snapshot.citations.find(c=>c.id===r.facts.description.citations[0]).quote='Partial',r=>r.facts.features[0].verification='UNKNOWN',r=>r.snapshot.version='0'.repeat(64)]){
  const bad=structuredClone(payload);change(bad);await assert.rejects(assertSavedClaims(bad));
 }
 await assert.rejects(assertSavedClaims(await exported('Not made of steel.')),/宣稱/);
});
test('Console handoff requires current claim/page confirmation and invalidates on edit/source/reset/scenario',async()=>{
 const task=createConsoleTask({load:async()=>report});task.setURL(report.snapshot.original_url);await task.start();
 await assert.rejects(task.exportHandoff());for(const k of keys)task.check(k,true);await task.confirm();
 const facade=task.getHandoffReview();assert.ok(facade);const token=facade.view().token;
 assert.equal((await task.exportHandoff()).review.confirmation.scope,'page_only');
 const late=task.exportHandoff();task.edit('description','Not made of steel.');await assert.rejects(late);assert.notEqual(facade.view().token,token);assert.equal(task.getHandoffReview(),null);
 await task.checkClaims();for(const k of keys)task.check(k,true);await task.confirm();await assert.rejects(task.exportHandoff());
 task.setURL('https://example.com/other');await assert.rejects(task.exportHandoff());task.reset();await assert.rejects(task.exportHandoff());
 await task.scenario('complete',report);assert.equal(task.getHandoffReview(),null);await assert.rejects(task.exportHandoff());
});
test('actual createWorkspaceApi RPC shape, exact durable full payload, new session, revision and version review',async t=>{
 const {dir,service}=await setup(t),api=client(service),firstToken=service.session();await login(api,firstToken);
 const request=intent(await exported()),id=await api.saveUrlResult(request,live);request.returned_version_id=id;
 const saved=await api.reconcileUrlResult(request,id);assert.equal(canonical(saved.first_result_payload),canonical(request.payload));
 assert.equal(saved.first_result_payload.review.content_digest,request.payload.review.content_digest);
 const disk=JSON.parse(await readFile(dir+'/store.json'));assert.equal(disk.versions[0].created_by,ids.owner);for(const k of Object.keys(saved))assert.equal(canonical(disk.versions[0][k]),canonical(saved[k]),k);
 api.signOut();const fresh=client(service);await login(fresh,service.session());
 const dashboard=await fresh.dashboard(),row=await fresh.readContentVersion(dashboard.versions[0]);assert.equal(canonical(row.first_result_payload),canonical(request.payload));
 const base=await fresh.readReviewBase(row),review=await restoreResultReview(base.first_result_payload);review.edit('description','Public steel bolt.');for(const k of keys)review.check(k,true);await review.confirm();
 const revision=await fresh.prepareUrlRevisionIntent(base,await review.export(),live);await fresh.saveUrlRevision(revision,live);
 const second=await fresh.recoverUrlRevision(live);assert.equal(second.version_number,2);assert.equal(second.first_result_payload.preview.fields.description.suggested,'Public steel bolt.');
 const checks={title:true,meta_description:true,description:true,source:true,blocking_facts_clear:true},reviewable=await fresh.readContentVersion(second);await fresh.confirmUrlReview(reviewable,checks,live);
 assert.equal((await fresh.readUrlReview(reviewable)).is_latest_version,true);
 await assert.rejects(fresh.confirmUrlReview(row,checks,live));
 const posts=mutations(service);assert.deepEqual(posts.map(r=>r.path),['/rest/v1/rpc/save_url_result_draft','/rest/v1/rpc/save_url_result_draft','/rest/v1/rpc/review_url_result']);
 assert.equal(canonical(posts[0].body.p_payload),canonical(request.payload));
});
test('all three guarded mutations fail closed for contradictory/missing evidence before POST',async t=>{
 const {service}=await setup(t),api=client(service);await login(api,service.session());const bad=await exported('Not made of steel.');
 await assert.rejects(api.saveUrlResult(intent(bad),live),/宣稱/);
 await assert.rejects(api.saveUrlRevision({binding:{},request:{payload:bad}},live),/宣稱/);
 await assert.rejects(api.confirmUrlReview({first_result_payload:bad},{},live),/宣稱/);
 assert.equal(mutations(service).length,0);
});
test('epoch/source/cancel/session drift during validation and duplicate operations cannot POST',async t=>{
 const {service}=await setup(t),api=client(service);await login(api,service.session());const request=intent(await exported());
 let current=true;const stale=api.saveUrlResult(request,{isCurrent:()=>current});current=false;await assert.rejects(stale);assert.equal(mutations(service).length,0);
 const logout=api.saveUrlResult(request,live);api.signOut();await assert.rejects(logout);assert.equal(mutations(service).length,0);
 await login(api,service.session());const operation=api.saveUrlResult(request,live);await assert.rejects(api.saveUrlResult(request,live),/已有操作/);const id=await operation;
 await api.reconcileUrlResult(request,id);assert.equal(mutations(service).length,1);
});
test('unknown save survives logout and permits only original GET recovery; no duplicate POST',async t=>{
 const {service}=await setup(t),api=client(service);await login(api,service.session());const request=intent(await exported());
 service.loseNext('/rest/v1/rpc/save_url_result_draft');await assert.rejects(api.saveUrlResult(request,live));
 await assert.rejects(api.saveUrlResult(intent(request.payload),live),/只可讀取/);api.signOut();await login(api,service.session());
 await assert.rejects(api.saveUrlResult(intent(request.payload),live),/只可讀取/);
 const before=service.requests.length,row=await api.reconcileUrlResult(request);assert.ok(row);assert.ok(service.requests.slice(before).every(r=>r.method==='GET'));
 assert.equal(mutations(service).length,1);
});
test('unknown revision and exact review recover through GET-only; base/source drift never dispatches',async t=>{
 const {service}=await setup(t),api=client(service);await login(api,service.session());const request=intent(await exported());const id=await api.saveUrlResult(request,live),base=await api.reconcileUrlResult(request,id);
 const review=await restoreResultReview(base.first_result_payload);review.edit('description','Public steel bolt.');for(const k of keys)review.check(k,true);await review.confirm();
 const prepared=await api.prepareUrlRevisionIntent(base,await review.export(),live),bad=structuredClone(prepared);bad.request.payload.snapshot.version='0'.repeat(64);
 await assert.rejects(api.saveUrlRevision(bad,live));assert.equal(mutations(service).length,1);
 service.loseNext('/rest/v1/rpc/save_url_result_draft');await assert.rejects(api.saveUrlRevision(prepared,live));await assert.rejects(api.saveUrlRevision(prepared,live),/只可讀取/);
 const before=service.requests.length,second=await api.recoverUrlRevision(live);assert.ok(service.requests.slice(before).every(r=>r.method==='GET'));assert.equal(second.version_number,2);
 const version=await api.readContentVersion(second),checks={title:true,meta_description:true,description:true,source:true,blocking_facts_clear:true};
 service.loseNext('/rest/v1/rpc/review_url_result');await assert.rejects(api.confirmUrlReview(version,checks,live));await assert.rejects(api.confirmUrlReview(version,checks,live),/只可讀取/);
 const start=service.requests.length;assert.ok(await api.readUrlReview(version));assert.ok(service.requests.slice(start).every(r=>r.method==='GET'));assert.equal(mutations(service).length,3);
});
test('owner/viewer/foreign scope, version conflict, and late read session checks use unchanged client contracts',async t=>{
 const {service}=await setup(t),api=client(service);await login(api,service.session());const request=intent(await exported());const id=await api.saveUrlResult(request,live),row=await api.reconcileUrlResult(request,id);
 const viewer=client(service);await login(viewer,service.session('viewer'));await assert.rejects(viewer.saveUrlResult(intent(request.payload),live),/擁有者/);assert.equal((await viewer.readContentVersion((await viewer.dashboard()).versions[0])).id,id);
 const foreign=client(service);await login(foreign,service.session('foreign'));assert.equal((await foreign.dashboard()).versions.length,0);await assert.rejects(foreign.saveUrlResult(intent(request.payload),live));
 const hold=service.holdNext('/rest/v1/content_versions');const reading=api.readContentVersion(row);await hold.entered;api.signOut();hold.release();await assert.rejects(reading,/工作區/);
 assert.equal(mutations(service).length,1);
});
test('derived integration rejects absent/duplicate anchors, verifies 115 frozen sources and output hashes',async t=>{
 for(const name of ['workspace.mjs','url-result-save.mjs']){
  const source=await readFile('apps/web/'+name,'utf8');assert.notEqual(deriveClaim(name,source),source);assert.throws(()=>deriveClaim(name,''));assert.throws(()=>deriveClaim(name,source+source));
 }
 const dir=await mkdtemp('/tmp/gos-claim-build-');t.after(()=>rm(dir,{recursive:true,force:true}));const result=await buildClaimIntegration({directory:dir});assert.equal(result.frozen_files_verified,115);
 for(const [name,identity]of Object.entries(result.files))assert.equal(createHash('sha256').update(await readFile(dir+'/'+name)).digest('hex'),identity.output_sha256);
 // Compare with the independently recorded baseline, not a copy provisioned
 // from the very file under test on one author's machine.
 assert.equal(createHash('sha256').update(await readFile('apps/web/workspace.mjs')).digest('hex'),'9ba67576e59dc06479c0c0a48c00c0165d80e0f04631da1a090cc9100dd1ab06');
});
test('response-stage loss marker follows durable commit without changing RPC payload or causing socket loss',async t=>{
 const {service}=await setup(t),token=service.session(),request=intent(await exported());
 service.loseNext('/rest/v1/rpc/save_url_result_draft','cdp-response');
 const response=await service.fetchImpl(testOrigin+'/rest/v1/rpc/save_url_result_draft',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({p_organization_id:request.organization_id,p_opportunity_id:request.opportunity_id,p_request_id:request.request_id,p_expected_version:0,p_payload:request.payload})});
 assert.equal(response.headers.get('x-test-lost-reply'),'reject-native-fetch');assert.equal(response.ok,true);assert.equal(await response.json(),service.snapshot().versions[0].id);
 assert.equal(canonical(service.snapshot().versions[0].first_result_payload),canonical(request.payload));assert.equal(mutations(service).length,1);
});
test('primary failure and requests/DOM are durable before screenshot failure and are never replaced by it',async t=>{
 const dir=await mkdtemp('/tmp/gos-capture-test-');t.after(()=>rm(dir,{recursive:true,force:true}));const original=Error('EXPECTED_PRIMARY_ASSERTION'),requests=[{method:'POST',path:'test-only'}];
 const cdp={send:async()=>({targetInfos:[{type:'page',targetId:'synthetic-page',url:'http://127.0.0.1/test'}]}),tab:async()=>({id:'synthetic-page',evaluate:async expression=>expression.includes('input')?[]:'retained DOM',screenshot:async()=>{
  const saved=JSON.parse(await readFile(dir+'/browser-failure.json'));assert.equal(saved.error,original.message);assert.equal(saved.pages[0].text,'retained DOM');assert.deepEqual(JSON.parse(await readFile(dir+'/rpc-requests.json')),requests);throw Error('EXPECTED_SCREENSHOT_TIMEOUT');
 }})};
 await captureFailure(original,{cdp,service:{requests},evidence:dir});const saved=JSON.parse(await readFile(dir+'/browser-failure.json'));assert.equal(saved.error,original.message);assert.equal(saved.stack,original.stack);assert.deepEqual(saved.capture_errors,[{stage:'screenshot',target_id:'synthetic-page',error:'EXPECTED_SCREENSHOT_TIMEOUT'}]);
});
test('startup diagnosis retains actual stderr/exit and missing-executable spawn error',async t=>{
 const dir=await mkdtemp('/tmp/gos-launch-test-');t.after(()=>rm(dir,{recursive:true,force:true}));
 const failed=observeChromiumLaunch({executable:process.execPath,args:['-e',"process.stderr.write('TEST_ONLY_STARTUP_FAILURE\\n');process.exit(17)"],evidence:dir});
 await new Promise(resolve=>failed.child.once('close',resolve));await failed.stop();
 const exit=JSON.parse(await readFile(dir+'/chromium-startup.json'));assert.equal(exit.exit_code,17);assert.equal(exit.signal,null);assert.equal(exit.ready,false);assert.match(await readFile(dir+'/chromium-stderr.log','utf8'),/TEST_ONLY_STARTUP_FAILURE/);assert.equal(exit.executable,process.execPath);
 const absent=observeChromiumLaunch({executable:dir+'/missing-executable',args:[],evidence:dir});await new Promise(resolve=>absent.child.once('close',resolve));await absent.stop();const error=JSON.parse(await readFile(dir+'/chromium-startup.json'));assert.equal(error.spawn_error.code,'ENOENT');assert.equal(error.ready,false);assert.equal(error.finished,true);
});
test('DevTools readiness waits for a complete endpoint and rejects exit or bounded timeout',async t=>{
 const dir=await mkdtemp('/tmp/gos-ready-test-');t.after(()=>rm(dir,{recursive:true,force:true}));
 let ready=0;const launch={snapshot:()=>({finished:false}),markReady:()=>ready++};
 await writeFile(dir+'/DevToolsActivePort','9222\n');
 const writing=setTimeout(()=>{void writeFile(dir+'/DevToolsActivePort','9222\n/devtools/browser/test-id\n');},75);
 t.after(()=>clearTimeout(writing));
 assert.deepEqual(await waitForDevTools(launch,dir,{timeoutMs:2000}),['9222','/devtools/browser/test-id']);assert.equal(ready,1);
 await writeFile(dir+'/DevToolsActivePort','0\n/devtools/browser/test-id\n');
 await assert.rejects(waitForDevTools(launch,dir,{timeoutMs:100}),/deadline/);assert.equal(ready,1);
 await assert.rejects(waitForDevTools({...launch,snapshot:()=>({finished:true})},dir,{timeoutMs:1000}),/exited/);assert.equal(ready,1);
});
