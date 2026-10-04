import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {baseline,checks,signature,reviewGrant,saveGrant,fixtures,ids,parent,request} from './fixture.mjs';
test('URL exact-version Review isolated SQL authority',async t=>{
 const db=await PGlite.create(),payload=(await fixtures())[0];
 const q=(s,a=[])=>db.query(s,a),scalar=async(s,a=[])=>Object.values((await q(s,a)).rows[0])[0];
 const auth=async(who=ids.owner)=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated');};
 const save=(n=20,v=0)=>scalar('select public.save_url_result_draft($1,$2,$3,$4,$5)',[ids.org,parent(20),request(n),v,JSON.stringify(payload)]);
 const review=(v,overrides={})=>{const a={org:ids.org,version:v.id,request:request(100),source:payload.snapshot.content_fingerprint,content:payload.review.content_digest,digest:v.first_result_request_digest,checks,...overrides};return scalar('select public.review_url_result($1,$2,$3,$4,$5,$6,$7)',[a.org,a.version,a.request,a.source,a.content,a.digest,JSON.stringify(a.checks)]);};
 const reject=async(fn,codes)=>{await db.exec('savepoint rejected');try{await assert.rejects(fn,e=>codes.includes(e.code));}finally{await db.exec('rollback to rejected;release rejected');}};
 const tx=async fn=>{await db.exec('reset role;begin');try{await auth();const id=await save(),v=(await q('select * from public.content_versions where id=$1',[id])).rows[0];await fn(v);}finally{await db.exec('rollback;reset role');}};
 const count=async()=>{await db.exec('reset role');return [await scalar('select count(*)::int from public.content_reviews'),await scalar("select count(*)::int from public.audit_events where event_type='url_result_reviewed'")];};
 try{
  await db.exec(await baseline());
  await t.test('default effective ACL closed for both RPCs; Save still closed',async()=>{
   for(const role of ['anon','authenticated','service_role'])for(const fn of ['public.review_url_result','private.review_url_result_impl'])assert.equal(await scalar(`select has_function_privilege('${role}','${fn}${signature}','execute')`),false);
   for(const fn of ['public.save_url_result_draft','private.save_url_result_draft_impl'])assert.equal(await scalar(`select has_function_privilege('authenticated','${fn}(uuid,uuid,uuid,integer,jsonb)','execute')`),false);
  });
  await db.exec(saveGrant+reviewGrant);
  await t.test('exact confirmation, idempotent request, one review + audit, immutable parent/payload',()=>tx(async v=>{
   const before=(await q('select * from public.growth_opportunities where id=$1',[parent(20)])).rows[0];const id=await review(v);assert.equal(await review(v),id);
   assert.deepEqual((await q('select * from public.content_versions where id=$1',[v.id])).rows[0],v);
   assert.deepEqual((await q('select * from public.growth_opportunities where id=$1',[parent(20)])).rows[0],before);
   const row=(await q('select * from public.content_reviews where id=$1',[id])).rows[0];assert.equal(row.version_id,v.id);assert.deepEqual(row.url_review_checks,checks);assert.equal(row.actor_user_id,ids.owner);
   await reject(()=>review(v,{request:request(101)}),['PT409']);assert.deepEqual(await count(),[1,1]);
   const audit=(await q("select * from public.audit_events where event_type='url_result_reviewed'")).rows[0];assert.equal(audit.details.review_id,id);assert.equal(audit.details.published,false);
  }));
  await t.test('viewer/editor/foreign and anonymous rejected; RLS same-org reads, no direct writes',()=>tx(async v=>{
   await review(v);
   for(const who of [ids.viewer,ids.editor,ids.foreign,'']){await auth(who);await reject(()=>review(v),['42501']);assert.equal(await scalar('select count(*)::int from public.content_reviews'),[ids.viewer,ids.editor].includes(who)?1:0);}
   await auth(ids.viewer);await reject(()=>q('delete from public.content_reviews'),['42501']);await auth(ids.owner2);await reject(()=>review(v),['22023']);
  }));
  await t.test('wrong UUID, tenant, source/content/version digest and missing/false/extra fact checks reject atomically',()=>tx(async v=>{
   for(const override of [{version:parent(99)},{org:ids.other},{request:null},{source:'sha256:'+'f'.repeat(64)},{content:'sha256:'+'f'.repeat(64)},{digest:'pg-jsonb-sha256:'+'f'.repeat(64)},{checks:null},{checks:{...checks,source:false}},{checks:{...checks,blocking_facts_clear:false}},{checks:{...checks,extra:true}},{checks:{title:true}}])await reject(()=>review(v,override),['42501','P0002','22023']);
   assert.deepEqual(await count(),[0,0]);
  }));
  await t.test('new latest never inherits old confirmation, stale confirm denied, exact replay history only',()=>tx(async v=>{
   const id=await review(v);const second=await save(21,1),v2=(await q('select * from public.content_versions where id=$1',[second])).rows[0];
   assert.equal(await scalar('select count(*)::int from public.content_reviews where version_id=$1',[second]),0);assert.equal(await review(v),id);
   await reject(()=>review(v,{request:request(101)}),['PT409']);await reject(()=>review(v2),['22023']);assert.notEqual(await review(v2,{request:request(101)}),id);assert.deepEqual(await count(),[2,2]);
  }));
  await t.test('legacy review guard cannot confer URL authority',()=>tx(async v=>{
   await reject(()=>q('select public.review_content_draft($1,$2,$3,$4)',[ids.org,v.id,'approved','bypass']),['23514']);assert.deepEqual(await count(),[0,0]);
  }));
  await t.test('audit failure rolls back review insert',()=>tx(async v=>{
   await db.exec("reset role;create function public.reject_url_review_audit() returns trigger language plpgsql as $$begin if new.event_type='url_result_reviewed' then raise exception 'synthetic audit failure';end if;return new;end$$;create trigger reject_url_review before insert on public.audit_events for each row execute function public.reject_url_review_audit();");await auth();await reject(()=>review(v),['P0001']);assert.deepEqual(await count(),[0,0]);
  }));
 }finally{await db.close();}
});
