import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,existsSync,chmodSync,symlinkSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {request} from 'node:http';
import {createConnection} from 'node:net';
import {join,resolve,dirname} from 'node:path';
import {createStore} from './store.mjs';
import {loadHostConfig} from './host.mjs';
import {productionTransports} from './runtime.mjs';
import {childHost} from './host-fixture-client.mjs';
const binding={pilot_id:'host-test',organization_id:'org',page_id:1001,target_url:'https://site.example/growth-os/'};
function fixture(t){const root=mkdtempSync('/tmp/growth-host-test-');const cleanup={};t.after(async()=>{await cleanup.close?.();rmSync(root,{recursive:true,force:true});});const storage_directory=root+'/store';createStore(storage_directory,binding);const config={enabled:true,gsc_measurement_enabled:true,evidence_environment:'isolated_fixture',binding,write_grant:null,read_grant:null,storage_directory,authority:{origin:'https://synthetic.supabase.co',key:'sb_publishable_synthetic',redirectOrigin:'http://127.0.0.1:8791'}};return {root,config,cleanup,site:{call(){throw Error('No WordPress call allowed');}},fetchImpl:async()=>({status:401,ok:false,json:async()=>({})})};}
const post=(h,input={version_id:'synthetic'})=>h.request('history',input,'synthetic-token');
test('runtime missing/closed/invalid config refuses without secrets or implicit store; output excludes fixtures',t=>{
 const f=fixture(t),runtime='prototype/wordpress-pilot/runtime.mjs';
 for(const args of [[],['prototype/wordpress-pilot/host.example.json'],[f.root+'/missing']]){const r=spawnSync(process.execPath,[runtime,...args],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stderr.trim(),'Single-site startup refused');}
 const path=f.root+'/config.json';writeFileSync(path,'{"enabled":true,"secret":"NEVER_PRINT"}',{mode:0o600});assert.throws(()=>loadHostConfig(path));chmodSync(path,0o644);assert.throws(()=>loadHostConfig(path),/Private/);const link=f.root+'/link';symlinkSync(path,link);assert.throws(()=>loadHostConfig(link),/Private/);
 const seen=new Set();function imports(p){p=resolve(p);if(seen.has(p))return;seen.add(p);assert.doesNotMatch(p,/fixture|\.test\.|driver/);const s=readFileSync(p,'utf8');assert.doesNotMatch(s,/synthetic-session-|createSessionRig|growth-os-isolated-host/);for(const m of s.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g))if(m[2].startsWith('.'))imports(resolve(dirname(p),m[2]));}imports(runtime);assert.ok(seen.size>5);
 assert.deepEqual(readdirSync(f.config.storage_directory),['journal.json']);
});
test('real child HTTP validates host/origin/method/path/body/auth; errors never expose authority detail',async t=>{
 const f=fixture(t);let calls=0;f.fetchImpl=async()=>{calls++;throw Error('NEVER_PRINT upstream secret');};const h=await childHost(f);f.cleanup.close=()=>h.close();const before=readFileSync(f.config.storage_directory+'/journal.json');
 for(const path of ['/health','/ready']){const r=await fetch(h.origin+path);assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'ready'});}
 for(const [path,options,status]of [['/ready?secret=x',{},404],['/api/wordpress-publication/history',{},405],['/api/wordpress-publication/history',{method:'POST'},401],['/api/wordpress-publication/history',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'text/plain'},body:'{}'},415],['/api/wordpress-publication/history',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:'x'.repeat(4097)},413],['/api/wordpress-publication/history',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:'{bad'},403],['/health',{headers:{origin:'https://foreign.example'}},403],['/api/wordpress-publication/restore?target=https://bad.example',{method:'POST'},404]]){const r=await fetch(h.origin+path,options);assert.equal(r.status,status,path);assert.doesNotMatch(await r.text(),/NEVER_PRINT|writer.lock|storage_directory/);}
 assert.equal(calls,0);const denied=await post(h);assert.equal(denied.status,403);assert.doesNotMatch(await denied.text(),/NEVER_PRINT/);assert.ok(calls>0);assert.deepEqual(readFileSync(f.config.storage_directory+'/journal.json'),before);
 const wrongHost=await new Promise((resolve,reject)=>{const r=request(h.origin+'/health',{headers:{host:'foreign.example'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});r.on('error',reject);r.end();});assert.equal(wrongHost,403);
 const duplicate=await new Promise((resolve,reject)=>{const r=request(h.origin+'/health',{headers:['Host',new URL(h.origin).host,'Origin','http://127.0.0.1:8791','Origin','http://127.0.0.1:8791']},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});r.on('error',reject);r.end();});assert.equal(duplicate,403);
});
test('SIGTERM drains active HTTP authority before unlock; second writer denied, new process opens same bytes',async t=>{
 const f=fixture(t);let started,release;const entered=new Promise(r=>started=r),gate=new Promise(r=>release=r);f.fetchImpl=async()=>{started();await gate;return {status:401,ok:false,json:async()=>({})};};const h=await childHost(f);t.after(()=>{if(h.child.exitCode===null)h.child.kill('SIGKILL');});const before=readFileSync(f.config.storage_directory+'/journal.json');await assert.rejects(childHost(f),/startup failed/);
 const pending=post(h);await entered;h.child.kill('SIGTERM');assert.equal(existsSync(f.config.storage_directory+'/writer.lock'),true);release();assert.equal((await pending).status,403);assert.equal((await h.exited).code,0);assert.equal(existsSync(f.config.storage_directory+'/writer.lock'),false);assert.deepEqual(readFileSync(f.config.storage_directory+'/journal.json'),before);
 const fresh=await childHost(f);assert.notEqual(fresh.pid,h.pid);await fresh.close();
});
test('bounded drain timeout and SIGKILL preserve crash locks and refuse reopening, never auto repair',async t=>{
 for(const kill of [false,true]){const f=fixture(t);let started;const entered=new Promise(r=>started=r);f.fetchImpl=async()=>{started();return new Promise(()=>{});};const h=await childHost({...f,shutdownMs:100});const before=readFileSync(f.config.storage_directory+'/journal.json');
  if(kill)await h.kill();else{const pending=post(h).catch(()=>null);await entered;h.child.kill('SIGTERM');assert.equal((await h.exited).code,1);await pending;}
  assert.equal(existsSync(f.config.storage_directory+'/writer.lock'),true);await assert.rejects(childHost(f),/startup failed/);assert.deepEqual(readFileSync(f.config.storage_directory+'/journal.json'),before);
 }
});
test('world-readable durable directory or journal never acquires writer lock',async t=>{
 const f=fixture(t);chmodSync(f.config.storage_directory,0o755);await assert.rejects(childHost(f));assert.equal(existsSync(f.config.storage_directory+'/writer.lock'),false);chmodSync(f.config.storage_directory,0o700);chmodSync(f.config.storage_directory+'/journal.json',0o644);await assert.rejects(childHost(f));assert.equal(existsSync(f.config.storage_directory+'/writer.lock'),false);
});

