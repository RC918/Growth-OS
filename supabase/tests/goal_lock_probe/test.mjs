// New probe boundary tests only. PGlite is not remote Auth or concurrent backends.
import {PGlite} from '@electric-sql/pglite';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {renderProbe} from './render.mjs';
const db=await PGlite.create();const checks=[];
const org='93a88055-0a0b-40c0-b22f-a6d312320001',other='93a88055-0a0b-40c0-b22f-a6d312320002';
const owner='e85f1a90-3565-4fc1-a7e0-3b7d08830d0e',foreign='00000000-0000-4000-a000-000000000002';
const goal='5055ca31-40cc-435d-9f52-cdf19166440c';
const pass=message=>{checks.push(message);console.log('PASS local probe: '+message);};
const denied=async(sql,code='42501')=>assert.rejects(()=>db.exec(sql),error=>error.code===code);
const execAsProbe=()=>db.exec('set session authorization growth_os_probe_login');
const originalSession=(await db.query('select session_user name')).rows[0].name;
assert.match(originalSession,/^[a-z_]+$/);
const admin=()=>db.exec(`set session authorization ${originalSession}; reset role`);
const template=await readFile(new URL('create.sql.template',import.meta.url),'utf8');
const start=new Date(Date.now()-60000).toISOString();
try {
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
 (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 alter default privileges in schema public grant all on tables to anon,authenticated;`);
 for(const name of ['202609280001_initial.sql','202609280002_tenant_rls.sql',
 '20260930112010_growth_goal_intake.sql','20260930140406_growth_goal_conflict_http.sql'])
  await db.exec((await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8'))
   .replace('create extension if not exists pgcrypto;',''));
 await db.exec(`insert into auth.users values('${owner}'),('${foreign}');
 insert into public.organizations(id,name,business_model) values('${org}','Probe A','ecommerce'),('${other}','Probe B','trade');
 insert into public.organization_members values('${org}','${owner}','owner'),('${other}','${foreign}','owner');
 insert into public.growth_goals values('${goal}','${org}','${owner}',now());
 insert into public.growth_goal_turns(organization_id,goal_id,actor_user_id,request_id,version_number,question_key,question_text,answer_text)
 select '${org}','${goal}','${owner}',gen_random_uuid(),n,
 (array['goal','offering','audience','market','channel','asset','metric','confirm','audience','confirm','audience','audience','audience'])[n],
 'synthetic seed','synthetic seed '||n from generate_series(1,13)n;`);
 const baseline=(await db.query('select * from public.growth_goal_turns order by version_number')).rows;
 await db.exec(renderProbe(template,start));
 const attrs=(await db.query("select rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolconnlimit from pg_roles where rolname like 'growth_os_probe_%' order by rolname")).rows;
 assert.equal(attrs.length,2);for(const r of attrs)for(const k of ['rolcanlogin','rolinherit','rolsuper','rolbypassrls','rolcreatedb','rolcreaterole','rolreplication'])assert.equal(r[k],false);
 assert.equal(attrs.find(r=>r.rolname==='growth_os_probe_login').rolconnlimit,3);
 assert.equal((await db.query("select count(*)::int n from pg_auth_members m join pg_roles r on m.member=r.oid where r.rolname like 'growth_os_probe_%'")).rows[0].n,0);
 assert.equal((await db.query('select starts_at,deadline from growth_os_probe.activation_window')).rows[0].starts_at,null);
 await execAsProbe();await denied('select growth_os_probe.append_fixture_turn()');await denied('select * from growth_os_probe.activation_window');await admin();
 pass('NOLOGIN preparation has no active window; probe and config access denied');
 pass('role catalogs report restricted attributes, no memberships, NOLOGIN staging');
 await denied('select growth_os_probe.append_fixture_turn()');
 await db.exec('create role unrelated_probe_test nologin;set role unrelated_probe_test');
 await denied('select growth_os_probe.append_fixture_turn()');await admin();
 await db.exec('set role anon');await denied('select growth_os_probe.append_fixture_turn()');await admin();
 await db.exec('set role authenticated');await denied('select growth_os_probe.append_fixture_turn()');await admin();
 await db.exec('set role service_role');await denied('select growth_os_probe.append_fixture_turn()');await admin();
 pass('PUBLIC, anon, authenticated and service role have no probe execution path');
 await execAsProbe();
 await denied('set role growth_os_probe_owner');await denied('set role authenticated');await denied('set role service_role');
 await denied(`select public.save_goal_turn('${other}','${goal}',gen_random_uuid(),13,'audience','forged')`);
 await denied(`select private.save_goal_turn_impl('${other}','${goal}',gen_random_uuid(),13,'audience','forged')`);
 await denied('select * from public.growth_goal_turns');
 await denied(`update public.growth_goal_turns set answer_text='forged'`);
 await denied('alter function growth_os_probe.append_fixture_turn() rename to hijacked');
 await denied('create function growth_os_probe.evil() returns int language sql as $$select 1$$');
 await denied('select growth_os_probe.append_fixture_turn(null::uuid)','42883');
 pass('simulated session authorization denies SET ROLE, original RPCs, direct tables, DDL and arbitrary arguments');
 await admin();await db.exec(renderProbe(await readFile(new URL('activate.sql.template',import.meta.url),'utf8'),start));
 await execAsProbe();
 await db.exec(`begin;select set_config('request.jwt.claim.sub','${foreign}',true);
 select set_config('request.jwt.claims','{"sub":"${foreign}","role":"service_role"}',true);`);
 const saved=(await db.query('select growth_os_probe.append_fixture_turn() result')).rows[0].result;
 assert.equal(saved.goal_id,goal);assert.equal(saved.version_number,14);
 const claims=(await db.query("select current_setting('request.jwt.claim.sub') sub,current_setting('request.jwt.claims')::jsonb claims")).rows[0];
 assert.equal(claims.sub,owner);assert.equal(claims.claims.sub,owner);assert.equal(claims.claims.role,'authenticated');
 await db.exec('rollback');await admin();
 assert.deepEqual((await db.query('select * from public.growth_goal_turns order by version_number')).rows,baseline);
 assert.equal((await db.query('select count(*)::int n from public.audit_events')).rows[0].n,0);
 pass('forged legacy and JSON claims both replaced; fixed fixture append rolls back with audit');
 await execAsProbe();await db.exec('begin;select growth_os_probe.append_fixture_turn();commit');
 await denied('select growth_os_probe.append_fixture_turn()','PT409');await admin();
 const rows=(await db.query('select * from public.growth_goal_turns order by version_number')).rows;
 assert.deepEqual(rows.slice(0,13),baseline);assert.equal(rows.length,14);assert.equal(rows[13].organization_id,org);assert.equal(rows[13].actor_user_id,owner);
 assert.equal((await db.query('select count(*)::int n from public.audit_events')).rows[0].n,1);
 assert.equal((await db.query(`select count(*)::int n from public.growth_goal_turns where organization_id='${other}'`)).rows[0].n,0);
 pass('one fixed synthetic commit allowed, original 13 unchanged, next call PT409, foreign tenant untouched');
 await db.exec("update growth_os_probe.activation_window set starts_at=now()-interval '3 hours',deadline=now()-interval '1 hour'");
 await execAsProbe();await denied('select growth_os_probe.append_fixture_turn()');await admin();
 await db.exec("update growth_os_probe.activation_window set starts_at=now()+interval '1 hour',deadline=now()+interval '3 hours'");
 await execAsProbe();await denied('select growth_os_probe.append_fixture_turn()');await admin();
 pass('past hard deadline and future not-before window both denied before RPC');
 await denied(renderProbe(await readFile(new URL('activate.sql.template',import.meta.url),'utf8'),start),'P0001');
 await db.exec('rollback');
 assert.equal((await db.query("select rolcanlogin from pg_roles where rolname='growth_os_probe_login'")).rows[0].rolcanlogin,true);
 await db.exec(await readFile(new URL('cleanup.sql',import.meta.url),'utf8'));
 assert.equal((await db.query("select count(*)::int n from pg_roles where rolname like 'growth_os_probe_%'")).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from pg_namespace where nspname='growth_os_probe'")).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from public.growth_goal_turns')).rows[0].n,14);
 pass('activation catalog and exact non-cascade cleanup remove probe objects only');
 assert.throws(()=>renderProbe(template,'tomorrow'));
 assert.throws(()=>renderProbe(template,'2026-02-30T00:00:00Z'));
 assert.throws(()=>renderProbe(template,"2026-10-01';select 1;--"));
 assert.equal(renderProbe(template,start).includes('__PROBE_'),false);
 pass('renderer requires explicit ISO UTC start and renders fixed two-hour window');
 if(process.argv[2])await writeFile(process.argv[2],JSON.stringify({completed:true,checks,
  limitations:['PGlite session_user uses SET SESSION AUTHORIZATION simulation, not real password LOGIN',
   'role/expiry/connection-limit catalog values do not prove network enforcement',
   'no independent backends, no lock overlap or session pooler assertion',
   'no remote objects, credentials or data modified'],syntheticCommitCount:1},null,2));
 console.log('PASS '+checks.length+' NEW LOCAL probe groups; remote approval and independent sessions still pending');
}catch(error){console.error('FAIL local probe:',error.code||error.name,error.message);process.exitCode=1;
}finally{await db.close();}
