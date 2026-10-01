// PostgreSQL18.3 WASM, not concurrent native backends or remote deployment proof.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=await PGlite.create();
const sql=await readFile(new URL('../../migrations/20261001083611_growth_model_trial_budget.sql',import.meta.url),'utf8');
const actor='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222';
const id=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;
const reserve=(n=1,who=actor,hash='a'.repeat(64))=>db.query('select public.model_trial_reserve($1,$2,$3,$4,$5,$6) r',[id(n),who,org,'synth-parts-v1',hash,1]);
const settle=(n,input=1000,output=100,code='ok')=>db.query('select public.model_trial_settle($1,$2,$3,$4) r',[id(n),input,output,code]);
const row=async()=>(await db.query('select calls_reserved,spent_nusd::text,held_nusd::text,state,active_request,warnings,starts_at,deadline from private.model_trial')).rows[0];
let groups=0;const pass=name=>{groups++;console.log('PASS LEDGER '+name);};
try {
 await db.exec(`create schema auth;create schema private;create role anon nologin;create role authenticated nologin;create role service_role nologin;
 create table auth.users(id uuid primary key);create table public.organizations(id uuid primary key);
 create table public.organization_members(organization_id uuid,user_id uuid,role text);
 insert into auth.users values('${actor}');insert into public.organizations values('${org}');insert into public.organization_members values('${org}','${actor}','owner');`);
 await db.exec(sql);
 assert.equal((await row()).state,'staged');assert.equal((await row()).starts_at,null);
 await assert.rejects(()=>reserve(),e=>e.code==='42501');pass('staged has no clock/calls, blocks reserve');
 const acl=(await db.query(`select r.rolname,has_function_privilege(r.oid,'public.model_trial_reserve(uuid,uuid,uuid,text,text,integer)','EXECUTE') reserve,
 has_function_privilege(r.oid,'public.model_trial_settle(uuid,integer,integer,text)','EXECUTE') settle,
 has_function_privilege(r.oid,'public.model_trial_authorize_dispatch(uuid,uuid,uuid)','EXECUTE') dispatch,
 has_table_privilege(r.oid,'private.model_trial','SELECT') direct from pg_roles r where rolname in ('anon','authenticated','service_role')`)).rows;
 for(const r of acl){assert.equal(r.reserve,r.rolname==='service_role');assert.equal(r.settle,r.rolname==='service_role');assert.equal(r.dispatch,r.rolname==='service_role');assert.equal(r.direct,false);}
 assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'model_trial%' and c.relrowsecurity")).rows[0].n,2);
 pass('exact service-only RPC ACL, no table grant; both tables RLS');
 await db.query('update private.model_trial set actor_user_id=$1,organization_id=$2 where singleton',[actor,org]);
 let activate=await readFile(new URL('activate.sql.template',import.meta.url),'utf8');
 activate=activate.replaceAll('__READY_POLICY__','gpt41mini-20250414-v1').replaceAll('__COUNTING_ZERO_EXTRA_CHARGE__','confirmed').replaceAll('__RUNTIME_REVIEWED__','confirmed').replaceAll('__ACTOR_UUID__',actor).replaceAll('__ORG_UUID__',org);
 await db.exec(activate);const times=await row();assert.equal(new Date(times.deadline)-new Date(times.starts_at),7*86400000);
 await assert.rejects(()=>db.exec(activate));await db.exec('rollback');pass('7-day clock starts only ready; second activation/reset denied');
 await db.exec('set role service_role');assert.equal((await reserve()).rows[0].r.dispatch,true);
 assert.equal((await reserve()).rows[0].r.dispatch,false);await assert.rejects(()=>reserve(1,actor,'b'.repeat(64)),e=>e.code==='22023');
 await assert.rejects(()=>reserve(2),e=>e.code==='55000');await db.exec('reset role');assert.equal((await row()).calls_reserved,2);assert.equal((await row()).held_nusd,'420668800');pass('atomic reservation, busy and changed replay refusal');
 await db.exec('set role service_role');await settle(1);await settle(1);await assert.rejects(()=>settle(1,1001),e=>e.code==='22023');await db.exec('reset role');assert.equal((await row()).spent_nusd,'560000');assert.equal((await row()).held_nusd,'0');pass('known usage once only, integer nanoUSD refund');
 for(let n=2;n<=50;n++){await reserve(n);await settle(n);}
 assert.equal((await row()).calls_reserved,100);assert.deepEqual((await row()).warnings,[50,80]);await assert.rejects(()=>reserve(51),e=>e.code==='54000');pass('100 total HTTP slots incl counting, persistent 50/80 warnings, no extra call');
 // Synthetic isolated fixture reset ONLY in this engine test; never exposed by RPC.
 await db.exec('truncate private.model_trial_attempts;update private.model_trial set calls_reserved=0,spent_nusd=600000000,held_nusd=0,active_request=null,warnings=\'{}\';');
 await assert.rejects(()=>reserve(52),e=>e.code==='54000');pass('budget worst-case reserve rejects before total exceeds USD1');
 await db.exec('update private.model_trial set spent_nusd=0;');await reserve(53);await settle(53,null,null,'usage_unknown');assert.equal((await row()).state,'paused');assert.equal((await row()).held_nusd,'420668800');await assert.rejects(()=>reserve(54),e=>e.code==='55000');pass('unknown usage retains all held budget and pauses new calls');
 await db.exec('truncate private.model_trial_attempts;update private.model_trial set state=\'active\',held_nusd=0,active_request=null;');await reserve(55);
 await db.exec("update public.organization_members set role='viewer';");await assert.rejects(()=>db.query('select public.model_trial_authorize_dispatch($1,$2,$3)',[id(55),actor,org]),e=>e.code==='42501');await settle(55,null,null,'scope_changed');pass('membership revoked after count denies generation dispatch');
 await db.exec("update public.organization_members set role='owner';truncate private.model_trial_attempts;update private.model_trial set state='active',held_nusd=0,active_request=null;");
 await reserve(56);
 // Set both endpoints from a single clock to satisfy exact 7-day invariant.
 await db.exec("update private.model_trial set starts_at=statement_timestamp()-interval '7 days'+interval '30 seconds',deadline=statement_timestamp()+interval '30 seconds';");
 assert.equal((await row()).state,'active');
 await assert.rejects(()=>db.query('select public.model_trial_authorize_dispatch($1,$2,$3)',[id(56),actor,org]),e=>e.code==='42501');
 await settle(56,0,0,'count_over_limit');
 await assert.rejects(()=>reserve(57),e=>e.code==='55000');pass('deadline changed after count denies generation; near-expiry reserve denied');
 const stop=await readFile(new URL('stop.sql',import.meta.url),'utf8');
 const cleanup=await readFile(new URL('cleanup.sql',import.meta.url),'utf8');
 await db.exec("update private.model_trial set starts_at=statement_timestamp(),deadline=statement_timestamp()+interval '7 days';");await reserve(58);
 await db.exec(stop);assert.equal((await row()).state,'closed');
 await assert.rejects(()=>reserve(59),e=>e.code==='55000');
 await assert.rejects(()=>db.exec(cleanup));await db.exec('rollback');
 assert.equal((await row()).state,'closed');pass('stop rejects new calls and cleanup refuses unclosed reservation');
 // Only the isolated harness settles its known zero-usage synthetic reservation.
 await settle(58,0,0,'count_over_limit');
 // Previously unknown synthetic attempt is gone via the earlier test-only truncate.
 await db.exec(cleanup);
 assert.equal((await db.query("select to_regclass('private.model_trial') t")).rows[0].t,null);
 assert.equal((await db.query("select count(*)::int n from pg_proc where proname like 'model_trial_%' or proname='has_org_role_for_model_trial'")).rows[0].n,0);
 pass('exact cleanup removes only new trial objects without CASCADE');
 console.log(`PASS ${groups} SQL ledger groups; runtime ${(await db.query('select version() v')).rows[0].v}`);
} catch(e){console.error('LEDGER FAILED',e.code,e.message);process.exitCode=1;}finally{await db.close();}