test('shutdown deadline includes a partially received HTTP header socket',async t=>{
 const f=fixture(t),h=await childHost({...f,shutdownMs:100});
 const socket=createConnection(new URL(h.origin).port,'127.0.0.1');socket.on('error',()=>{});await new Promise(r=>socket.once('connect',r));socket.write('POST /api/wordpress-publication/history HTTP/1.1\r\nHost: ');
 h.child.kill('SIGTERM');let timer;const result=await Promise.race([h.exited,new Promise(resolve=>{timer=setTimeout(()=>{h.child.kill('SIGKILL');resolve(null);},2000);})]);clearTimeout(timer);socket.destroy();assert.ok(result,'bounded shutdown must finish');assert.ok([0,1].includes(result.code));assert.equal(existsSync(f.config.storage_directory+'/writer.lock'),result.code!==0);
});

test('production transport uses only fixed HTTPS authority/site and bound private credentials, never request targets',async t=>{
 const f=fixture(t),file=f.root+'/credential.json';writeFileSync(file,JSON.stringify({binding,user:'publisher',password:'synthetic-password'}),{mode:0o600});
 const config={service:f.config,wordpress:{origin:'https://site.example',credential_file:file}},calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return new Response('{"id":1001}',{status:200});});
 const p=productionTransports(config);await p.site.call(p.site.path(1001),{method:'POST',headers:{'x-growth-before':'revision'},body:{title:'synthetic'}});assert.equal(calls[0].url,'https://site.example/?rest_route=/wp/v2/pages/1001&context=edit');assert.equal(calls[0].options.redirect,'error');assert.match(calls[0].options.headers.authorization,/^Basic /);
 await assert.rejects(p.site.call('https://foreign.example/'));await assert.rejects(p.site.call(p.site.path(1001),{headers:{authorization:'override'}}));await assert.rejects(p.fetchImpl('https://foreign.example/auth/v1/user'));await assert.rejects(p.fetchImpl(f.config.authority.origin+'/rest/v1/content_versions',{method:'POST'}));assert.equal(calls.length,1);
 await p.fetchImpl(f.config.authority.origin+'/auth/v1/user',{headers:{authorization:'Bearer synthetic'}});assert.equal(calls.at(-1).options.headers.authorization,'Bearer synthetic');assert.doesNotMatch(JSON.stringify(calls.at(-1)),/synthetic-password|Basic/);
 writeFileSync(file,JSON.stringify({binding:{...binding,page_id:1002},user:'publisher',password:'synthetic-password'}));assert.throws(()=>productionTransports(config),/binding/);
});
