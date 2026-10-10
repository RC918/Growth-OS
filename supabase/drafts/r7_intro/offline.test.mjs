import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createR7WorkspaceApi as createWorkspaceApi} from '../../../apps/web/r7-workspace-api.mjs';
import {validateIntroVersion,candidateHash} from '../../../apps/web/intro-save.mjs';
import {R7} from '../../../apps/web/intro-r7-review.mjs';
const frame=JSON.parse(await readFile('apps/web/intro-r7.json','utf8'));
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',viewer='00000000-0000-4000-8000-000000000005',org='00000000-0000-4000-8000-000000000003',orgB='00000000-0000-4000-8000-000000000004';
const grant=`grant usage on schema r7_private to authenticated;grant select on r7_private.members,r7_private.versions,r7_private.confirmations,r7_private.audit,public.r7_members,public.intro_versions to authenticated;
grant execute on function r7_private.mutate(text,uuid,uuid,integer,text,text,json,uuid),public.save_r7_intro(uuid,uuid,integer,text,text,json),public.confirm_r7_intro(uuid,uuid,integer,text,text,uuid) to authenticated;`;
test('R7 candidate on real isolated PostgreSQL/PGlite: ACL/RLS, atomic versions, audit and cold readback',async t=>{
 const hashes=JSON.parse(await readFile('supabase/drafts/r7_intro/SHA256.json','utf8'));
 for(const [name,hash] of Object.entries(hashes))assert.equal(createHash('sha256').update(await readFile('supabase/drafts/r7_intro/'+name)).digest('hex'),hash);
 const dir=await mkdtemp(join(tmpdir(),'r7-sql-'));let db=await PGlite.create(dir);
 const q=(s,a=[])=>db.query(s,a),scalar=async(s,a=[])=>Object.values((await q(s,a)).rows[0])[0];
 const auth=async(id=owner,role='authenticated')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
 const save=(expected=0,request=crypto.randomUUID(),payload=frame)=>scalar('select public.save_r7_intro($1,$2,$3,$4,$5,$6::json)',[org,request,expected,candidateHash,R7.version,JSON.stringify(payload)]);
 const confirm=(row,request=crypto.randomUUID())=>scalar('select public.confirm_r7_intro($1,$2,$3,$4,$5,$6)',[org,request,row.version,candidateHash,R7.version,row.id]);
 let first,confirmed,second;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${owner}'),('${other}'),('${viewer}');`);
 await db.exec(await readFile('supabase/drafts/r7_intro/proposal.sql','utf8'));
 await db.exec(`insert into r7_private.members values('${owner}','${org}','owner'),('${other}','${orgB}','owner'),('${viewer}','${org}','viewer');`);
 await t.test('default API read/write ACL closed; grant alone cannot open expired writer',async()=>{
 for(const role of ['anon','authenticated','service_role']){
 assert.equal(await scalar(`select has_function_privilege('${role}','public.save_r7_intro(uuid,uuid,integer,text,text,json)','execute')`),false);
 assert.equal(await scalar(`select has_table_privilege('${role}','public.intro_versions','select')`),false);
 }
 await db.exec(grant);await auth();await assert.rejects(()=>save(),e=>e.code==='42501');await db.exec('reset role');
 await q("select set_config('r7.actor_id',$1,false),set_config('r7.organization_id',$2,false),set_config('r7.expires_at',(now()+interval '15 minutes')::text,false)",[owner,org]);await db.exec(await readFile('supabase/drafts/r7_intro/enable.sql','utf8'));await auth();
 });
 await t.test('R7 bytes, request idempotency, confirmation and audit are exact',async()=>{
 const request=crypto.randomUUID();first=await save(0,request);assert.deepEqual(first.frame,frame);await validateIntroVersion(first,org);assert.deepEqual(await save(0,request),first);
 await assert.rejects(()=>save(1,request),e=>e.code==='23505');confirmed=await confirm(first);assert.equal(confirmed.confirmation.version_id,first.id);await validateIntroVersion(confirmed,org);
 assert.equal(await scalar('select count(*)::int from r7_private.audit'),2);
 });
 await t.test('tenant isolation, viewer mutation denial, direct DML and anonymous denial',async()=>{
 await auth(other);assert.equal(await scalar('select count(*)::int from public.intro_versions'),0);await assert.rejects(()=>save(1),e=>e.code==='42501');
 await auth(viewer);assert.equal(await scalar('select count(*)::int from public.intro_versions'),1);await assert.rejects(()=>confirm(first),e=>e.code==='42501');
 await auth();for(const sql of ['delete from r7_private.versions','update r7_private.confirmations set actor_id=null','delete from r7_private.audit','update r7_private.write_gate set enabled=true','insert into r7_private.members values(gen_random_uuid(),gen_random_uuid(),\'owner\')'])await assert.rejects(()=>db.exec(sql),e=>e.code==='42501');
 await auth('', 'anon');await assert.rejects(()=>q('select * from public.intro_versions'),e=>e.code==='42501');await auth();
 });
 await t.test('new version has no inherited approval; stale target and altered source rejected',async()=>{
 const changed=structuredClone(frame);changed.payload.candidate.output.candidate+='tampered';await assert.rejects(()=>save(1,crypto.randomUUID(),changed),e=>e.code==='22023');
 second=await save(1);assert.equal(second.version,2);assert.equal(second.confirmation,null);await assert.rejects(()=>confirm(first),e=>e.code==='40001');await assert.rejects(()=>save(1),e=>e.code==='40001');
 });
 await t.test('audit insertion failure rolls back version atomically',async()=>{
 await db.exec("reset role;create function r7_private.reject_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failure';end$$;create trigger reject_audit before insert on r7_private.audit for each row execute function r7_private.reject_audit();");await auth();await assert.rejects(()=>save(2),e=>e.code==='P0001');assert.equal(await scalar('select max(version) from public.intro_versions'),2);await db.exec('reset role;drop trigger reject_audit on r7_private.audit');await auth();
 });
 await t.test('cold database reopen + fresh authenticated session reads exact version',async()=>{
 await db.close();db=await PGlite.create(dir);await auth();const row=await scalar('select row_to_json(v) from public.intro_versions v where id=$1',[second.id]);assert.deepEqual(row,second);await validateIntroVersion(row,org);
 });
 await t.test('actual workspace API traverses SQL save/confirm and lost-response reconcile',async()=>{
 let drop=false;const api=createWorkspaceApi({introSaveEnabled:true,introOnly:true,origin:'https://wqepyttadrcnphtyjpjy.supabase.co',key:'sb_publishable_isolated',redirectOrigin:'https://example.test',fetchImpl:async(url,options)=>{
 const path=new URL(url).pathname;let value;
 if(path==='/auth/v1/user')value={id:owner};else if(path==='/rest/v1/r7_members')value=(await q('select organization_id,role from public.r7_members')).rows;
 else if(path==='/rest/v1/intro_versions')value=(await q('select row_to_json(v) r from public.intro_versions v order by version desc limit 1')).rows.map(r=>r.r);
 else{const p=JSON.parse(options.body);value=path.endsWith('save_r7_intro')?await save(p.p_expected_version,p.p_request_id,p.p_frame):await scalar('select public.confirm_r7_intro($1,$2,$3,$4,$5,$6)',[p.p_organization_id,p.p_request_id,p.p_expected_version,p.p_candidate_hash,p.p_source_version,p.p_version_id]);if(drop){drop=false;throw Error('response lost after SQL commit');}}
 return {ok:true,json:async()=>value};}});
 await api.completeMagicLink('#access_token=fixture&token_type=bearer&expires_in=3600');const row=await api.intro.read();drop=true;await assert.rejects(()=>api.intro.save(frame,row),/未知/);const back=await api.intro.reconcile();assert.equal(back.version,3);drop=true;await assert.rejects(()=>api.intro.confirm(back),/未知/);assert.ok((await api.intro.reconcile()).confirmation);
 });
 await t.test('disable gate stops writes while readback remains available',async()=>{
 await db.exec('reset role');await db.exec(await readFile('supabase/drafts/r7_intro/disable.sql','utf8'));await auth();await assert.rejects(()=>save(3),e=>e.code==='42501');assert.equal(await scalar('select max(version) from public.intro_versions'),3);
 });
 }finally{await db.close();await rm(dir,{recursive:true,force:true});}
});
