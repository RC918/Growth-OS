import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {fixtures,ids,parent,request,bootstrapSQL,seedSQL} from './fixtures.mjs';
import {evidenceMutations} from './evidence-mutations.mjs';
import {urlCases,jsURLAllowed,rebind} from './url-cases.mjs';
import {contentDigest,createResultReview,reviewFields} from '../../../apps/web/first-result-review.mjs';
import {createFirstResultSaveIntent} from '../../../prototype/public-audit/first-result-save-intent.mjs';

test('undeployed first-result SQL on isolated PGlite (synthetic Auth, no concurrent-session claim)',async t=>{
 const db=await PGlite.create();let reports;
 const q=(sql,args=[])=>db.query(sql,args);
 const scalar=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
 const auth=async(user=ids.owner,role='authenticated')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);await db.exec(`set role ${role}`);};
 const save=(payload=reports[0],{org=ids.org,op=parent(1),req=request(1),expected=1,fn='public.save_first_result_draft'}={})=>scalar(`select ${fn}($1,$2,$3,$4,$5::jsonb)`,[org,op,req,expected,JSON.stringify(payload)]);
 const reject=async(operation,codes)=>{
  await db.exec('savepoint rejection');
  try {await assert.rejects(operation,e=>[].concat(codes).includes(e.code));}finally{await db.exec('rollback to savepoint rejection;release savepoint rejection');}
 };
 const tx=async(body)=>{await db.exec('reset role;begin');try{await body();}finally{await db.exec('rollback;reset role');}};
 async function protectedRows(){
  await db.exec('reset role');const out={};
  for(const {tablename} of (await q("select tablename from pg_tables where schemaname='public' order by tablename")).rows){
   const projection=tablename==='content_versions'?"to_jsonb(t)-array['first_result_payload','first_result_request_id','first_result_expected_version','first_result_request_digest']":"to_jsonb(t)";
   out[tablename]=await scalar(`select coalesce(jsonb_agg(${projection} order by id),'[]') from public.${tablename} t`.replace('order by id',tablename==='organization_members'?'order by organization_id,user_id':'order by id'));
  }
  out.ledger=(await q('select to_jsonb(t) as row from private.model_trial t')).rows;
  out.attempts=(await q('select to_jsonb(t) as row from private.model_trial_attempts t')).rows;
  return out;
 }
 try{
  await db.exec(bootstrapSQL);
  for(const name of (await readdir(new URL('../../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()){
   await db.exec((await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));
  }
  await db.exec(seedSQL);await auth();
  const legacy=await scalar('select public.create_content_draft($1,$2,$3,$4)',[ids.org,parent(1),'Original legacy title','Original body']);
  await scalar('select public.review_content_draft($1,$2,$3,$4)',[ids.org,legacy,'approved','Synthetic legacy approval']);
  const before=await protectedRows();assert.equal(Object.keys(before).length,22);assert.equal(before.growth_goal_turns.length,13);
  const proposal=await readFile(new URL('./proposal.sql',import.meta.url),'utf8');
  const originalReview=await scalar("select pg_get_functiondef('private.review_content_draft_impl(uuid,uuid,text,text)'::regprocedure)");
  await t.test('uncommitted candidate DDL rolls back with no columns, RPC or review change',async()=>{
   await db.exec('begin');
   try{await db.exec(proposal.replace(/^begin;$/m,'').replace(/^commit;$/m,''));}finally{await db.exec('rollback');}
   assert.equal(await scalar("select count(*)::int from information_schema.columns where table_schema='public' and table_name='content_versions' and column_name like 'first_result_%'"),0);
   assert.equal(await scalar("select count(*)::int from pg_proc where proname='save_first_result_draft'"),0);
   assert.equal(await scalar("select pg_get_functiondef('private.review_content_draft_impl(uuid,uuid,text,text)'::regprocedure)"),originalReview);
   assert.deepEqual(await protectedRows(),before);
  });
  await db.exec(proposal);
  reports=await fixtures();
  await t.test('candidate DDL compiles and preserves 20 business tables, 13 history rows and ledger',async()=>{
   assert.deepEqual(await protectedRows(),before);
   assert.equal(await scalar("select count(*)::int from pg_tables where schemaname='public'"),20);
   assert.equal(await scalar("select count(*)::int from public.content_versions where first_result_payload is not null"),0);
  });
  await t.test('real synthetic builder payloads roundtrip exactly; source/content/request hashes remain distinct',()=>tx(async()=>{
   await auth();
   for(let i=0;i<reports.length;i++){
    const id=await save(reports[i],{expected:i+1,req:request(i+1)});
    const row=(await q('select * from public.content_versions where organization_id=$1 and id=$2',[ids.org,id])).rows[0];
    assert.deepEqual(row.first_result_payload,reports[i]);assert.equal(row.title,reports[i].preview.fields.title.suggested);assert.equal(row.draft_body,reports[i].preview.fields.description.suggested);
    assert.match(row.first_result_request_digest,/^pg-jsonb-sha256:[0-9a-f]{64}$/);
    assert.notEqual(row.first_result_request_digest,reports[i].review.content_digest);
    if(i===2){assert.equal(row.title.length,2000);assert.ok(row.first_result_payload.review.original_suggestions.description.length>2000);}
    const audit=(await q("select details from public.audit_events where object_id=$1 and event_type='first_result_draft_saved'",[id])).rows;
    assert.equal(audit.length,1);assert.equal(audit[0].details.source_digest,reports[i].snapshot.content_fingerprint);assert.equal(audit[0].details.content_digest,reports[i].review.content_digest);assert.equal(audit[0].details.approval,'none');
   }
   const unconfirmed=structuredClone(reports[0]);unconfirmed.review.confirmation=null;unconfirmed.preview.status='awaiting_review';unconfirmed.review.fact_checks={title:false,meta_description:false,description:false};
   const draftId=await save(unconfirmed,{req:request(9),expected:reports.length+1});
   assert.deepEqual((await q('select first_result_payload from public.content_versions where id=$1',[draftId])).rows[0].first_result_payload,unconfirmed);
  }));
  await t.test('SQL nonempty text agrees with JS trim including v and vertical tab',()=>tx(async()=>{
   const whitespace=[9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279].map(n=>String.fromCodePoint(n));
   const values=['v',' vv ','V','vowel','',...whitespace,whitespace.join(''),...whitespace.map(w=>w+'v'+w)];
   const mismatches=[];
   for(const text of values){const actual=await scalar('select private.fr_text($1::jsonb)',[JSON.stringify(text)]);if(actual!==(text.trim().length>0))mismatches.push({text,actual,expected:text.trim().length>0});}
   assert.deepEqual(mismatches,[]);
  }));
  await t.test('fully rebound current text accepts v unchanged and rejects whitespace-only VT',()=>tx(async()=>{
   await auth();let expected=1;
   for(const title of ['v',' vv ','\u000B']){
    const session=createResultReview(reports[0]);session.edit('title',title);const report=await session.export();
    if(title.trim().length){const id=await save(report,{req:request(40+expected),expected:expected++});assert.equal(await scalar('select title from public.content_versions where id=$1',[id]),title);}
    else await reject(()=>save(report,{req:request(49),expected}),'22023');
   }
  }));
  await t.test('authority/port differential agrees with accepted JS and rejects fully rebound malformed URLs',()=>tx(async()=>{
   const mismatches=[];let expected=1;
   for(const [url,allowed] of urlCases){
    assert.equal(jsURLAllowed(url),allowed,url);
    await db.exec('reset role');const actual=await scalar('select private.fr_url($1::jsonb)',[JSON.stringify(url)]);
    if(actual!==allowed)mismatches.push({url,actual,expected:allowed});
    const report=await rebind(reports[0],url,contentDigest),v=report.review;
    const pure=await createFirstResultSaveIntent(report,{schema_version:1,fixture_only:true,organization_id:ids.org,opportunity_id:parent(1),request_id:request(50),expected_version:1,role:'owner',opportunity_status:'approved',has_source:true,has_approved_decision:true,mapped_source:{original_url:url,final_url:url,snapshot_id:v.snapshot_id,source_version:v.source_version},expected_review_revision:v.revision,expected_content_digest:v.content_digest});
    assert.equal(pure.status,allowed?'candidate':'invalid',url);
    // Execute all rebinding cases even if the helper is wrong, collecting failures.
    await auth();await db.exec('savepoint url_case');let saved=false;
    try{await save(report,{req:request(100+expected),expected:1});saved=true;}catch(e){if(e.code!=='22023')throw e;}finally{await db.exec('rollback to savepoint url_case;release savepoint url_case');}
    if(saved!==allowed)mismatches.push({url,rpc_saved:saved,expected:allowed});expected++;
   }
   assert.deepEqual(mismatches,[]);
  }));
  await t.test('PostgreSQL UTF-8 replacement/BOM and UTF-16 length agree with independent JS decoding',()=>tx(async()=>{
   const vectors=[[239,187,191,65],[240,159,167,170],[224,128,128],[237,160,128],[244,144,128,128],[240,159],[194],[255],[226,130,65]];
   for(let lead=1;lead<256;lead++)vectors.push([lead,128,191,65]);
   for(const values of vectors){
    const bytes=Uint8Array.from(values),expected=new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes);
    assert.deepEqual(await scalar("select jsonb_build_object('text',private.fr_decode_utf8(decode($1,'hex')))",[Buffer.from(bytes).toString('hex')]),{text:expected});
    assert.equal(await scalar('select private.fr_utf16_length($1)',[expected]),expected.length);
   }
   await reject(()=>q("select private.fr_decode_utf8(decode('00','hex'))"),'22023');
  }));
  await t.test('schema omissions, hash tamper, stale confirmation, oversized current text and Unicode representation are rejected',()=>tx(async()=>{
   await auth();
   const changes=[r=>delete r.inferences,r=>delete r.missing,r=>delete r.facts.features,r=>delete r.preview.pending_confirmation,
    r=>r.facts.title.kind='inference',r=>r.snapshot.content_fingerprint='sha256:'+'0'.repeat(64),r=>r.snapshot.html+='x',r=>r.snapshot.citations[0].source_version='x',
    r=>r.review.content_digest='wrong',r=>r.review.confirmation.revision++,r=>r.review.fact_checks.title=false,r=>r.preview.fields.title.suggested='🔩'.repeat(1001),
    r=>r.preview.fields.description.suggested='\uFEFF\u00A0',r=>r.preview.fields.title.user_edited=false,r=>r.preview.published=true,
    r=>r.review.confirmation.scope='owner_approved',r=>r.organization_id=ids.other,r=>r.extra='x'.repeat(8388608),r=>r.extra=Array(50001).fill(1),r=>{let n=r;for(let i=0;i<30;i++){n.extra={};n=n.extra;}}];
   for(const change of changes){const r=structuredClone(reports[0]);change(r);await reject(()=>save(r),'22023');}
   const nul=structuredClone(reports[0]);nul.preview.fields.title.suggested='x\u0000y';await reject(()=>save(nul),['22P05','22023']);
   assert.equal(await scalar('select count(*)::int from public.content_versions'),1);
  }));
  await t.test('all 114 producer evidence deletion/type regressions are denied by SQL',()=>tx(async()=>{
   await auth();const cases=evidenceMutations();assert.equal(cases.length,114);
   for(const [name,change] of cases){
    const report=structuredClone(reports[0]);change(report);
    try{await reject(()=>save(report),['22023','22032','22001']);}catch(e){throw Error(name,{cause:e});}
   }
   assert.equal(await scalar('select count(*)::int from public.content_versions'),1);
  }));
  await t.test('owner gates, revoked membership, other roles and cross-tenant access fail closed',()=>tx(async()=>{
   for(const user of [ids.viewer,ids.editor,ids.foreign]){await auth(user);await reject(()=>save(),'42501');}
   await auth(null,'anon');await reject(()=>save(),'42501');await reject(()=>q('select * from public.content_versions'),'42501');
   await auth();for(const n of [3,4,5])await reject(()=>save(reports[0],{op:parent(n),expected:0}),'23514');
   await reject(()=>save(reports[0],{op:parent(6),expected:0}),'P0002');await reject(()=>save(reports[0],{org:ids.other,op:parent(6),expected:0}),'42501');
   const id=await save();
   await db.exec('reset role');await q("update public.growth_opportunities set status='candidate' where id=$1",[parent(1)]);await auth();await reject(()=>save(),'23514');
   await db.exec('reset role');await q("update public.growth_opportunities set status='approved' where id=$1",[parent(1)]);await auth(ids.viewer);assert.deepEqual((await q('select first_result_payload from public.content_versions where id=$1',[id])).rows[0].first_result_payload,reports[0]);
   await auth(ids.foreign);assert.equal((await q('select * from public.content_versions where id=$1',[id])).rows.length,0);
   await db.exec('reset role');await q('delete from public.organization_members where organization_id=$1 and user_id=$2',[ids.org,ids.owner]);await auth();
   await reject(()=>save(),'42501');assert.equal((await q('select * from public.content_versions')).rows.length,0);
  }));
  await t.test('request identity binds actor/parent/payload/expected; retries append one version and audit',()=>tx(async()=>{
   await auth();const id=await save();assert.equal(await save(),id);
   await save(reports[1],{req:request(2),expected:2});assert.equal(await save(),id,'retry survives newer version');
   const altered=structuredClone(reports[0]);altered.snapshot.citations[0].quote+='caller changed quote';
   await reject(()=>save(altered),'22023');await reject(()=>save(reports[0],{op:parent(2)}),'22023');await reject(()=>save(reports[0],{expected:2}),'22023');
   await auth(ids.owner2);await reject(()=>save(),'22023');await auth();await reject(()=>save(reports[0],{req:request(3),expected:1}),'PT409');
   assert.equal(await scalar("select count(*)::int from public.content_versions where first_result_request_id=$1",[request(1)]),1);
   assert.equal(await scalar("select count(*)::int from public.audit_events where event_type='first_result_draft_saved' and details->>'request_id'=$1",[request(1)]),1);
  }));
  await t.test('audit failure rolls back the appended version and leaves the request reusable',()=>tx(async()=>{
   await db.exec(`create function private.reject_fixture_audit() returns trigger language plpgsql as $$begin if new.event_type='first_result_draft_saved' then raise exception 'Synthetic audit failure' using errcode='P0001'; end if; return new; end $$;
    create trigger fixture_audit_failure before insert on public.audit_events for each row execute function private.reject_fixture_audit();`);
   await auth();await reject(()=>save(),'P0001');assert.equal(await scalar('select count(*)::int from public.content_versions'),1);
   await db.exec('reset role;drop trigger fixture_audit_failure on public.audit_events');await auth();await save();
   assert.equal(await scalar("select count(*)::int from public.audit_events where event_type='first_result_draft_saved'"),1);
  }));
  await t.test('typed public/private generic review denied; legacy creation/review and common sequence retained',()=>tx(async()=>{
   await auth();const typed=await save();
   for(const fn of ['public.review_content_draft','private.review_content_draft_impl'])await reject(()=>q(`select ${fn}($1,$2,'approved','Synthetic reason')`,[ids.org,typed]),'23514');
   await reject(()=>q('select public.plan_content_action($1,$2,$3,$4,$5)',[ids.org,typed,'/synthetic','signal','rollback']),'23514');
   await reject(()=>q('select public.create_content_draft($1,$2,$3,$4)',[ids.org,parent(1),'x'.repeat(161),'body']),'22023');
   const next=await scalar('select public.create_content_draft($1,$2,$3,$4)',[ids.org,parent(1),'legacy next','body']);
   assert.equal(await scalar('select version_number from public.content_versions where id=$1',[next]),3);
   await q("select public.review_content_draft($1,$2,'approved','Legacy review still works')",[ids.org,next]);
   assert.equal(await scalar('select count(*)::int from public.content_reviews where version_id=$1',[typed]),0);
   await reject(()=>save(reports[0],{req:request(3),expected:2}),'PT409');
  }));
  await t.test('ACLs, direct writes, discriminator constraints and closed helper permissions',()=>tx(async()=>{
   await auth();for(const sql of ["update public.content_versions set title='tamper'","delete from public.content_versions","insert into public.content_versions(organization_id,opportunity_id,version_number,title,draft_body,created_by) values('"+ids.org+"','"+parent(1)+"',2,'x','x','"+ids.owner+"')"]){await reject(()=>db.exec(sql),'42501');}
   await reject(()=>q('select private.fr_valid_payload($1::jsonb)',[JSON.stringify(reports[0])]),'42501');
   await db.exec('reset role');
   for(const role of ['anon','service_role'])assert.equal(await scalar("select has_function_privilege($1,'public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb)','EXECUTE')",[role]),false);
   assert.equal(await scalar("select prosecdef from pg_proc where oid='public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb)'::regprocedure"),false);
   assert.equal(await scalar("select relrowsecurity from pg_class where oid='public.content_versions'::regclass"),true);
   await reject(()=>q('insert into public.content_versions(organization_id,opportunity_id,version_number,title,draft_body,created_by) values($1,$2,2,$3,$4,$5)',[ids.org,parent(1),'x'.repeat(161),'body',ids.owner]),'23514');
   await reject(()=>q('insert into public.content_versions(organization_id,opportunity_id,version_number,title,draft_body,created_by,first_result_request_id) values($1,$2,2,$3,$4,$5,$6)',[ids.org,parent(1),'x','body',ids.owner,request(1)]),'23514');
  }));
  await t.test('write deactivation preserves typed payloads and review guard',()=>tx(async()=>{
   await auth();const id=await save();await db.exec('reset role');await db.exec(await readFile(new URL('./disable_writes.sql',import.meta.url),'utf8'));await auth();
   await reject(()=>save(reports[0],{req:request(2),expected:2}),'42501');
   assert.deepEqual((await q('select first_result_payload from public.content_versions where id=$1',[id])).rows[0].first_result_payload,reports[0]);
   await reject(()=>q("select public.review_content_draft($1,$2,'approved','No bypass')",[ids.org,id]),'23514');
  }));
  await t.test('all isolated mutation groups rolled back; original business/history/ledger unchanged',async()=>assert.deepEqual(await protectedRows(),before));
 }finally{await db.close();}
});
