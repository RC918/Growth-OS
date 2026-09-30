// Local PostgreSQL WASM engine, synthetic auth.uid() claims. Not live Supabase Auth.
import {PGlite} from '@electric-sql/pglite';
import {readdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const db=await PGlite.create();let checks=0;
const pass=message=>{checks++;console.log('PASS '+message);};
const orgA=randomUUID(),orgB=randomUUID(),owner=randomUUID(),viewer=randomUUID(),foreign=randomUUID(),goal=randomUUID();
async function auth(user,role='authenticated') {await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec(`set role ${role}`);}
const write=(version,key,answer,request=randomUUID(),organization=orgA,id=goal)=>db.query('select public.save_goal_turn($1,$2,$3,$4,$5,$6) as result',[organization,id,request,version,key,answer]);
const denied=async(operation,code)=>assert.rejects(operation,error=>error.code===code);
try {
 await db.exec(`create role anon nologin;create role authenticated nologin;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 alter default privileges in schema public grant all on tables to anon,authenticated;`);
 const directory=new URL('../migrations/',import.meta.url);
 for(const file of (await readdir(directory)).filter(name=>name.endsWith('.sql')).sort()) {
  // pgcrypto installation is excluded: native UUID generation is PostgreSQL built-in.
  // No cryptographic operations or extension behavior are asserted by this harness.
  const sql=(await readFile(new URL(file,directory),'utf8')).replace('create extension if not exists pgcrypto;','');
  await db.exec(sql);
 }
 pass('all migrations compile against PostgreSQL engine (pgcrypto installation excluded)');
 await db.query('insert into auth.users(id) values ($1),($2),($3)',[owner,viewer,foreign]);
 await db.query("insert into public.organizations(id,name,business_model) values ($1,'Synthetic M1 A','ecommerce'),($2,'Synthetic M1 B','trade')",[orgA,orgB]);
 await db.query("insert into public.organization_members(organization_id,user_id,role) values ($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')",[orgA,owner,viewer,orgB,foreign]);
 await auth(owner);const request=randomUUID();const saved=await write(0,'goal','讓海外买家找到產品',request);await write(0,'goal','讓海外买家找到產品',request);
 assert.equal(saved.rows[0].result.goal_id,goal);assert.equal((await db.query('select count(*)::integer as n from public.growth_goal_turns')).rows[0].n,1);
 await denied(()=>write(0,'goal','different',request),'22023');pass('lost-response retries append once and changed retry payload is refused');
 await denied(()=>write(1,'confirm','確認'),'22023');await denied(()=>write(1,'market','歐洲'),'22023');await denied(()=>write(1,'offering',' '.repeat(10)),'22023');await denied(()=>write(1,'offering','a'.repeat(2001)),'22023');
 await denied(()=>write(1,null,'產品'),'22023');await denied(()=>write(1,'offering',null),'22023');pass('incomplete confirmation, out-of-order and invalid input are rejected');
 let version=1;
 for(const [key,answer] of Object.entries({offering:'零件',audience:'採購人員',market:'歐洲／英語',channel:'自然搜尋',asset:'尚無連結',metric:'四週搜尋點擊'})) {await write(version,key,answer);version++;}
 await write(version,'confirm','確認');version++;
 await denied(()=>write(version-1,'audience','stale'),'40001');await write(version,'audience','英國採購人員');version++;await write(version,'confirm','確認');version++;
 const history=(await db.query('select question_key,answer_text from public.growth_goal_turns order by version_number')).rows;
 assert.equal(history[2].answer_text,'採購人員');assert.equal(history.at(-2).answer_text,'英國採購人員');pass('immutable revisions, no-site intake and optimistic version conflict');
 for(const operation of ["insert into public.growth_goals(id,organization_id,actor_user_id) values(gen_random_uuid(),'"+orgA+"','"+owner+"')","update public.growth_goal_turns set answer_text='tamper'","delete from public.growth_goal_turns"])
  await denied(()=>db.exec(operation),'42501');pass('direct client insert, update and delete denied');
 await auth(viewer);assert.equal((await db.query('select count(*)::integer as n from public.growth_goal_turns')).rows[0].n,version);
 await denied(()=>write(version,'audience','viewer mutation'),'42501');pass('same-org viewer can read but cannot append');
 await auth(foreign);assert.equal((await db.query('select count(*)::integer as n from public.growth_goal_turns')).rows[0].n,0);
 await denied(()=>write(version,'audience','foreign mutation'),'42501');await denied(()=>write(1,'offering','foreign goal',randomUUID(),orgB),'42501');pass('cross-tenant reads and writes denied, including forged goal relation');
 await auth(null,'anon');await denied(()=>db.query('select * from public.growth_goals'),'42501');await denied(()=>write(0,'goal','anonymous'),'42501');pass('anonymous table reads and RPC execution denied');
 await db.exec('reset role');await db.query('delete from public.organization_members where organization_id=$1 and user_id=$2',[orgA,owner]);await auth(owner);
 await denied(()=>write(0,'goal','讓海外买家找到產品',request),'42501');assert.equal((await db.query('select count(*)::integer as n from public.growth_goals')).rows[0].n,0);pass('membership revocation denies reads and replay of a previously valid request');
 console.log(`PASS ${checks} local PostgreSQL groups; remote deployment/Auth and concurrent sessions not verified`);
}finally{await db.close();}
