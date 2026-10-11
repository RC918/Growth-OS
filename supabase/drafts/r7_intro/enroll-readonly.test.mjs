import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',org='00000000-0000-4000-8000-000000000003',orgB='00000000-0000-4000-8000-000000000004';
const files={};for(const n of ['proposal.sql','enroll-readonly.sql','enable.sql','disable.sql'])files[n]=await readFile('supabase/drafts/r7_intro/'+n,'utf8');
test('first-login read-only enrollment never opens writer or guesses identity',async t=>{
 const db=await PGlite.create();const q=(s,a=[])=>db.query(s,a),scalar=async(s,a=[])=>Object.values((await q(s,a)).rows[0])[0];
 const set=async(actor=owner,organization=org)=>q("select set_config('r7.actor_id',$1,false),set_config('r7.organization_id',$2,false)",[actor,organization]);
 const rejected=async pattern=>{await assert.rejects(()=>db.exec(files['enroll-readonly.sql']),pattern);await db.exec('rollback');};
 const auth=async(id=owner,role='authenticated')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${owner}'),('${other}');`);
 await db.exec(files['proposal.sql']);
 const untouched=await scalar('select row_to_json(g) from r7_private.write_gate g');
 await t.test('missing settings, absent Auth identity and null tenant reject atomically',async()=>{
 await rejected(/unrecognized configuration/);await set('00000000-0000-4000-8000-000000000099');await rejected(/existing invited/);await set(owner,'');await rejected(/invalid input/);assert.equal(await scalar('select count(*)::int from r7_private.members'),0);
 });
 await t.test('membership or dedicated tenant collision cannot be reassigned',async()=>{
 await set();await db.exec(`insert into r7_private.members values('${owner}','${orgB}','owner')`);await rejected(/membership mismatch/);await db.exec('delete from r7_private.members');await db.exec(`insert into r7_private.members values('${other}','${org}','owner')`);await rejected(/dedicated organization/);await db.exec('delete from r7_private.members');
 });
 await t.test('an enabled or previously used gate rejects without changing it',async()=>{
 await db.exec('update r7_private.write_gate set enabled=true');await rejected(/untouched closed/);assert.equal(await scalar('select enabled from r7_private.write_gate'),true);await db.exec(`update r7_private.write_gate set enabled=false,actor_id='${owner}'`);await rejected(/untouched closed/);await db.exec('update r7_private.write_gate set actor_id=null');
 });
 await t.test('enrollment/replay preserves exact closed gate and grants only required reads',async()=>{
 await db.exec(files['enroll-readonly.sql']);await db.exec(files['enroll-readonly.sql']);assert.deepEqual(await scalar('select row_to_json(g) from r7_private.write_gate g'),untouched);assert.equal(await scalar('select count(*)::int from r7_private.members'),1);
 for(const role of ['anon','authenticated','service_role'])for(const fn of ['public.save_r7_intro(uuid,uuid,integer,text,text,json)','public.confirm_r7_intro(uuid,uuid,integer,text,text,uuid)','r7_private.mutate(text,uuid,uuid,integer,text,text,json,uuid)'])assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\')',[role,fn]),false);
 for(const table of ['r7_private.audit','r7_private.write_gate'])assert.equal(await scalar('select has_table_privilege(\'authenticated\',$1,\'select\')',[table]),false);
 });
 await t.test('owner sees membership; other user sees none; anon, DML and RPC denied',async()=>{
 await auth();assert.deepEqual((await q('select organization_id,role from public.r7_members')).rows,[{organization_id:org,role:'owner'}]);assert.equal(await scalar('select count(*)::int from public.intro_versions'),0);
 for(const sql of ['delete from r7_private.members','update r7_private.write_gate set enabled=true',"select public.save_r7_intro(null,null,0,null,null,null)","select public.confirm_r7_intro(null,null,0,null,null,null)"])await assert.rejects(()=>db.exec(sql),e=>e.code==='42501');
 await auth(other);assert.equal(await scalar('select count(*)::int from public.r7_members'),0);assert.equal(await scalar('select count(*)::int from public.intro_versions'),0);await auth('', 'anon');await assert.rejects(()=>q('select * from public.r7_members'),e=>e.code==='42501');await db.exec('reset role');
 assert.equal(await scalar('select count(*)::int from r7_private.audit'),0);assert.equal(await scalar('select count(*)::int from r7_private.versions'),0);assert.equal(await scalar('select count(*)::int from r7_private.confirmations'),0);assert.deepEqual(await scalar('select row_to_json(g) from r7_private.write_gate g'),untouched);
 });
 await t.test('separate later enable then disable retains authenticated readback',async()=>{
 await set();await q("select set_config('r7.expires_at',(clock_timestamp()+interval '15 minutes')::text,false)");await db.exec(files['enable.sql']);assert.equal(await scalar('select enabled from r7_private.write_gate'),true);await db.exec(files['disable.sql']);await auth();assert.equal(await scalar('select count(*)::int from public.r7_members'),1);assert.equal(await scalar('select count(*)::int from public.intro_versions'),0);await assert.rejects(()=>db.exec('select public.save_r7_intro(null,null,0,null,null,null)'),e=>e.code==='42501');
 });
 }finally{await db.close();}
});
