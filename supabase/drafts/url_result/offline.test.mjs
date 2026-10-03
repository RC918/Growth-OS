import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {fixtures,ids,parent,request,bootstrapSQL,seedSQL} from '../first_result_save/fixtures.mjs';

test('URL result offline SQL: real constraints/RPC/RLS, synthetic Auth',async t=>{
 const db=await PGlite.create(),q=(s,a=[])=>db.query(s,a),scalar=async(s,a=[])=>Object.values((await q(s,a)).rows[0])[0];
 const auth=async(who=ids.owner)=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated');};
 const payload=(await fixtures())[0];
 const save=(op=parent(20),req=request(20),v=0,p=payload,org=ids.org)=>scalar('select public.save_url_result_draft($1,$2,$3,$4,$5)',[org,op,req,v,JSON.stringify(p)]);
 const reject=async(fn,codes)=>{await db.exec('savepoint refusal');try{await assert.rejects(fn,e=>codes.includes(e.code));}finally{await db.exec('rollback to refusal;release refusal');}};
 const tx=async(fn)=>{await db.exec('reset role;begin');try{await fn();}finally{await db.exec('rollback;reset role');}};
 try {
  await db.exec(bootstrapSQL);
  for(const f of (await readdir(new URL('../../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())await db.exec((await readFile(new URL('../../migrations/'+f,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));
  await db.exec(seedSQL);
  await db.exec(await readFile(new URL('../first_result_save/proposal.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../first_result_save/disable_writes.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('./proposal.sql',import.meta.url),'utf8'));
  await t.test('new and old Save client ACLs closed; existing legacy rows retained; no profile',async()=>{
   for(const fn of ['public.save_url_result_draft','private.save_url_result_draft_impl','public.save_first_result_draft','private.save_first_result_draft_impl'])for(const role of ['anon','authenticated','service_role'])assert.equal(await scalar(`select has_function_privilege('${role}','${fn}(uuid,uuid,uuid,integer,jsonb)','execute')`),false);
   assert.equal(await scalar("select attnotnull from pg_attribute where attrelid='public.growth_opportunities'::regclass and attname='entry_kind'"),true);
   assert.equal(await scalar('select count(*)::int from public.business_profiles'),0);
   assert.equal(await scalar("select count(*)::int from public.growth_opportunities where entry_kind='legacy_opportunity'"),6);
  });
  // Test-only grants in disposable DB. Never in candidate or browser runtime.
  await db.exec('grant execute on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated');
  await t.test('no-profile owner first/append/idempotency/full readback and exact row budget',()=>tx(async()=>{
   await auth();const id=await save();assert.equal(await save(),id);
   let rows=(await q('select * from public.content_versions where id=$1',[id])).rows;assert.deepEqual(rows[0].first_result_payload,payload);
   const id2=await save(parent(20),request(21),1);assert.notEqual(id2,id);
   await db.exec('reset role');assert.equal(await scalar("select count(*)::int from public.growth_opportunities where entry_kind='url_result'"),1);
   assert.equal(await scalar('select count(*)::int from public.content_versions'),2);
   const audits=(await q("select details from public.audit_events where event_type='url_result_draft_saved' order by details->>'version_number'")).rows;
   assert.equal(audits.length,2);assert.equal(audits[0].details.created_parent,true);assert.equal(audits[1].details.created_parent,false);
   for(const a of audits){assert.equal(a.details.approval,'none');assert.equal(a.details.provenance,'caller_supplied_unverified');}
   assert.equal(await scalar('select count(*)::int from public.business_profiles'),0);
   assert.equal(await scalar('select count(*)::int from public.opportunity_sources'),5);assert.equal(await scalar('select count(*)::int from public.opportunity_decisions'),5);
  }));
  await t.test('role/tenant/membership rejection and member-only RLS',()=>tx(async()=>{
   await auth();const id=await save();
   for(const who of [ids.viewer,ids.editor,ids.foreign,'']){await auth(who);await reject(()=>save(parent(21),request(21)),['42501']);}
   await auth(ids.foreign);assert.equal((await q('select id from public.content_versions where id=$1',[id])).rows.length,0);
   for(const who of [ids.viewer,ids.editor]){await auth(who);assert.equal((await q('select id from public.content_versions where id=$1',[id])).rows.length,1);}
   await db.exec('reset role');await q('delete from public.organization_members where user_id=$1',[ids.owner]);await auth();await reject(()=>save(parent(21),request(21)),['42501']);
  }));
  await t.test('legacy/UUID/source/request/version collisions reject without partial parent',()=>tx(async()=>{
   await auth();await reject(()=>save(parent(1)),['23514']);await reject(()=>save(parent(6)),['23505']);
   await reject(()=>save(parent(20),request(20),1),['PT409']);await save();
   await reject(()=>save(parent(20),request(21),0),['PT409']);await reject(()=>save(parent(20),request(21),9),['PT409']);
   await reject(()=>save(parent(21),request(20)),['22023']);
   const changed=structuredClone(payload);changed.review.confirmation=null;changed.preview.status='awaiting_review';
   await reject(()=>save(parent(20),request(20),0,changed),['22023']);
   const fresh=(await fixtures())[1];await reject(()=>save(parent(20),request(21),1,fresh),['23514']);
   await reject(()=>save(parent(22),request(22),0,{}),['22023']);
   assert.equal(await scalar("select count(*)::int from public.growth_opportunities where entry_kind='url_result'"),1);
  }));
  await t.test('every legacy mutation rejects URL parent/version, including old typed Save',()=>tx(async()=>{
   await auth();const id=await save();
   await db.exec('reset role;grant execute on function public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_first_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated');await auth();
   for(const [sql,args] of [
    ['select public.review_growth_opportunity($1,$2,$3,$4)',[ids.org,parent(20),'approved','reason']],
    ['select public.create_content_draft($1,$2,$3,$4)',[ids.org,parent(20),'title','body']],
    ['select public.review_content_draft($1,$2,$3,$4)',[ids.org,id,'approved','reason']],
    ['select public.plan_content_action($1,$2,$3,$4,$5)',[ids.org,id,'/p','signal','rollback']],
    ['select public.save_first_result_draft($1,$2,$3,$4,$5)',[ids.org,parent(20),request(21),1,JSON.stringify(payload)]]
   ])await reject(()=>q(sql,args),['23514']);
   const legacy=await scalar('select public.create_content_draft($1,$2,$3,$4)',[ids.org,parent(1),'Legacy','Body']);
   await q('select public.review_content_draft($1,$2,$3,$4)',[ids.org,legacy,'approved','reason']);
   await q('select public.plan_content_action($1,$2,$3,$4,$5)',[ids.org,legacy,'/legacy','signal','rollback']);
   await q('select public.save_first_result_draft($1,$2,$3,$4,$5)',[ids.org,parent(1),request(40),1,JSON.stringify(payload)]);
   await reject(()=>save(parent(1),request(40),1),['22023']);
   await reject(()=>q('select public.create_growth_opportunity($1,null,$2,$3,$4,$5,$6,$7)',[ids.org,'organic_search','need','action','reason','owner_question','note']),['23514']);
  }));
  await t.test('all legacy subtype guards authorize before any URL/legacy/missing lookup',()=>tx(async()=>{
   await auth();const urlId=await save();
   const legacyId=await scalar('select public.create_content_draft($1,$2,$3,$4)',[ids.org,parent(1),'Legacy','Body']);
   await db.exec('reset role;grant execute on function public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_first_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated');
   await q('delete from public.organization_members where user_id=$1',[ids.owner2]);
   const mismatches=[];
   for(const [actor,label] of [[ids.foreign,'foreign tenant'],[ids.owner2,'revoked owner'],[ids.editor,'editor'],[ids.viewer,'viewer'],['','null actor']]){
    await auth(actor);
    for(const [target,op,version] of [['url',parent(20),urlId],['legacy',parent(1),legacyId],['missing',parent(99),parent(99)]]){
     for(const [fn,args] of [
      ['review_growth_opportunity',[ids.org,op,'approved','reason']],
      ['create_content_draft',[ids.org,op,'title','body']],
      ['review_content_draft',[ids.org,version,'approved','reason']],
      ['plan_content_action',[ids.org,version,'/p','signal','rollback']],
      ['save_first_result_draft',[ids.org,op,request(60),1,JSON.stringify(payload)]]]){
      await db.exec('savepoint oracle');let code='accepted';
      try{await q(`select public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);}catch(e){code=e.code;}
      finally{await db.exec('rollback to oracle;release oracle');}
      if(code!=='42501')mismatches.push({actor:label,target,fn,code});
     }
    }
   }
   assert.deepEqual(mismatches,[], '75 unauthorized actor/target/RPC combinations must all return 42501');
  }));
  await t.test('direct writes cannot bypass NULL legacy shape, immutable identity or URL payload binding',()=>tx(async()=>{
   for(const column of ['channel','audience_need','proposed_action','rationale'])await reject(()=>q(`update public.growth_opportunities set ${column}=null where id=$1`,[parent(1)]),['23514']);
   await reject(()=>q('update public.growth_opportunities set entry_kind=null where id=$1',[parent(1)]),['23514']);
   await reject(()=>q("update public.growth_opportunities set status='url_pending_review' where id=$1",[parent(1)]),['23514']);
   await auth();const id=await save();await db.exec('reset role');
   await reject(()=>q("update public.growth_opportunities set audience_need='fake legacy need' where id=$1",[parent(20)]),['23514']);
   for(const [column,value] of [['entry_kind','legacy_opportunity'],['organization_id',ids.other],['status','approved']])await reject(()=>q(`update public.growth_opportunities set ${column}=$1 where id=$2`,[value,parent(20)]),['23514']);
   await reject(()=>q("update public.growth_opportunities set source_identity='{}' where id=$1",[parent(20)]),['23514']);
   await reject(()=>q('insert into public.content_versions(organization_id,opportunity_id,version_number,title,draft_body,created_by) values($1,$2,2,$3,$4,$5)',[ids.org,parent(20),'Legacy','Body',ids.owner]),['23514']);
   const other=(await fixtures())[1];
   await reject(()=>q('update public.content_versions set first_result_payload=$1 where id=$2',[JSON.stringify(other),id]),['23514']);
  }));
  await t.test('audit failure rolls back new parent and version together',()=>tx(async()=>{
   await db.exec("create function public.fail_url_audit() returns trigger language plpgsql as $$begin raise exception 'audit unavailable'; end$$;create trigger fail_url_audit before insert on public.audit_events for each row execute function public.fail_url_audit();");
   await auth();await reject(()=>save(),['P0001']);assert.equal(await scalar("select count(*)::int from public.growth_opportunities where entry_kind='url_result'"),0);assert.equal(await scalar('select count(*)::int from public.content_versions'),0);
  }));
 } finally {await db.close();}
});
