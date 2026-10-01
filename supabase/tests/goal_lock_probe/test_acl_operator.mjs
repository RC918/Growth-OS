// NEW offline operator privilege regression only; no remote connections.
import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const db=await PGlite.create();
try {
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
 create role probe_operator nologin nosuperuser createrole;
 grant create on database postgres to probe_operator;
 set session authorization probe_operator;
 create role growth_os_probe_owner nologin noinherit;
 create role growth_os_probe_login nologin noinherit;
 create schema growth_os_probe;
 revoke all on schema growth_os_probe from public;
 grant usage,create on schema growth_os_probe to growth_os_probe_owner;
 grant usage on schema growth_os_probe to growth_os_probe_login;
 grant growth_os_probe_owner to probe_operator with set true, inherit false;
 create function growth_os_probe.append_fixture_turn() returns int language sql as $$select 1$$;
 alter function growth_os_probe.append_fixture_turn() owner to growth_os_probe_owner;
 revoke growth_os_probe_owner from probe_operator;`);
 // Owner transfer keeps the default PUBLIC ACL. ADMIN or schema ownership
 // does not imply object-grant privileges without SET/INHERIT owner access.
 await db.exec(`revoke all on function growth_os_probe.append_fixture_turn() from public;
 grant execute on function growth_os_probe.append_fixture_turn() to growth_os_probe_login;`);
 const bad=(await db.query(`select exists(select from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
 where n.nspname='growth_os_probe' and x.grantee=0) public_execute`)).rows[0];
 assert.equal(bad.public_execute,true);
 await db.exec(await readFile(new URL('reconcile_acl.sql',import.meta.url),'utf8'));
 const privileges=(await db.query(`select rolname,
 has_function_privilege(oid,'growth_os_probe.append_fixture_turn()','EXECUTE') can_execute
 from pg_roles where rolname in ('growth_os_probe_login','anon','authenticated','service_role')`)).rows;
 for(const row of privileges)assert.equal(row.can_execute,row.rolname==='growth_os_probe_login');
 const membership=(await db.query(`select count(*)::int n from pg_auth_members m
 join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member
 where r.rolname='growth_os_probe_owner' and u.rolname='probe_operator' and (m.set_option or m.inherit_option)`)).rows[0];
 assert.equal(membership.n,0);
 assert.equal((await db.query(`select rolcanlogin from pg_roles where rolname='growth_os_probe_login'`)).rows[0].rolcanlogin,false);
 // Exercise the cleanup ACL-denial phase as a non-superuser operator.
 const cleanup=await readFile(new URL('cleanup.sql',import.meta.url),'utf8');
 await db.exec(cleanup.slice(0,cleanup.indexOf('-- Only terminate')));
 assert.equal((await db.query(`select has_function_privilege('growth_os_probe_login','growth_os_probe.append_fixture_turn()','EXECUTE') allowed`)).rows[0].allowed,false);
 console.log('PASS NEW LOCAL non-superuser DCL regression, reconcile and cleanup denial; NO remote changes');
} finally {await db.close();}
