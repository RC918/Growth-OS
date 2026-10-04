import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRcServer,validateConfig} from './server.mjs';
import {createRunJournal} from '../wordpress-publish/journal.mjs';
import {localBackend,startRuntime,readSecret} from './runtime.mjs';
import {schema} from './deploy/schema.mjs';
import {compose,root,prefix} from './deploy/compose.mjs';
import {ids,bootstrapSQL} from '../../supabase/drafts/first_result_save/fixtures.mjs';
import {PGlite} from '@electric-sql/pglite';
const config={listen_origin:'http://127.0.0.1:8792',backend_origin:'https://growth-internal-rc.supabase.co',public_key:'sb_publishable_rc',journal_path:'/tmp/unused',bound:{run:'rc-contract',journal_id:'j1',organization_id:ids.org,page_id:1001,target_url:'https://rc-source.example/bolt/',expires_at:Date.now()+60000}};
test('RC config/transport denies hosted fallback, nonloopback, expired grant and missing durable data',async()=>{
 for(const c of [{...config,listen_origin:'http://0.0.0.0:8792'},{...config,backend_origin:'https://vhzryhibmpvglzcmfnaa.supabase.co'},{...config,bound:{...config.bound,page_id:'1001'}}])assert.throws(()=>validateConfig(c));
 assert.throws(()=>localBackend({...config,auth_url:'https://vhzryhibmpvglzcmfnaa.supabase.co',rest_url:'http://127.0.0.1:8795'}));
 await assert.rejects(startRuntime({...config,source_mode:'owned-network-fixture',bound:{...config.bound,expires_at:0}}),/expired/);
 await assert.rejects(createRcServer({config}),/ENOENT/);
});
test('actual HTTP boundary + browser runtime route mapping; no admin/unknown RPC/foreign Origin/foreign page access',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'growth-rc-contract-'));t.after(()=>rm(dir,{recursive:true,force:true}));const c={...config,journal_path:dir+'/journal'};createRunJournal(c.journal_path,c.bound);
 let calls=0;const server=await createRcServer({config:c,site:{target:1001,targetURL:c.bound.target_url},upstreamFetch:async()=>{calls++;throw Error('Must not reach backend');},scan:async()=>{calls++;throw Error('Must not scan');}});t.after(()=>server.close());
 for(const path of ['/backend/auth/v1/admin/users','/backend/auth/v1/token','/backend/rest/v1/rpc/unknown'])assert.equal((await fetch(c.listen_origin+path,{method:'POST',body:'{}'})).status,403);
 assert.equal((await fetch(c.listen_origin+'/api/product-source',{method:'POST',headers:{origin:'https://foreign.example'},body:JSON.stringify({url:c.bound.target_url})})).status,403);
 assert.equal((await fetch(c.listen_origin+'/api/product-source',{method:'POST',body:JSON.stringify({url:'https://wrong.example/bolt/'})})).status,403);assert.equal(calls,0);
 const runtime=await(await fetch(c.listen_origin+'/workspace-runtime.mjs')).text();globalThis.location={origin:c.listen_origin};const original=globalThis.fetch;try{const seen=[];globalThis.fetch=(url)=>seen.push(String(url));const module=await import('data:text/javascript,'+encodeURIComponent(runtime));module.workspaceFetch(c.backend_origin+'/auth/v1/user',{});module.workspaceFetch(c.listen_origin+'/api/wordpress-publication/preview',{});assert.deepEqual(seen,['/backend/auth/v1/user',c.listen_origin+'/api/wordpress-publication/preview']);assert.throws(()=>module.workspaceFetch('https://outside.example/user',{}));}finally{globalThis.fetch=original;delete globalThis.location;}
 await writeFile(dir+'/world-secret','not-a-real-secret',{mode:0o644});await chmod(dir+'/world-secret',0o644);await assert.rejects(readSecret(dir+'/world-secret'),/owner-only/);
});
test('new isolated schema candidate retains native roles/RLS and exact Save/Review contracts; never inserts Auth users',async()=>{
 const sql=await schema();assert.equal(sql,await readFile(new URL('./deploy/schema.candidate.sql',import.meta.url),'utf8'));assert.ok(!sql.includes('insert into auth.users'));assert.ok(!sql.includes('create function auth.uid'));
 const db=await PGlite.create();try{await db.exec(bootstrapSQL+`insert into auth.users(id) values('${ids.owner}'),('${ids.viewer}'),('${ids.foreign}');`);await db.exec(sql.replace('create extension if not exists pgcrypto;',''));
  for(const actor of ['owner','viewer','foreign']){await db.exec('begin;set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[actor]]);const rows=(await db.query('select id from organizations where id=$1',[ids.org])).rows;assert.equal(rows.length,actor==='foreign'?0:1);await db.exec('rollback');}
  assert.equal((await db.query('select count(*)::int n from content_versions')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from content_reviews')).rows[0].n,0);
 }finally{await db.close();}
});
test('deployment candidate uses fixed own bind storage, pinned images and loopback ports; not started',async()=>{
 const c=await compose();assert.equal(c.name,prefix);for(const s of Object.values(c.services)){assert.match(s.image,/@sha256:[a-f0-9]{64}$/);assert.equal(s.labels['growth.rc'],prefix);for(const p of s.ports??[])assert.ok(p.startsWith('127.0.0.1:'));for(const v of s.volumes??[])assert.ok(v.startsWith(root+'/'));}
 const source=await readFile(new URL('../public-audit/scanner.py',import.meta.url),'utf8');assert.ok(!source.includes('rc-source.example'));const setup=await readFile(new URL('./deploy/wordpress-setup.php',import.meta.url),'utf8');assert.ok(setup.includes('time()+900'));
});
test('frozen RC candidate bytes match the reviewable deployment manifest',async()=>{
 const {createHash}=await import('node:crypto');const hashes=JSON.parse(await readFile(new URL('./deploy/hashes.json',import.meta.url),'utf8'));
 for(const [path,sha]of Object.entries(hashes))assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),sha,path);
});
