import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {bootstrapDatabase} from './bootstrap.mjs';
import {compose,root,prefix} from './compose.mjs';
const sql=await readFile(new URL('./roles.sql',import.meta.url),'utf8');
test('bootstrap waits for final server and submits roles once before Auth; expiry/failure never starts dependents',async()=>{
 const calls=[];let probes=0;
 const docker=(args,input)=>{calls.push({args,input});if(args.includes('pg_isready')&&probes++===0)throw Error('not ready');};
 await bootstrapDatabase({docker,checkWindow(){},pause:async()=>{},root,prefix,sql});
 assert.equal(calls[0].args.at(-1),'db');assert.equal(calls.filter(c=>c.input).length,1);
 const mutation=calls.find(c=>c.input);assert.equal(mutation.input,sql);assert.ok(mutation.args.includes('postgres'));assert.ok(mutation.args.includes('-i'));
 assert.equal(calls.at(-1).args.at(-1),'-d');
 for(const cause of ['expired','mutation failure']){
  const seen=[];await assert.rejects(bootstrapDatabase({root,prefix,sql,pause:async()=>{},checkWindow(){if(cause==='expired')throw Error(cause);},docker(args,input){seen.push({args,input});if(input)throw Error(cause);}}),new RegExp(cause));
  assert.equal(seen.filter(c=>c.input).length,cause==='expired'?0:1);assert.ok(!seen.some(c=>c.args[0]==='compose'&&c.args.at(-1)==='-d'));
 }
});
test('only data directories are mounted; env files remain host-only and SQL has no substituted secret',async()=>{
 const c=await compose();
 for(const s of Object.values(c.services)){
  for(const v of s.volumes??[])assert.ok(v.startsWith(root+'/data/'));
  for(const e of s.env_file??[])assert.ok(e.startsWith(root+'/secrets/'));
 }
 assert.match(sql,/\\getenv password POSTGRES_PASSWORD/);assert.match(sql,/log_min_error_statement = 'panic'/);
 const operator=await readFile(new URL('./operator.mjs',import.meta.url),'utf8');assert.ok(!operator.includes("write('roles.sql'"));assert.match(operator,/mode:0o600,flag:'wx'/);
});
test('pinned native postgres reads stdin as UID999; private bind remains unreadable; atomic SQL and logs do not expose fixture value',async()=>{
 // Public, deterministic test sentinel, NOT a generated credential. No network/ports/persistent DB.
 const sentinel='PUBLIC_RC_BOOTSTRAP_FIXTURE_NOT_A_SECRET';
 const image=(await compose()).services.db.image,name='growth-rc-bootstrap-fixture-'+process.pid;
 const dir=await mkdtemp(join(tmpdir(),'growth-rc-bootstrap-'));
 const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000});
 let started=false;
 try{
  await writeFile(dir+'/private.sql',sql,{mode:0o600});
  const uid=docker(['run','-i','--rm','--pull=never','--network','none','--read-only','--user','postgres','--entrypoint','sh','--mount','type=bind,src='+dir+'/private.sql,dst=/private.sql,readonly',image,'-c','set -e; id -u; test ! -r /private.sql; cat'],sql);
  assert.equal(uid,'999\n'+sql);assert.equal((await stat(dir+'/private.sql')).mode&0o777,0o600);
  docker(['run','-d','--rm','--pull=never','--name',name,'--label','growth.rc.fixture=bootstrap','--network','none','--tmpfs','/var/lib/postgresql/data','--tmpfs','/var/run/postgresql','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_PASSWORD='+sentinel,image]);started=true;
  let ready=false;for(let i=0;i<80;i++){try{docker(['exec','--user','postgres',name,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}
  assert.ok(ready);
  const args=['exec','-i','--user','postgres',name,'psql','-X','-q','-w','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
  const output=docker(args,sql);assert.ok(!output.includes(sentinel));
  const result=docker([...args,'-At'],"select count(*) from pg_roles where rolname in ('anon','authenticated','service_role','authenticator','supabase_auth_admin'); select count(*) from pg_authid where rolname in ('authenticator','supabase_auth_admin') and rolpassword like 'SCRAM-SHA-256$%'; select auth.uid() is null;");
  assert.equal(result.trim(),'5\n2\nt');
  // Error after a password-bearing statement must roll back and must not print expanded SQL.
  const failureSQL=sql.replace('create role anon nologin;','create role rollback_probe nologin;').replace('create role authenticated nologin;','').replace('create role service_role nologin;','');
  let failed=false;try{docker(args,failureSQL);}catch(e){failed=true;assert.ok(!String(e.stdout).includes(sentinel));assert.ok(!String(e.stderr).includes(sentinel));}assert.ok(failed);
  assert.equal(docker([...args,'-At'],"select count(*) from pg_roles where rolname='rollback_probe';").trim(),'0');
  const logs=spawnSync('docker',['logs',name],{encoding:'utf8'});assert.equal(logs.status,0);assert.ok(!(logs.stdout+logs.stderr).includes(sentinel));
 }finally{if(started)docker(['stop','-t','1',name]);await rm(dir,{recursive:true});}
});
