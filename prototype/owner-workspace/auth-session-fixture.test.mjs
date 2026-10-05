import test from 'node:test';
import assert from 'node:assert/strict';
import {Server} from 'node:net';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {createWorkspaceApi} from '../../apps/web/workspace-api.mjs';
import {createSessionRig,createAuthTransport,mode,target,backend,redact} from './auth-session-fixture.mjs';
const options={mode,target};
test('independent negative gates: non-test, unapproved target, missing/forged isolation reject before listen/network/DB',async()=>{
 let effects=0;const oldListen=Server.prototype.listen,oldCreate=PGlite.create,oldFetch=globalThis.fetch,oldEnv=process.env.NODE_ENV;
 Server.prototype.listen=()=>{effects++;throw Error('listen forbidden');};PGlite.create=()=>{effects++;throw Error('DB forbidden');};globalThis.fetch=()=>{effects++;throw Error('network forbidden');};process.env.NODE_ENV='test';
 try{
  for(const input of [{},{target},{mode:'production',target},{mode,target:'https://vhzryhibmpvglzcmfnaa.supabase.co'},{mode,target:'https://staging.example.invalid'},{mode,target:'http://127.0.0.1:8792'}])await assert.rejects(createSessionRig(input),/mode and exact runner target/);
  for(const input of [options,{...options,isolation:{}},{...options,isolation:{server:{listening:true},db:{}}}])assert.throws(()=>createAuthTransport(input),/identity required/);
  assert.equal(effects,0);
 }finally{Server.prototype.listen=oldListen;PGlite.create=oldCreate;globalThis.fetch=oldFetch;if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;}
});
test('per-run fixed mapping, short expiry, unknown token and OTP rejection; no SQL/network fallback',async()=>{
 let rig,transport,oldToken;
 try{
  rig=await createSessionRig(options);transport=createAuthTransport({...options,isolation:rig.isolation});oldToken=rig.issue('owner');
  const before=await rig.snapshot(),count=rig.stats().sqlCalls;
  assert.throws(()=>rig.issue('administrator'));assert.throws(()=>rig.issue('owner',{ttlMs:120001}));
  assert.throws(()=>createAuthTransport({...options,isolation:{...rig.isolation}}));
  assert.equal((await transport({url:backend+'/auth/v1/user',headers:{authorization:'Bearer invented-fixture-token'}})).status,401);
  const expired=rig.issue('viewer',{ttlMs:1});await new Promise(r=>setTimeout(r,5));assert.equal((await transport({url:backend+'/auth/v1/user',headers:{authorization:'Bearer '+expired}})).status,401);
  const headers={authorization:'Bearer '+oldToken};assert.equal((await transport({url:backend+'/auth/v1/user',headers})).status,200);
  assert.equal((await transport({url:backend+'/auth/v1/otp',method:'POST',headers,body:{email:'synthetic@example.invalid'}})).status,403);
  assert.equal((await transport({url:backend+'/rest/v1/rpc/save_url_result_draft',method:'POST',headers:{authorization:'Bearer '+expired},body:{}})).status,401);
  const fetch=globalThis.fetch;let attempts=0;globalThis.fetch=()=>{attempts++;throw Error('network forbidden');};
  try{await assert.rejects(transport({url:'https://production.invalid/auth/v1/otp',method:'POST',headers}),/Unapproved/);assert.equal(attempts,0);}finally{globalThis.fetch=fetch;}
  assert.equal(rig.stats().sqlCalls,count);assert.deepEqual(await rig.snapshot(),before);
  await rig.close();await assert.rejects(transport({url:backend+'/auth/v1/user',headers}),/identity required/);
  rig=await createSessionRig(options);transport=createAuthTransport({...options,isolation:rig.isolation});assert.equal((await transport({url:backend+'/auth/v1/user',headers})).status,401,'previous run token has no authority');
  assert.ok(!redact(new Error('#access_token='+oldToken+'&token_type=bearer Bearer '+oldToken)).includes(oldToken));
 }finally{if(rig)await rig.close();}
});
test('unmodified product client without fixture rejects fake callback when Auth denies; no membership/session/mutation',async()=>{
 const calls=[],api=createWorkspaceApi({origin:backend,key:'sb_publishable_test',redirectOrigin:'https://offline.invalid',fetchImpl:async(url,options)=>{calls.push({path:new URL(url).pathname,method:options.method});return {ok:false,status:401,json:async()=>({})};}});
 await assert.rejects(api.completeMagicLink('#access_token=not-a-real-token&token_type=bearer&expires_in=60'),/401/);assert.equal(api.context(),null);assert.deepEqual(calls,[{path:'/auth/v1/user',method:'GET'}]);await assert.rejects(api.dashboard());assert.equal(calls.length,1);
});
test('deployment output/import closure excludes test-only fixture and bypass entry',async()=>{
 const config=JSON.parse(await readFile('vercel.json','utf8'));assert.equal(config.outputDirectory,'apps/web');
 const paths=[];async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+item.name;if(item.isDirectory())await walk(p);else paths.push(p);}}
 await walk(config.outputDirectory);await walk('api');
 for(const path of paths){
  assert.doesNotMatch(path,/auth-session|fixture|\.test\.|\.e2e\./);
  const text=await readFile(path,'utf8');assert.doesNotMatch(text,/createSessionRig|createAuthTransport|synthetic-session-|growth-os-isolated-regression/);
  if(path.endsWith('.mjs'))for(const match of text.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)){if(match[2].startsWith('.'))assert.ok(resolve(path,'..',match[2]).startsWith(resolve(config.outputDirectory)+'/'),'deployed JS imports only deployed directory');}
 }
 assert.equal(config.functions['api/product-source.py'].includeFiles,'prototype/public-audit/{scanner,product_source,product_api}.py');
 for(const p of ['scanner','product_source','product_api'])assert.doesNotMatch(await readFile('prototype/public-audit/'+p+'.py','utf8'),/auth-session|createSessionRig|synthetic-session-/);
 const workflow=await readFile('.github/workflows/python-tests.yml','utf8'),entry=await readFile('prototype/owner-workspace/auth-session-regression.e2e.mjs','utf8');
 const command='node prototype/owner-workspace/auth-session-regression.e2e.mjs --mode growth-os-isolated-regression --target http://127.0.0.1:8791';assert.equal(workflow.split(command).length,3);for(const mode of ['--wordpress','--pilot'])assert.equal(workflow.split(command+' '+mode).length,2);assert.ok(workflow.indexOf(command)>workflow.indexOf('python3 -B supabase/tests/model_trial/native_ledger.py'));assert.ok(workflow.indexOf(command)>workflow.indexOf('npx playwright install --with-deps chromium'));assert.ok(entry.includes("run(['supabase/drafts/url_result/native.mjs'])"),'existing native suite is included, not skipped');
 const client=await readFile('apps/web/workspace-api.mjs','utf8');assert.match(client,/await request\('\/auth\/v1\/user'\)/);assert.match(client,/await select\('organization_members'/);
});
