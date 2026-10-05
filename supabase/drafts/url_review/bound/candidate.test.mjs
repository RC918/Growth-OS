import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
import {baseline} from './fixture.mjs';
import {manifest,render,source,root,sha,checks,entries} from './candidate.mjs';
const m=await manifest(),pack=await render(m,{cutoff:'2099-01-01T00:00:00.000Z'});
test('bounded fixed-v2 Review candidate on 23-record closed baseline',async t=>{
 const db=await PGlite.create(),q=(s,a=[])=>db.query(s,a),scalar=async(s,a=[])=>Object.values((await q(s,a)).rows[0])[0];
 const auth=async(actor=m.actor_id,role='authenticated')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role '+role);};
 const call=(patch={})=>{const x={...m,...patch};return scalar('select public.review_url_result($1,$2,$3,$4,$5,$6,$7)',[x.organization_id,x.version_id,x.request_id,x.source_digest,x.content_digest,x.version_digest,JSON.stringify(x.checks)]);};
 const tx=async fn=>{await db.exec('reset role;begin');try{await fn();}finally{await db.exec('rollback;reset role');}};
 const reject=async fn=>{await db.exec('savepoint rejected');try{await assert.rejects(fn);}finally{await db.exec('rollback to rejected;release rejected');}};
 const preserve=await readFile(new URL('preservation.sql',root),'utf8'),snapshot=async()=>{await db.exec('reset role');return(await db.exec(preserve)).map(r=>r.rows);};
 try{
  await db.exec(await baseline({pglite:true}));const before=await snapshot();await db.exec(pack.preflight);
  await t.test('reproducible hashes and null cutoff fail closed; only explicit /tmp binder output',async()=>{
   const hashes=JSON.parse(await readFile(new URL('hashes.json',root),'utf8'));for(const [file,hash]of Object.entries(hashes))assert.equal(sha(await readFile(new URL(file,root))),hash,file);
   assert.deepEqual(JSON.parse(await readFile(new URL('manifest.json',root),'utf8')),m);assert.equal(m.cutoff,null);assert.equal((await render(m)).opening,await readFile(new URL('opening.sql.template',root),'utf8'));
   await tx(()=>assert.rejects(db.exec((awaitTemplate))));
   const dir=await mkdtemp('/tmp/review-bound-');try{const cli=new URL('bind.mjs',root).pathname;assert.throws(()=>execFileSync(process.execPath,[cli,'null',dir+'/bad'],{stdio:'pipe'}));execFileSync(process.execPath,[cli,'2099-01-01T00:00:00.000Z',dir+'/bound'],{stdio:'pipe'});assert.throws(()=>execFileSync(process.execPath,[cli,'2099-01-01T00:00:00.000Z',dir+'/bound'],{stdio:'pipe'}));const boundHashes=JSON.parse(await readFile(dir+'/bound/hashes.json','utf8'));for(const [f,h]of Object.entries(boundHashes))assert.equal(sha(await readFile(dir+'/bound/'+f)),h);assert.equal(await readFile(dir+'/bound/opening.sql','utf8'),pack.opening);const open=await import(dir+'/bound/preview-open-config.mjs'),closed=await import(dir+'/bound/preview-closed-config.mjs');assert.equal(open.urlReviewEnabled,false);assert.equal(open.urlReviewTrial.enabled,true);assert.equal(closed.urlReviewTrial.enabled,false);assert.equal(closed.urlReviewSchemaEnabled,true);assert.equal(open.urlSaveEnabled,false);}finally{await rm(dir,{recursive:true});}
   await assert.rejects(render({...m,version_id:m.v1_id}));await assert.rejects(render(m,{cutoff:'2099-02-30T00:00:00.000Z'}));
  });
  await t.test('history/Save ACL/base drift reject opening without partial DDL',async()=>{
   for(const sql of ["delete from supabase_migrations.schema_migrations where version='synthetic-1'",`grant execute on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb) to authenticated`,`update public.content_versions set id='10000000-0000-4000-8000-000000000099' where id='${m.version_id}'`])await tx(async()=>{await db.exec(sql);await reject(()=>db.exec(pack.opening));assert.equal(await scalar("select to_regprocedure('public.review_url_result(uuid,uuid,uuid,text,text,text,jsonb)')"),null);});
  });
  await db.exec(pack.opening);assert.deepEqual(await snapshot(),before);await q('insert into supabase_migrations.schema_migrations values($1,$2,$3)',['synthetic-review-open',m.opening_migration_name,[pack.opening]]);
  await t.test('bound server refuses wrong identity/version/request/digests/checks and Save remains closed',async()=>{
   for(const patch of [{organization_id:m.v1_id},{version_id:m.v1_id},{request_id:m.save_request_id},{source_digest:'sha256:'+'f'.repeat(64)},{content_digest:'sha256:'+'f'.repeat(64)},{version_digest:'pg-jsonb-sha256:'+'f'.repeat(64)},{checks:{...checks,blocking_facts_clear:false}}])await tx(async()=>{await auth();await reject(()=>call(patch));});
   for(const [actor,role]of [['10000000-0000-4000-8000-000000000004','authenticated'],[m.actor_id,'anon'],[m.actor_id,'service_role']])await tx(async()=>{await auth(actor,role);await reject(()=>call());});
   for(const role of ['anon','authenticated','service_role'])for(const name of ['public.save_url_result_draft','private.save_url_result_draft_impl'])assert.equal(await scalar(`select has_function_privilege('${role}','${name}(uuid,uuid,uuid,integer,jsonb)','execute')`),false);
   assert.deepEqual(await snapshot(),before);
  });
  await t.test('expiry after audit work rolls back review and audit',()=>tx(async()=>{
   const short=await render(m,{cutoff:new Date(Date.now()+1200).toISOString()});await db.exec(short.implementation);
   await db.exec("create function public.slow_review() returns trigger language plpgsql as $$begin if new.event_type='url_result_reviewed' then perform pg_sleep(1.5);end if;return new;end$$;create trigger slow_review before insert on public.audit_events for each row execute function public.slow_review();");await auth();await reject(()=>call());assert.equal(await scalar("select count(*) from public.content_reviews where url_review_request_id=$1",[m.request_id]),0);
  }));
  let id;
  await t.test('one exact review/audit, replay idempotent, cleanup keeps all old rows/history/catalog',async()=>{
   await auth();id=await call();assert.equal(await call(),id);await db.exec('reset role');assert.deepEqual(await snapshot(),before);
   assert.equal(await scalar("select count(*) from public.content_reviews where url_review_request_id=$1",[m.request_id]),1);assert.equal(await scalar("select count(*) from public.audit_events where details->>'request_id'=$1",[m.request_id]),1);
   await db.exec(pack.cleanup);await q('insert into supabase_migrations.schema_migrations values($1,$2,$3)',['synthetic-review-close',m.cleanup_migration_name,[pack.cleanup]]);await db.exec(pack.postflight);assert.deepEqual(await snapshot(),before);
   const state=(await db.exec(pack.state))[2].rows.find(r=>r.signature.startsWith('private.'));assert.equal(state.prosrc_sha256,state.expected_bound_prosrc_sha256);assert.equal(state.prosecdef,true);
   for(const role of ['anon','authenticated','service_role'])for(const f of entries)assert.equal(await scalar(`select has_function_privilege('${role}','${f}','execute')`),false);
   await auth();await assert.rejects(call());assert.equal(await scalar('select id from public.content_reviews where url_review_request_id=$1',[m.request_id]),id);
  });
 }finally{await db.close();}
});
const awaitTemplate=(await render(m)).opening;
