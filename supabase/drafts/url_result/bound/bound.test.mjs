import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {frozen,renderBound} from './generate.mjs';
import {baselineSQL,legacyParent} from './baseline.mjs';
import {ids} from '../../first_result_save/fixtures.mjs';
const fixed={expiresAt:'2099-01-01T00:00:00Z',previewURL:'https://offline.invalid/workspace.html'};
test('bound candidate: fixed payload, authenticated RPC, minimal ACL and maximum 1/1/1',async t=>{
 const {manifest:m,payload,text}=await frozen(),pack=await renderBound(fixed),db=await PGlite.create();
 const q=(s,a=[])=>db.query(s,a),scalar=async(s,a=[])=>Object.values((await q(s,a)).rows[0])[0];
 const auth=async(actor=m.actor_id,role='authenticated')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role '+role);};
 const save=(changes={})=>{const p={...m,payload,...changes};return scalar('select public.save_url_result_draft($1,$2,$3,$4,$5)',[p.organization_id,p.opportunity_id,p.request_id,p.expected_version,JSON.stringify(p.payload)]);};
 const tx=async fn=>{await db.exec('reset role;begin');try{await fn();}finally{await db.exec('rollback;reset role');}};
 const reject=async(fn,codes)=>{await db.exec('savepoint rejection');try{await assert.rejects(fn,e=>codes.includes(e.code));}finally{await db.exec('rollback to rejection;release rejection');}};
 async function snapshot(exclude=false){await db.exec('reset role');const tables=(await q("select tablename from pg_tables where schemaname='public' order by tablename")).rows;const result={};for(const {tablename:name}of tables){let where='';if(exclude){if(name==='growth_opportunities')where=`where id<>'${m.opportunity_id}'`;if(name==='content_versions')where=`where first_result_request_id is distinct from '${m.request_id}'::uuid`;if(name==='audit_events')where=`where not(event_type='url_result_draft_saved' and details->>'request_id'='${m.request_id}')`;}
 result[name]=await scalar(`select coalesce(jsonb_agg(to_jsonb(t)${name==='growth_opportunities'?"-array['entry_kind','source_identity']":''} order by to_jsonb(t)::text),'[]') from public.${name} t ${where}`);}
 for(const name of ['model_trial','model_trial_attempts'])result[name]=await scalar(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from private.${name} t`);return result;}
 try{
  await db.exec(await baselineSQL({pglite:true}));const before=await snapshot();assert.equal(Object.keys(before).length,22);
  const history=await scalar('select jsonb_agg(to_jsonb(t) order by version) from supabase_migrations.schema_migrations t');assert.equal(history.length,19);
  await t.test('artifact is frozen; UTC and Preview must be explicit; 19-history precondition fails closed',async()=>{
   assert.deepEqual(JSON.parse(text),payload);assert.equal(pack.opening,await readFile(new URL('./offline-candidate/opening.sql',import.meta.url),'utf8'));
   await assert.rejects(renderBound({...fixed,expiresAt:null}));await assert.rejects(renderBound({...fixed,expiresAt:'2099-02-30T00:00:00Z'}));await assert.rejects(renderBound({...fixed,previewURL:'https://offline.invalid/workspace.html?override=1'}));
   await tx(async()=>{await db.exec("delete from supabase_migrations.schema_migrations where version='synthetic-1'");await reject(()=>db.exec(pack.opening),['P0001']);});
   assert.equal(await scalar("select count(*)::int from information_schema.columns where table_name='growth_opportunities' and column_name='entry_kind'"),0);
  });
  await db.exec(pack.opening);assert.deepEqual(await snapshot(),before);assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(t) order by version) from supabase_migrations.schema_migrations t'),history);
  // Only emulate history bookkeeping here; this is not a hosted atomicity claim.
  await db.exec("insert into supabase_migrations.schema_migrations values('synthetic-open','bound URL opening',array['offline runner'])");
  await t.test('exact request digest and minimal effective RPC/helper/trigger ACLs',async()=>{
   assert.equal(await scalar('select private.fr_request_digest($1,$2,$3,$4,0,$5)',[m.organization_id,m.opportunity_id,m.actor_id,m.request_id,JSON.stringify(payload)]),m.request_digest);
   const funcs=(await q("select p.oid,n.nspname,p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'fr_%' or p.proname like '%url%' or p.proname='save_first_result_draft_impl') or n.nspname='public' and p.proname in ('save_url_result_draft','save_first_result_draft')")).rows;
   for(const f of funcs)for(const role of ['anon','authenticated','service_role'])assert.equal(await scalar(`select has_function_privilege($1,$2,'EXECUTE')`,[role,f.oid]),role==='authenticated'&&['save_url_result_draft','save_url_result_draft_impl'].includes(f.proname),f.proname+'/'+role);
   for(const role of ['anon','authenticated','service_role'])assert.equal(await scalar("select has_table_privilege($1,'public.content_versions','INSERT')",[role]),false);
   assert.equal(await scalar("select has_function_privilege('authenticated','private.has_org_role(uuid,text[])','EXECUTE')"),true,'existing RLS helper stays callable');
  });
  await t.test('wrong actor/org/parent/request/payload/append and null/unauthorized callers add zero rows',()=>tx(async()=>{
   for(const [actor,role]of [[ids.owner2,'authenticated'],[ids.viewer,'authenticated'],[ids.editor,'authenticated'],[ids.foreign,'authenticated'],['','authenticated'],[m.actor_id,'anon'],[m.actor_id,'service_role']]){await auth(actor,role);await reject(()=>save(),['42501']);}
   await auth();for(const changes of [{organization_id:ids.other},{opportunity_id:legacyParent},{request_id:ids.owner2},{expected_version:1},{expected_version:null}])await reject(()=>save(changes),['42501']);
   await reject(()=>save({payload:{...payload,extra:'changed'}}),['22023']);
   await db.exec('reset role');assert.equal(await scalar('select count(*)::int from public.content_versions'),0);assert.equal(await scalar("select count(*)::int from public.growth_opportunities where entry_kind='url_result'"),0);
  }));
  await t.test('absolute expiry denies initial write and idempotent RPC replay',()=>tx(async()=>{
   await auth();const id=await save();await db.exec('reset role');const expired=await renderBound({...fixed,expiresAt:'2000-01-01T00:00:00Z'});await db.exec(expired.implementation);await auth();await reject(()=>save(),['42501']);assert.equal(await scalar('select count(*)::int from public.content_versions where id=$1',[id]),1);
  }));
  await t.test('return-time expiry rolls back parent/version/audit after slow audit write',()=>tx(async()=>{
   const deadline=new Date(Date.now()+1500).toISOString(),short=await renderBound({...fixed,expiresAt:deadline});await db.exec(short.implementation);
   await db.exec("create function public.slow_bound_audit() returns trigger language plpgsql as $$begin perform pg_sleep(2);return new;end$$;create trigger slow_bound_audit before insert on public.audit_events for each row execute function public.slow_bound_audit();");
   await auth();const start=Date.now();await reject(()=>save(),['42501']);assert.ok(Date.now()-start>=1900,'must reach slow audit, not just fail entry deadline');
   await db.exec('reset role');assert.equal(await scalar('select count(*)::int from public.content_versions'),0);assert.equal(await scalar("select count(*)::int from public.growth_opportunities where entry_kind='url_result'"),0);
  }));
  await t.test('real authenticated entry writes once, exact replay adds zero, cleanup retains rows and closes ACL',async()=>{
   await auth();assert.equal(await scalar('select current_user'),'authenticated');const id=await save();assert.equal(await save(),id);
   const row=(await q('select * from public.content_versions where organization_id=$1 and id=$2',[m.organization_id,id])).rows[0];assert.deepEqual(row.first_result_payload,payload);assert.equal(row.first_result_request_digest,m.request_digest);
   await auth(ids.foreign);assert.equal((await q('select id from public.content_versions where id=$1',[id])).rows.length,0);await auth();
   assert.equal(await scalar('select count(*)::int from public.content_versions'),1);await db.exec('reset role');assert.equal(await scalar("select count(*)::int from public.growth_opportunities where entry_kind='url_result'"),1);assert.equal(await scalar("select count(*)::int from public.audit_events where event_type='url_result_draft_saved'"),1);
   assert.deepEqual(await snapshot(true),before,'all legacy projections and ledger unchanged after excluding only 3 approved rows');
   await db.exec(pack.cleanup);await db.exec("insert into supabase_migrations.schema_migrations values('synthetic-close','bound URL cleanup',array['offline runner'])");
   for(const role of ['anon','authenticated','service_role'])for(const fn of ['public.save_url_result_draft','private.save_url_result_draft_impl'])assert.equal(await scalar(`select has_function_privilege('${role}','${fn}(uuid,uuid,uuid,integer,jsonb)','EXECUTE')`),false);
   await auth();await assert.rejects(save(),e=>e.code==='42501');assert.deepEqual((await q('select first_result_payload from public.content_versions where id=$1',[id])).rows[0].first_result_payload,payload);
   await db.exec('reset role');assert.equal(await scalar('select count(*)::int from supabase_migrations.schema_migrations'),21);assert.deepEqual(await scalar("select jsonb_agg(to_jsonb(t) order by version) from supabase_migrations.schema_migrations t where version not in ('synthetic-open','synthetic-close')"),history);assert.deepEqual(await snapshot(true),before);
  });
 }finally{await db.close();}
});
