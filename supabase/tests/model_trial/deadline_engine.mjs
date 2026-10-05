// Full synthetic schema in offline PG18.3 WASM; native concurrency is separate.
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const db=await PGlite.create(),actor='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222';
const migration='20261001120704_growth_model_trial_bounded_deadline.sql';
const directory=new URL('../../migrations/',import.meta.url);
const template=await readFile(new URL('activate.sql.template',import.meta.url),'utf8');
const cap="TIMESTAMPTZ '2026-10-07T11:50:00Z'";
function activation(cutoff){
 assert.ok(template.includes(cap));
 let sql=template.replace(cap,cutoff); // Offline copy, never edits production cap.
 for(const [k,v] of Object.entries({__READY_POLICY__:'gpt41mini-20250414-v2-postusage',__RUNTIME_REVIEWED__:'confirmed',__ACTOR_UUID__:actor,__ORG_UUID__:org}))sql=sql.replaceAll(k,v);
 return sql;
}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function invariants(){
 const tables=(await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
 const business=[];
 for(const {tablename} of tables){assert.match(tablename,/^[a-z_]+$/);business.push([tablename,digest((await db.query(`select to_jsonb(t) as row from public."${tablename}" t order by to_jsonb(t)::text`)).rows)]);}
 return {business,
  tables:(await db.query("select n.nspname,c.relname,c.relrowsecurity,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','private') order by 1,2")).rows,
  functions:(await db.query("select n.nspname,p.proname,p.proowner,p.proacl::text,p.proconfig,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1,2,p.oid")).rows,
  policies:(await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows,
  defaults:(await db.query('select * from pg_default_acl order by oid')).rows,
  roles:(await db.query('select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls from pg_roles order by rolname')).rows,
  money:(await db.query('select calls_reserved,spent_nusd::text,held_nusd::text,active_request from private.model_trial')).rows,
  attempts:(await db.query('select * from private.model_trial_attempts order by request_id')).rows};
}
let groups=0;const pass=name=>{groups++;console.log('PASS DEADLINE '+name);};
try{
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const file of (await readdir(directory)).filter(x=>x.endsWith('.sql')&&x<migration).sort())await db.exec((await readFile(new URL(file,directory),'utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec(`insert into auth.users values('${actor}');insert into public.organizations(id,name,business_model) values('${org}','Synthetic deadline fixture','trade');insert into public.organization_members values('${org}','${actor}','owner');`);
 const before=await invariants();assert.equal(before.business.length,20);
 const patch=await readFile(new URL(migration,directory),'utf8');
 await db.exec(patch);assert.deepEqual(await invariants(),before);pass('constraint-only migration preserves all20 business hashes, counters, RPC definitions/ACL, RLS, roles/defaults/policies');
 const valid=async(end,state='active')=>{
  await db.exec('begin');try{await db.exec(`update private.model_trial set actor_user_id='${actor}',organization_id='${org}',state='${state}',starts_at=statement_timestamp(),deadline=${end};`);}finally{await db.exec('rollback');}
 };
 await valid("statement_timestamp()+interval '4 minutes'");await valid("statement_timestamp()+interval '7 days'");
 await valid("statement_timestamp()+interval '1 day'",'paused');await valid("statement_timestamp()+interval '1 day'",'closed');pass('short positive, exactly7days, paused/closed windows allowed');
 for(const end of ['NULL',"statement_timestamp()", "statement_timestamp()-interval '1 second'", "statement_timestamp()+interval '7 days 1 second'"]){await assert.rejects(()=>valid(end),e=>e.code==='23514');}
 for(const assignments of ["state='active',starts_at=NULL,deadline=NULL", "state='active',starts_at=NULL,deadline=statement_timestamp()", "state='staged',starts_at=statement_timestamp(),deadline=statement_timestamp()+interval '1 day'", "state='staged',starts_at=NULL,deadline=statement_timestamp()", "state='active',starts_at=statement_timestamp(),deadline=statement_timestamp()+interval '1 day',actor_user_id=NULL", "state='active',starts_at=statement_timestamp(),deadline=statement_timestamp()+interval '1 day',organization_id=NULL"]){await assert.rejects(()=>db.exec('update private.model_trial set '+assignments),e=>e.code==='23514');}
 pass('NULL/zero/negative/>7days and inconsistent state/actor/org rejected; CHECK UNKNOWN cannot pass');
 for(const cutoff of ["clock_timestamp()-interval '1 minute'","clock_timestamp()+interval '2 minutes'","ready_at+interval '3 minutes'"]){await assert.rejects(()=>db.exec(activation(cutoff)),e=>e.message.includes('Insufficient trial window'));await db.exec('rollback');assert.deepEqual(await invariants(),before);}
 pass('expired or <=3minute cutoff rejects atomically without consuming budget/time');
 await db.exec('begin;alter table private.model_trial rename constraint model_trial_check1 to unexpected_deadline;commit;');
 await assert.rejects(()=>db.exec(patch),e=>e.message.includes('Original trial deadline constraint differs'));await db.exec('rollback');
 await db.exec('alter table private.model_trial rename constraint unexpected_deadline to model_trial_check1');
 pass('unexpected existing constraint refuses narrow migration, no permissive fallback');
 await db.exec(activation("clock_timestamp()+interval '4 minutes'"));
 const clock=(await db.query('select starts_at,deadline from private.model_trial')).rows[0];
 assert.ok(new Date(clock.deadline)-new Date(clock.starts_at)>3*60000);assert.ok(new Date(clock.deadline)-new Date(clock.starts_at)<4*60000+1000);
 await assert.rejects(()=>db.exec(activation("clock_timestamp()+interval '6 days'")),e=>e.message.includes('Staging state differs'));await db.exec('rollback');
 assert.deepEqual((await db.query('select starts_at,deadline from private.model_trial')).rows[0],clock);assert.deepEqual(await invariants(),before);
 pass('shortened activation stores real clock; repeat cannot refresh/extend; business/accounting/security unchanged');
 console.log(`PASS ${groups} deadline groups;20 business tables; offline cutoff substitutions only`);
}finally{await db.close();}
