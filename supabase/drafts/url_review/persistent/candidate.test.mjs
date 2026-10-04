import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {baseline} from '../bound/fixture.mjs';
import {manifest as fixedManifest,checks} from '../bound/candidate.mjs';
import {root,render,sha,entries,saves} from './candidate.mjs';
import {createWorkspaceApi} from '../../../../apps/web/workspace-api.mjs';
import {createRevisionMarker} from '../../../../apps/web/url-result-trial-marker.mjs';
const pack=await render(),m=await fixedManifest();
test('persistent deployment lifecycle on historical closed baseline; normal SQL authority only',async t=>{
 const db=await PGlite.create(),q=(s,a=[])=>db.query(s,a),scalar=async(s,a=[])=>Object.values((await q(s,a)).rows[0])[0];
 const auth=async(actor=m.actor_id)=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role authenticated');};
 const review=(request=randomUUID())=>scalar('select public.review_url_result($1,$2,$3,$4,$5,$6,$7)',[m.organization_id,m.version_id,request,m.source_digest,m.content_digest,m.version_digest,JSON.stringify(checks)]);
 const snapshot=async()=>{await db.exec('reset role');return(await db.exec(pack['preservation.sql'])).map(r=>r.rows);};
 const tx=async fn=>{await db.exec('reset role;begin');try{await fn();}finally{await db.exec('rollback;reset role');}};
 const reject=async fn=>{await db.exec('savepoint rejected');try{await assert.rejects(fn);}finally{await db.exec('rollback to rejected;release rejected');}};
 try{
  await db.exec(await baseline({pglite:true}));await db.exec('grant all on public.audit_events to service_role');let before=await snapshot();
  await t.test('audit-only revoke removes demonstrated TRUNCATE bypass, preserves SELECT/RLS/service_role/data',async()=>{
   const count=await scalar('select count(*) from public.audit_events');assert.ok(count>0);
   for(const role of ['anon','authenticated'])await tx(async()=>{await db.exec('set role '+role);await db.exec('truncate public.audit_events');await db.exec('reset role');assert.equal(await scalar('select count(*) from public.audit_events'),0);});
   assert.deepEqual(await snapshot(),before);await assert.rejects(db.exec(pack['preflight.sql']),/Audit effective write/);
   await db.exec(pack['audit-revoke.sql']);await db.exec(pack['audit-postflight.sql']);assert.deepEqual(await snapshot(),before);
   for(const role of ['anon','authenticated']){
    await auth();await db.exec('set role '+role);
    for(const statement of ["insert into public.audit_events(organization_id,actor_user_id,event_type,object_type,object_id) values('"+m.organization_id+"','"+m.actor_id+"','test','test','"+m.version_id+"')",'update public.audit_events set event_type=event_type where false','delete from public.audit_events where false','truncate public.audit_events'])await assert.rejects(db.exec(statement),e=>e.code==='42501');
    assert.equal(await scalar("select has_table_privilege(current_user,'public.audit_events','SELECT')"),true);if(role==='authenticated')assert.ok(await scalar('select count(*) from public.audit_events')>0);
   }
   assert.deepEqual(await snapshot(),before);
   // Simulate only the tracked wrapper's new history row; preserve all original 23 rows.
   const history=(await q('select * from supabase_migrations.schema_migrations order by version')).rows;
   await q('insert into supabase_migrations.schema_migrations values($1,$2,$3)',['synthetic-audit-revoke','url_review_persistent_audit_revoke',[pack['audit-revoke.sql']]]);
   assert.deepEqual((await q("select * from supabase_migrations.schema_migrations where version<>'synthetic-audit-revoke' order by version")).rows,history);before=await snapshot();
  });
  await t.test('exact artifact hashes, untouched runtime; install closed and zero business/catalog delta',async()=>{
   const hashes=JSON.parse(await readFile(new URL('hashes.json',root),'utf8'));for(const [f,h]of Object.entries(hashes))assert.equal(sha(await readFile(new URL(f,root))),h,f);for(const [f,b]of Object.entries(pack))assert.equal(await readFile(new URL(f,root),'utf8'),b,f);
   for(const file of ['apps/web/url-result-config.mjs','prototype/owner-workspace/url-result-config.mjs'])assert.equal(sha(await readFile(file)),'fe8bfa6ea7070d89059fa591ed68aec11624a4b4553b380589071473f0bcf38b');
   await db.exec(pack['preflight.sql']);await db.exec(pack['install-closed.sql']);await db.exec(pack['postflight-closed.sql']);assert.deepEqual(await snapshot(),before);await assert.rejects(db.exec(pack['install-closed.sql']),/already installed/);
   await auth();await assert.rejects(review(),e=>e.code==='42501');
  });
  await t.test('enable/disable/restore change only intended ACL, Save always closed; body/RLS/table/ACL drift refuses restore',async()=>{
   await db.exec('reset role');await db.exec(pack['enable.sql']);await db.exec(pack['postflight-enabled.sql']);assert.deepEqual(await snapshot(),before);
   for(const role of ['anon','authenticated','service_role'])for(const f of saves)assert.equal(await scalar(`select has_function_privilege($1,$2,'execute')`,[role,f]),false);
   await db.exec(pack['disable.sql']);await db.exec(pack['postflight-closed.sql']);assert.deepEqual(await snapshot(),before);
   for(const drift of ["alter function public.review_url_result(uuid,uuid,uuid,text,text,text,jsonb) security definer","alter table public.content_reviews disable row level security","grant insert on public.content_reviews to authenticated",`grant execute on function ${entries[0]} to anon`,`grant execute on function ${saves[2]} to authenticated`,...['INSERT','UPDATE','DELETE','TRUNCATE'].map(p=>`grant ${p} on public.audit_events to authenticated`),'grant TRUNCATE on public.audit_events to PUBLIC'])await tx(async()=>{await db.exec(drift);await reject(()=>db.exec(pack['restore.sql']));await reject(()=>db.exec(pack['enable.sql']));if(drift.includes('public.audit_events')){await reject(()=>db.exec(pack['postflight-closed.sql']));await reject(()=>db.exec(pack['postflight-enabled.sql']));}assert.equal(await scalar(`select has_function_privilege('authenticated',$1,'execute')`,[entries[1]]),false);});
   await db.exec(pack['restore.sql']);await db.exec(pack['postflight-enabled.sql']);assert.deepEqual(await snapshot(),before);
  });
  await t.test('scope is not fixed actor/request: another same-org Owner accepted; viewer and foreign denied',()=>tx(async()=>{
   const second='10000000-0000-4000-8000-000000000004';await q("insert into public.organization_members(organization_id,user_id,role) values($1,$2,'owner') on conflict do nothing",[m.organization_id,second]);await auth(second);await review();
   for(const actor of ['10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000007']){await auth(actor);await reject(()=>review());}
  }));
  await t.test('unknown committed request survives disabled and restored configs; GET-only, immutable review/audit/payload',async()=>{
   const enabled=await import(new URL('preview-enabled-config.mjs',root)),disabled=await import(new URL('preview-disabled-config.mjs',root));assert.equal(enabled.urlSaveEnabled,false);assert.equal(disabled.urlReviewSchemaEnabled,true);
   await db.exec('reset role');const original=(await q('select * from public.content_versions where id=$1',[m.version_id])).rows[0];let row=JSON.parse(JSON.stringify(original));const values=new Map(),marker=createRevisionMarker(()=>({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}),'growth-os:url-review-attempt:v1');let posts=0,reviewId;
   // Fixed test-only transport: SQL requests always execute as authenticated. No network fallback.
   const fetchImpl=async(url,options={})=>{const u=new URL(url);assert.equal(u.origin,'https://isolated.supabase.co');await auth();let data;
    if(u.pathname==='/auth/v1/user')data={id:m.actor_id};
    else if(options.method==='POST'){assert.equal(u.pathname,'/rest/v1/rpc/review_url_result');posts++;const p=JSON.parse(options.body);reviewId=await scalar('select public.review_url_result($1,$2,$3,$4,$5,$6,$7)',[p.p_organization_id,p.p_version_id,p.p_request_id,p.p_source_digest,p.p_content_digest,p.p_version_digest,JSON.stringify(p.p_checks)]);throw Error('synthetic lost response after commit');}
    else{const table=u.pathname.split('/').at(-1),cols=u.searchParams.get('select');assert.match(table,/^[a-z_]+$/);assert.match(cols,/^[a-z_,]+$/);const args=[],where=[];for(const [k,v]of u.searchParams)if(!['select','order','limit'].includes(k)){assert.match(k,/^[a-z_]+$/);assert.ok(v.startsWith('eq.'));args.push(v.slice(3));where.push(`${k}=$${args.length}`);}let sql=`select ${cols} from public.${table}`+(where.length?' where '+where.join(' and '):'');if(u.searchParams.has('order')){assert.equal(u.searchParams.get('order'),'version_number.desc');sql+=' order by version_number desc';}if(u.searchParams.has('limit')){const n=Number(u.searchParams.get('limit'));assert.ok(n>0&&n<=501);sql+=' limit '+n;}data=(await q(sql,args)).rows;}
    return {ok:true,json:async()=>JSON.parse(JSON.stringify(data))};
   };
   const api=async config=>{const a=createWorkspaceApi({origin:'https://isolated.supabase.co',key:'sb_publishable_synthetic',redirectOrigin:'https://offline.invalid',...config,reviewMarker:marker,fetchImpl});await a.completeMagicLink('#access_token=synthetic&token_type=bearer&expires_in=60');return a;};
   // HTTP boundary: serialize SQL dates, project the product SELECT shape, and expect the API's normalized network error.
   const on=await api(enabled);row=await on.readContentVersion(row);await assert.rejects(on.confirmUrlReview(row,checks,{isCurrent:()=>true}),/無法連線到 Staging/);const pending=marker.read();assert.equal(pending.resolved,false);assert.equal(pending.known_id,null);assert.equal(posts,1);
   await db.exec('reset role');const after=await snapshot();await db.exec(pack['disable.sql']);await db.exec(pack['postflight-closed.sql']);on.signOut();const off=await api(disabled);assert.equal(off.urlReviewCanConfirm(row),false);await assert.rejects(off.confirmUrlReview(row,checks,{isCurrent:()=>true}),/尚未開放/);assert.deepEqual(marker.read(),pending);assert.equal((await off.readUrlReview(row)).id,reviewId);assert.equal(marker.read().request_id,pending.request_id);assert.equal(posts,1);
   await db.exec('reset role');await db.exec(pack['restore.sql']);const resumed=await api(enabled);assert.equal((await resumed.readUrlReview(row)).id,reviewId);await assert.rejects(resumed.confirmUrlReview(row,checks,{isCurrent:()=>true}),/不重送/);assert.equal(posts,1);assert.deepEqual(await snapshot(),after);
   await db.exec(pack['disable.sql']);await auth();await assert.rejects(review(),e=>e.code==='42501');assert.equal(await scalar('select count(*) from public.content_reviews where version_id=$1',[m.version_id]),1);assert.equal(await scalar("select count(*) from public.audit_events where event_type='url_result_reviewed' and object_id=$1",[m.version_id]),1);await db.exec('reset role');assert.deepEqual((await q('select * from public.content_versions where id=$1',[m.version_id])).rows[0],original);
  });
 }finally{await db.close();}
});
