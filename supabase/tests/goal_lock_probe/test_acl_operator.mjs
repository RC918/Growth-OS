// NEW LOCAL PostgreSQL 18.3 WASM model, not a native PG17/Supabase proof.
import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const original=await readFile(new URL('reconcile_acl.sql',import.meta.url),'utf8');
const cleanup=await readFile(new URL('cleanup.sql',import.meta.url),'utf8');
const snapshot=async db=>(await db.query(`select
 (select jsonb_agg(to_jsonb(m) order by m.oid) from pg_auth_members m where m.roleid in
 ('growth_os_probe_owner'::regrole,'growth_os_probe_login'::regrole) or m.member in
 ('growth_os_probe_owner'::regrole,'growth_os_probe_login'::regrole)) members,
 (select to_jsonb(p) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='growth_os_probe' and p.proname='append_fixture_turn') function,
 (select jsonb_agg(jsonb_build_array(rolname,rolcanlogin,rolinherit,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil) order by rolname)
 from pg_roles where rolname in ('growth_os_probe_owner','growth_os_probe_login')) roles,
 (select jsonb_agg(to_jsonb(w)) from growth_os_probe.activation_window w) window_state`)).rows[0];
const adapt=sql=>sql.replaceAll("'postgres'","'probe_operator'")
 .replaceAll('TO postgres ','TO probe_operator ').replaceAll('FROM postgres ','FROM probe_operator ')
 .replaceAll('GRANTED BY postgres','GRANTED BY probe_operator').replaceAll("'supabase_admin'","'postgres'");
try {
for(const mode of ['success','injected','oid_drift','acl_drift','member_drift','owner_drift']) {
 const db=await PGlite.create();
 try {
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
   create role probe_operator nologin nosuperuser createrole;
   grant create on database postgres to probe_operator;
   set session authorization probe_operator;
   create role growth_os_probe_owner nologin noinherit nosuperuser nocreaterole nocreatedb nobypassrls noreplication;
   create role growth_os_probe_login nologin noinherit nosuperuser nocreaterole nocreatedb nobypassrls noreplication
   connection limit 3 valid until '1970-01-01 00:00:00+00';
   create schema growth_os_probe;
   revoke all on schema growth_os_probe from public;
   grant usage,create on schema growth_os_probe to growth_os_probe_owner;
   grant usage on schema growth_os_probe to growth_os_probe_login;
   create table growth_os_probe.activation_window(singleton boolean,starts_at timestamptz,deadline timestamptz);
   insert into growth_os_probe.activation_window values(true,null,null);
   grant growth_os_probe_owner to probe_operator with admin false, set true, inherit false granted by probe_operator;
   create function growth_os_probe.append_fixture_turn() returns jsonb language plpgsql security definer
   set search_path='' set lock_timeout='5s' as $$begin return '{}'::jsonb;end$$;
   alter function growth_os_probe.append_fixture_turn() owner to growth_os_probe_owner;
   set role growth_os_probe_owner;
   grant execute on function growth_os_probe.append_fixture_turn() to public;
   reset role;
   revoke growth_os_probe_owner from probe_operator granted by probe_operator restrict;`);
  const oid=(await db.query("select 'growth_os_probe.append_fixture_turn()'::regprocedure::oid id")).rows[0].id;
  let sql=adapt(original).replaceAll('18474::oid',oid+'::oid');
  if(mode==='oid_drift')sql=sql.replaceAll(oid+'::oid','1::oid');
  if(mode==='acl_drift') {
   await db.exec(`grant growth_os_probe_owner to probe_operator with admin false,set true,inherit false granted by probe_operator;
    set role growth_os_probe_owner;grant execute on function growth_os_probe.append_fixture_turn() to anon;
    reset role;revoke growth_os_probe_owner from probe_operator granted by probe_operator restrict;`);
  }
  if(mode==='member_drift')await db.exec('grant growth_os_probe_login to probe_operator with admin false,set true,inherit false granted by probe_operator;');
  if(mode==='owner_drift') {
   // Fixture-only bootstrap drift; reconcile itself always runs as NOSUPERUSER.
   await db.exec(`set session authorization postgres;
    alter function growth_os_probe.append_fixture_turn() owner to probe_operator;
    set session authorization probe_operator;`);
  }
  const before=await snapshot(db);
  if(mode==='injected')sql=sql.replace('-- FAILURE_INJECTION_POINT (test harness only)','select 1/0;');
  if(mode!=='success') {
   const expected={injected:'division by zero',oid_drift:'Exact OID/signature/owner/config drift',
    acl_drift:'Original ACL drift',member_drift:'Full original membership drift',
    owner_drift:'Exact OID/signature/owner/config drift'};
   await assert.rejects(()=>db.exec(sql),error=>error.message===expected[mode]);
   await db.exec('rollback');
   assert.deepEqual(await snapshot(db),before);
   console.log('PASS LOCAL '+mode+': failure/rollback preserves complete ACL, definition and grantor membership rows');
   continue;
  }
  await db.exec(sql);
  const after=await snapshot(db);
  assert.deepEqual(after.members,before.members);
  assert.deepEqual(after.roles,before.roles);
  assert.deepEqual(after.window_state,before.window_state);
  const {proacl:oldAcl,...beforeDefinition}=before.function;
  const {proacl:newAcl,...afterDefinition}=after.function;
  assert.deepEqual(afterDefinition,beforeDefinition);
  assert.notDeepEqual(newAcl,oldAcl);
  const acl=(await db.query(`select r.rolname,has_function_privilege(r.oid,
    'growth_os_probe.append_fixture_turn()','EXECUTE') allowed from pg_roles r where
    r.rolname in ('anon','authenticated','service_role','growth_os_probe_login','growth_os_probe_owner')`)).rows;
  for(const row of acl)assert.equal(row.allowed,row.rolname.startsWith('growth_os_probe_'));
  // Simulate an activated role, then fail object cleanup AFTER committed NOLOGIN.
  await db.exec('alter role growth_os_probe_login login;');
  const failClosed=adapt(cleanup).replace('SET LOCAL ROLE growth_os_probe_owner;','select 1/0;');
  const transactionStart=failClosed.indexOf('BEGIN;');
  // psql autocommit / separate connector actions; batch execution is NOT equivalent.
  await db.exec('ALTER ROLE growth_os_probe_login NOLOGIN;');
  await db.exec("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='growth_os_probe_login' AND pid<>pg_backend_pid();");
  await assert.rejects(()=>db.exec(failClosed.slice(transactionStart)));
  await db.exec('rollback');
  assert.equal((await db.query("select rolcanlogin from pg_roles where rolname='growth_os_probe_login'")).rows[0].rolcanlogin,false);
  assert.deepEqual((await snapshot(db)).members,before.members);
  // Inspect that termination is before any fallible owner GRANT.
  assert.ok(cleanup.indexOf('pg_terminate_backend')<cleanup.indexOf('GRANT growth_os_probe_owner'));
  console.log('PASS LOCAL success: exact ACL and original multi-grantor rows preserved; cleanup ACL failure leaves NOLOGIN');
  console.log((await db.query('select version() version')).rows[0].version);
 } finally {await db.close();}
}

} catch(error) { console.error('LOCAL TEST FAILED:',error.code,error.message); process.exitCode=1; }
