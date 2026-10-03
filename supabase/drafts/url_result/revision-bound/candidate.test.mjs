import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
import {baselineSQL} from '../bound/baseline.mjs';
import {source,render,root,baseId,sha} from './candidate.mjs';
import {canonical} from '../../../../apps/web/first-result-payload.mjs';
const m=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
test('offline bounded v2: existing closed schema, exact base, at most 0/1/1, retained data',async t=>{
 const db=await PGlite.create(),s=await source(),pack=await render(m,{cutoff:'2099-01-01T00:00:00.000Z'});
 const q=(sql,args=[])=>db.query(sql,args),scalar=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
 const auth=async(actor=m.actor_id,role='authenticated')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role '+role);};
 const save=(changes={})=>{const x={...m,payload:s.payload,...changes};return scalar('select public.save_url_result_draft($1,$2,$3,$4,$5)',[x.organization_id,x.opportunity_id,x.request_id,x.expected_version,JSON.stringify(x.payload)]);};
 const tx=async fn=>{await db.exec('reset role;begin');try{await fn();}finally{await db.exec('rollback;reset role');}};
 const snapshot=async()=>{await db.exec('reset role');const out={};for(const {tablename}of(await q("select tablename from pg_tables where schemaname='public' order by tablename")).rows)out[tablename]=await scalar(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${tablename} t`);return out;};
 try{
  // Disposable reconstruction ONLY. Never replay the old opening/fixture remotely.
  await db.exec(await baselineSQL({pglite:true}));
  const historical=await readFile(new URL('../bound/owner-candidate-20261003T193000Z/opening.sql',root),'utf8');
  await db.exec(historical.replaceAll('2026-10-03T19:30:00.000Z','2099-01-01T00:00:00.000Z'));
  await auth();const oldId=await save({request_id:s.old.manifest.request_id,expected_version:0,payload:s.old.payload});await db.exec('reset role');
  await q('update public.content_versions set id=$1 where id=$2',[baseId,oldId]);await q('update public.audit_events set object_id=$1 where object_id=$2',[baseId,oldId]);
  await db.exec(s.implementation.replace('create function private.','create or replace function private.'));
  await db.exec(pack.cleanup);await db.exec("insert into supabase_migrations.schema_migrations values('synthetic-old-open','old opening',array['local only']),('synthetic-old-close','old cleanup',array['local only'])");
  await db.exec(await readFile(new URL('preflight.sql',root),'utf8'));
  const before=await snapshot(),v1=before.content_versions.find(v=>v.id===baseId);
  await t.test('frozen v2 is reproducible, source/original suggestions retained, no default cutoff',async()=>{
   for(const [name,hash] of Object.entries(JSON.parse(await readFile(new URL('hashes.json',root),'utf8'))))assert.equal(sha(await readFile(new URL(name,root))),hash,name);
   assert.equal(sha(await readFile(new URL('v2-payload.json',root))),m.payload_file_sha256);assert.equal(sha(canonical(s.payload)),m.payload_canonical_sha256);
   assert.deepEqual(JSON.parse(await readFile(new URL('v2-payload.json',root),'utf8')),s.payload);assert.deepEqual(s.payload.snapshot,s.old.payload.snapshot);assert.deepEqual(s.payload.review.original_suggestions,s.old.payload.review.original_suggestions);assert.equal(s.payload.review.revision,3);
   assert.equal(await scalar('select private.fr_request_digest($1,$2,$3,$4,1,$5)',[m.organization_id,m.opportunity_id,m.actor_id,m.request_id,JSON.stringify(s.payload)]),m.request_digest);
   const template=await render(m);assert.equal(template.opening,await readFile(new URL('opening.sql.template',root),'utf8'));assert.equal(template.cleanup,await readFile(new URL('cleanup.sql',root),'utf8'));
   await tx(()=>assert.rejects(db.exec(template.opening)));await assert.rejects(render(m,{cutoff:'2099-02-30T00:00:00.000Z'}));assert.equal(m.cutoff,null);
  });
  await t.test('explicit offline binder freezes paired configs and SQL; invalid time and overwrite refused',async()=>{
   const temp=await mkdtemp('/tmp/revision-bind-test-'),output=temp+'/bound',cli=new URL('bind.mjs',root);
   try{
    assert.throws(()=>execFileSync(process.execPath,[cli.pathname,'null',output],{stdio:'pipe'}));
    execFileSync(process.execPath,[cli.pathname,'2099-01-01T00:00:00.000Z',output],{stdio:'pipe'});
    assert.throws(()=>execFileSync(process.execPath,[cli.pathname,'2099-01-01T00:00:00.000Z',output],{stdio:'pipe'}));
    const hashes=JSON.parse(await readFile(output+'/hashes.json','utf8'));for(const [name,hash]of Object.entries(hashes))assert.equal(sha(await readFile(output+'/'+name)),hash);
    const open=await import(output+'/preview-open-config.mjs'),closed=await import(output+'/preview-closed-config.mjs');assert.equal(open.urlSaveEnabled,true);assert.equal(closed.urlSaveEnabled,false);assert.deepEqual(open.urlSaveTrial,closed.urlSaveTrial);assert.equal(open.urlSaveTrial.kind,'revision');assert.equal(open.urlSaveTrial.expires_at,'2099-01-01T00:00:00.000Z');assert.equal(open.urlSaveTrial.request_id,m.request_id);assert.equal(open.urlSaveTrial.intent_digest,m.intent_digest);assert.equal(await readFile(output+'/opening.sql','utf8'),pack.opening);
   }finally{await rm(temp,{recursive:true});}
  });
  await t.test('history, implementation, base identity and ACL drift reject opening',async()=>{
   for(const sql of ["delete from supabase_migrations.schema_migrations where version='synthetic-1'",s.implementation.replace('create function private.','create or replace function private.').replace('URL acceptance expired','drift'),`update public.content_versions set id='10000000-0000-4000-8000-000000000099' where id='${baseId}'`,`grant execute on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb) to public`])await tx(async()=>{await db.exec(sql);await assert.rejects(db.exec(pack.opening));});
  });
  await db.exec(pack.opening);assert.deepEqual(await snapshot(),before);await db.exec("insert into supabase_migrations.schema_migrations values('synthetic-v2-open','url_revision_bound_open_v2',array['local only'])");
  await t.test('wrong actor/parent/request/expected/payload and service role rejected',async()=>{
   for(const changes of [{request_id:s.old.manifest.request_id},{expected_version:0},{expected_version:2},{opportunity_id:baseId},{payload:s.old.payload}])await tx(async()=>{await auth();await assert.rejects(save(changes));});
   for(const [actor,role]of [['10000000-0000-4000-8000-000000000004','authenticated'],[m.actor_id,'service_role'],[m.actor_id,'anon']])await tx(async()=>{await auth(actor,role);await assert.rejects(save());});
   await tx(async()=>{await auth();await assert.rejects(q('select private.save_url_result_draft_impl($1,$2,$3,0,$4)',[m.organization_id,m.opportunity_id,s.old.manifest.request_id,JSON.stringify(s.old.payload)]));});assert.deepEqual(await snapshot(),before);
  });
  await t.test('expiry rolls back append and audit at return, base is untouched',()=>tx(async()=>{
   const short=await render(m,{cutoff:new Date(Date.now()+1500).toISOString()});await db.exec(short.implementation);
   await db.exec("create function public.slow_v2_audit() returns trigger language plpgsql as $$begin perform pg_sleep(2);return new;end$$;create trigger slow_v2_audit before insert on public.audit_events for each row execute function public.slow_v2_audit();");
   await auth();await db.exec('savepoint expiry');const start=Date.now();await assert.rejects(save(),e=>e.code==='42501');assert.ok(Date.now()-start>=1900);await db.exec('rollback to expiry');assert.deepEqual(await snapshot(),before);
  }));
  let id;
  await t.test('one authenticated revision, SQL dedup safety, exact payload and all previous rows retained',async()=>{
   await auth();id=await save();assert.equal(await save(),id,'offline duplicate fault injection only; live budget forbids second POST');await db.exec('reset role');
   const after=await snapshot(),row=after.content_versions.find(v=>v.id===id);assert.equal(row.version_number,2);assert.equal(row.status,'draft');assert.equal(row.first_result_request_digest,m.request_digest);assert.deepEqual(row.first_result_payload,s.payload);assert.deepEqual(after.content_versions.find(v=>v.id===baseId),v1);
   assert.equal(after.content_versions.length,before.content_versions.length+1);assert.equal(after.audit_events.length,before.audit_events.length+1);assert.deepEqual(after.growth_opportunities,before.growth_opportunities);
   const audit=after.audit_events.find(a=>a.object_id===id);assert.equal(audit.details.created_parent,false);assert.equal(audit.details.request_id,m.request_id);
   after.content_versions=after.content_versions.filter(v=>v.id!==id);after.audit_events=after.audit_events.filter(a=>a.id!==audit.id);assert.deepEqual(after,before);
  });
  await t.test('cleanup retains v1/v2 and audit, closes public/private effective ACLs, GET still works',async()=>{
   const saved=await snapshot();await db.exec(pack.cleanup);await db.exec(pack.cleanup);assert.deepEqual(await snapshot(),saved);
   await db.exec("insert into supabase_migrations.schema_migrations values('synthetic-v2-close','url_revision_bound_close_v2',array['local only'])");assert.equal(await scalar('select count(*)::int from supabase_migrations.schema_migrations'),23);await db.exec(await readFile(new URL('postflight.sql',root),'utf8'));
   for(const role of ['anon','authenticated','service_role'])for(const name of ['public.save_url_result_draft','private.save_url_result_draft_impl'])assert.equal(await scalar(`select has_function_privilege($1,'${name}(uuid,uuid,uuid,integer,jsonb)','EXECUTE')`,[role]),false);
   await auth();await assert.rejects(save(),e=>e.code==='42501');const rows=(await q('select id,first_result_payload from public.content_versions where organization_id=$1 and opportunity_id=$2 order by version_number',[m.organization_id,m.opportunity_id])).rows;assert.equal(rows.length,2);assert.equal(rows[0].id,baseId);assert.equal(rows[1].id,id);assert.deepEqual(rows[0].first_result_payload,s.old.payload);assert.deepEqual(rows[1].first_result_payload,s.payload);
  });
 }finally{await db.close();}
});
