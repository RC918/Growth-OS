// SQL compatibility only: no GoTrue/PostgREST process, JWT, HTTP, persistent identity or grant.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {compose} from './compose.mjs';
import {schema} from './schema.mjs';
import {ids,fixtures,parent,request,checks} from '../../../supabase/drafts/url_review/fixture.mjs';
const fixture=JSON.parse(await readFile(new URL('./auth-migrations.fixture.json',import.meta.url)));
const render=sql=>{const rendered=sql.replace(/\{\{\s*index \.Options "Namespace"\s*\}\}/g,'auth');assert.ok(!rendered.includes('{{'),'unknown upstream template');return rendered;};
const quote=v=>"'"+v.replaceAll("'","''")+"'";
test('all 70 official Auth SQL migrations as unprivileged auth owner, then exact business schema and JSON-claims Save/Review/RLS',async()=>{
 assert.equal(fixture.image,(await compose()).services.auth.image);assert.equal(Object.keys(fixture.migrations).length,70);
 for(const m of Object.values(fixture.migrations))assert.equal(createHash('sha256').update(m.sql).digest('hex'),m.sha256);
 const name='growth-auth-sql-fixture-'+process.pid,image=(await compose()).services.db.image;
 const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000}).trim();
 const sql=(body,user='postgres')=>docker(['exec','-i','--user','postgres',name,'psql','-XAtq','-w','-U',user,'-d','postgres','-v','ON_ERROR_STOP=1'],body);
 let started=false;
 try{
  docker(['run','-d','--rm','--pull=never','--name',name,'--label','growth.rc.fixture=auth-sql','--network','none','--tmpfs','/var/lib/postgresql/data','--tmpfs','/var/run/postgresql','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_PASSWORD=PUBLIC_SQL_FIXTURE_NOT_A_SECRET',image]);started=true;
  let ready=false;for(let i=0;i<80;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert.ok(ready);
  sql(await readFile(new URL('./roles.sql',import.meta.url),'utf8'));
  assert.equal(sql("select to_regprocedure('auth.uid()') is null;"),'t');
  const gate=await readFile(new URL('./auth-ready.sql',import.meta.url),'utf8');
  assert.throws(()=>sql(gate),/Native Auth migrations\/ownership incomplete/);
  // Reproduce the exact old collision, entirely rolled back on this disposable DB.
  assert.throws(()=>sql("begin; create function auth.uid() returns uuid language sql stable as $$select null::uuid$$; set local role supabase_auth_admin;"+render(fixture.migrations['00_init_auth_schema.up.sql'].sql)),/must be owner of function uid/);
  assert.equal(sql("select to_regprocedure('auth.uid()') is null;"),'t');
  for(const [file,m] of Object.entries(fixture.migrations).sort(([a],[b])=>a.localeCompare(b))){
   const version=file.split('_')[0];
   try{sql('begin;'+render(m.sql)+`\n;\ninsert into auth.schema_migrations(version) values (${quote(version)});commit;`,'supabase_auth_admin');}
   catch(e){throw Error('Official migration failed: '+file+'\n'+String(e.stderr));}
  }
  assert.equal(sql('select count(*) from auth.schema_migrations;'),'70');sql(gate);
  assert.equal(sql("select count(*) from pg_class where relnamespace='auth'::regnamespace and pg_get_userbyid(relowner)<>'supabase_auth_admin';"),'0');
  assert.throws(()=>sql('begin;alter role supabase_auth_admin createrole;'+gate),/RC roles exceed approved privileges/);
  sql(gate);
  const authState=()=>sql("select md5(string_agg(oid::text||proowner::text||pg_get_functiondef(oid),'' order by oid)) from pg_proc where pronamespace='auth'::regnamespace;");
  const beforeAuth=authState();
  // SQL fixtures only, no passwords/sessions/identities/token issuance; not native-user acceptance.
  sql(`insert into auth.users(id) values('${ids.owner}'),('${ids.viewer}'),('${ids.foreign}');`,'supabase_auth_admin');
  const business=await schema();assert.equal(business,await readFile(new URL('./schema.candidate.sql',import.meta.url),'utf8'));sql(business);
  assert.equal(authState(),beforeAuth);sql(gate);
  assert.equal(sql("select count(*) from pg_roles where rolname in ('supabase_auth_admin','authenticator','anon','authenticated','service_role') and (rolsuper or rolcreaterole or rolcreatedb or rolbypassrls);"),'0');
  assert.equal(sql("select has_schema_privilege('supabase_auth_admin','public','CREATE');"),'f');
  const authenticated=(actor,body)=>sql(`begin;set local role authenticated;set local request.jwt.claims=${quote(JSON.stringify({sub:ids[actor],role:'authenticated'}))};${body};commit;`,'authenticator');
  assert.equal(authenticated('owner','select auth.uid()'),ids.owner);
  const payload=(await fixtures())[0],payloadSql=quote(JSON.stringify(payload))+'::jsonb';
  const saved=authenticated('owner',`select public.save_url_result_draft('${ids.org}','${parent(801)}','${request(801)}',0,${payloadSql})`);
  assert.match(saved,/^[a-f0-9-]{36}$/);
  assert.deepEqual(JSON.parse(authenticated('owner',`select first_result_payload from content_versions where id='${saved}'`)),payload);
  const reviewArgs=`'${ids.org}','${saved}','${request(802)}',${quote(payload.snapshot.content_fingerprint)},${quote(payload.review.content_digest)},(select first_result_request_digest from content_versions where id='${saved}'),${quote(JSON.stringify(checks))}::jsonb`;
  authenticated('owner',`select public.review_url_result(${reviewArgs})`);
  assert.equal(authenticated('owner',`select count(*) from content_reviews where version_id='${saved}'`),'1');
  const snapshot=()=>sql("select jsonb_build_object('versions',(select jsonb_agg(to_jsonb(v)) from content_versions v),'reviews',(select jsonb_agg(to_jsonb(r)) from content_reviews r),'audit',(select jsonb_agg(to_jsonb(a)) from audit_events a));");const before=snapshot();
  for(const actor of ['viewer','foreign']){
   assert.equal(authenticated(actor,`select count(*) from content_versions where organization_id='${ids.org}'`),actor==='viewer'?'1':'0');
   assert.throws(()=>authenticated(actor,`select public.save_url_result_draft('${ids.org}','${parent(801)}','${request(actor==='viewer'?803:804)}',1,${payloadSql})`),/Owner required/);
   assert.throws(()=>authenticated(actor,`select public.review_url_result(${reviewArgs})`),/Owner required/);
  }
  assert.equal(snapshot(),before);assert.equal(authState(),beforeAuth);
  console.log('PASS 70 official Auth SQL + unchanged business schema + authenticator SET ROLE/JSON claims + exact Save/Review/fresh SQL readback + viewer/foreign denials; no native Auth or PostgREST runtime claim.');
 }finally{if(started)docker(['stop','-t','1',name]);}
});
