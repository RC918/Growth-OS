import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build,derive} from './build.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('same route derived output preserves every other source and all frozen RC bytes',async()=>{
 const m=await build();assert.deepEqual(Object.keys(m.files).filter(f=>m.files[f].derived),['first-result.html','first-result.mjs','growth-console.css','growth-console.mjs','typed-draft.mjs','url-result-config.mjs','url-result-save.mjs','workspace.css','workspace.html','workspace.mjs']);
 const distConfig=await readFile('delivery/web-preview/dist/url-result-config.mjs','utf8');assert.match(distConfig,/export const urlSaveEnabled=true;/);assert.match(distConfig,/export const urlResultSchemaEnabled=true;/);assert.match(distConfig,/export const urlReviewEnabled=false;/);assert.match(await readFile('apps/web/url-result-config.mjs','utf8'),/export const urlSaveEnabled=false;/);
 assert.deepEqual((await readdir('apps/web')).sort(),(await readdir('delivery/web-preview/dist')).sort());
 for(const [name,entry] of Object.entries(m.files)){const s=await readFile('apps/web/'+name),o=await readFile('delivery/web-preview/dist/'+name);assert.equal(hash(s),entry.source_sha256);assert.equal(hash(o),entry.output_sha256);if(!entry.derived)assert.deepEqual(o,s);}
 const frozen=JSON.parse(await readFile('prototype/internal-rc/deploy/hashes.json'));for(const [file,h]of Object.entries(frozen))assert.equal(hash(await readFile(file)),h,file);
 const js=await readFile('delivery/web-preview/dist/first-result.mjs','utf8');assert.match(js,/fetch\('\/api\/product-source'/);assert.match(js,/navigation.refresh\(\)/);
 assert.match(await readFile('delivery/web-preview/dist/workspace.mjs','utf8'),/from '.\/claim-guarded-workspace-api.mjs'/);
 assert.match(await readFile('delivery/web-preview/dist/url-result-save.mjs','utf8'),/await validateReport\(frozen\);await assertSavedClaims\(frozen\);/);
 const config=JSON.parse(await readFile('vercel.json'));assert.equal(config.outputDirectory,'delivery/web-preview/dist');
});
test('missing or ambiguous exact hooks fail closed instead of emitting an unwired page',async()=>{
 for(const name of ['first-result.html','first-result.mjs']){const s=await readFile('apps/web/'+name,'utf8');assert.throws(()=>derive(name,''),/hook/);assert.throws(()=>derive(name,s+s),/hook/);}
});

test('deployed API rejects contradictory claims and preserves exact saved payload across fresh sessions',async t=>{
 const {mkdtemp,rm}=await import('node:fs/promises');
 const {randomUUID}=await import('node:crypto');
 const {startTestService,producerReport,testOrigin,ids}=await import('../growth-console/persistence-integration.e2e.mjs');
 const {createResultReview}=await import('../../apps/web/first-result-review.mjs');
 const {canonical}=await import('../../apps/web/first-result-payload.mjs');
 const {createWorkspaceApi}=await import('./dist/claim-guarded-workspace-api.mjs');
 const dir=await mkdtemp('/tmp/gos-deployed-guard-');
 const service=await startTestService({storePath:dir+'/store.json'});
 t.after(async()=>{await service.close();await rm(dir,{recursive:true,force:true});});
 const client=()=>createWorkspaceApi({origin:testOrigin,key:'sb_publishable_test_only',redirectOrigin:service.origin,fetchImpl:service.fetchImpl,urlSaveEnabled:true,urlResultSchemaEnabled:true});
 const login=api=>api.completeMagicLink('#access_token='+service.session()+'&token_type=bearer&expires_in=3600');
 const exported=async text=>{const review=createResultReview(producerReport());review.edit('description',text);for(const k of ['title','meta_description','description'])review.check(k,true);await review.confirm();return review.export();};
 const intent=payload=>({organization_id:ids.org,opportunity_id:randomUUID(),request_id:randomUUID(),expected_version:0,payload});
 const api=client();await login(api);
 await assert.rejects(api.saveUrlResult(intent(await exported('Not made of steel.')),{isCurrent:()=>true}),/宣稱/);
 const forged=await exported('Made of steel.');
 forged.snapshot.citations.find(c=>c.id===forged.facts.description.citations[0]).locator='p[1000000]';
 await assert.rejects(api.saveUrlResult(intent(forged),{isCurrent:()=>true}),/宣稱/);
 assert.equal(service.requests.filter(r=>r.method==='POST').length,0);
 const request=intent(await exported('Made of steel.'));
 const id=await api.saveUrlResult(request,{isCurrent:()=>true});await api.reconcileUrlResult(request,id);api.signOut();
 const fresh=client();await login(fresh);const dashboard=await fresh.dashboard();const row=await fresh.readContentVersion(dashboard.versions[0]);
 assert.equal(row.id,id);assert.equal(canonical(row.first_result_payload),canonical(request.payload));
 assert.equal(service.requests.filter(r=>r.method==='POST').length,1);
});


test('browser acceptance uses configured Preview pipeline including bridge and final file hashes',async t=>{
 const {mkdtemp,rm}=await import('node:fs/promises');
 const {buildPreviewAcceptance}=await import('../growth-console/persistence-integration.e2e.mjs');
 const evidence=await mkdtemp('/tmp/gos-preview-acceptance-');t.after(()=>rm(evidence,{recursive:true,force:true}));
 const directory=evidence+'/site',manifest=await buildPreviewAcceptance({directory,evidence});
 const save=await readFile(directory+'/url-result-save.mjs','utf8');
 assert.match(save,/await assertSavedClaims\(frozen\)/);assert.match(save,/accept\(stash.payload,stash.nonce,own\)/);
 assert.match(await readFile(directory+'/workspace.mjs','utf8'),/claim-guarded-workspace-api/);
 assert.match(await readFile(directory+'/url-result-config.mjs','utf8'),/urlReviewEnabled=false/);
 for(const [name,entry]of Object.entries(manifest.files))assert.equal(hash(await readFile(directory+'/'+name)),entry.output_sha256,name);
});
