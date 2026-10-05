// Isolated native PG17.6, existing image only. No downloads, host ports or credentials.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fixtures,ids,parent,request,bootstrapSQL,seedSQL} from './fixtures.mjs';
import {urlCases,jsURLAllowed,rebind} from './url-cases.mjs';
import {checkClosedPackage} from './closed-package-checks.mjs';
import {contentDigest} from '../../../apps/web/first-result-review.mjs';
const image='postgres:17.6@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929';
const name='growth-first-result-'+randomUUID().slice(0,8);
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',timeout:15000,stdio:['pipe','pipe','pipe']}).trim();
try{docker(['image','inspect',image]);}catch{console.error('BLOCKED: existing pinned PostgreSQL 17.6 image unavailable; no pull attempted. No native concurrency evidence.');process.exit(2);}
const args=(app,database='postgres')=>['exec','-i','-e','PGAPPNAME='+app,name,'psql','-X','-w','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
const sql=(query,app='first-result-observer',database='postgres')=>docker(args(app,database),query);
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const pause=()=>new Promise(resolve=>setTimeout(resolve,50));
async function until(check,timeout=6000){const end=Date.now()+timeout;while(Date.now()<end){try{const result=check();if(result)return result;}catch{}await pause();}throw Error('Native barrier timed out');}
let started=false;const sessions=[];
function session(label){
 const p=spawn('docker',args(label),{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);const done=new Promise(resolve=>p.once('close',code=>resolve({code,out,err})));sessions.push(p);return {p,done};
}
try{
 docker(['run','--pull=never','--detach','--rm','--network','none','--name',name,'-e','POSTGRES_HOST_AUTH_METHOD=trust',image,'postgres','-c','listen_addresses=']);started=true;
 await until(()=>docker(['exec',name,'cat','/proc/1/comm'])==='postgres'&&sql('select 1')==='1',40000);
 assert.match(sql('show server_version'),/^17\.6/);assert.equal(sql('show listen_addresses'),'');
 // Separate ephemeral database: exact single-DO package, no hosted migration runner.
 sql('create database closed_package');
 await checkClosedPackage({exec:async q=>sql(q,'closed-package-check','closed_package'),scalar:async q=>sql(q,'closed-package-check','closed_package')},'native PG17.6');
 // Roles are cluster-wide and were created by the package database bootstrap.
 sql(bootstrapSQL.replace('create role anon nologin;create role authenticated nologin;create role service_role nologin;',''));
 for(const file of (await readdir(new URL('../../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())sql(await readFile(new URL('../../migrations/'+file,import.meta.url),'utf8'));
 sql(seedSQL);const proposal=await readFile(new URL('./proposal.sql',import.meta.url),'utf8');sql(proposal);
 const [report]=await fixtures();
 const protectedTables=sql("select tablename from pg_tables where schemaname='public' and tablename not in ('content_versions','audit_events') order by tablename").split('\n');
 assert.equal(protectedTables.length,18);
 const protectedState=()=>JSON.stringify(Object.fromEntries([...protectedTables.map(table=>['public.'+table,sql(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${table} t`)]),...['model_trial','model_trial_attempts'].map(table=>['private.'+table,sql(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from private.${table} t`)])]));
 const before=protectedState();
 // Explicit PG17 control of the old escape spelling; do not infer it from PG18.
 const oldTrim=String.raw`E' \t\n\r\v\f'||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)`;
 const control=JSON.parse(sql(`select json_build_object('escape_hex',encode(convert_to(E'\\v','UTF8'),'hex'),'v',length(btrim('v',${oldTrim}))>0,'vv',length(btrim(' vv ',${oldTrim}))>0,'vt',length(btrim(chr(11),${oldTrim}))>0)`));
 console.log('CONTROL native PG17 original trim '+JSON.stringify(control));
 assert.deepEqual(control,{escape_hex:'0b',v:true,vv:true,vt:false},'PG17 original escape semantics must agree with the observed engine result and JS trim');
 console.log('PASS native PG17 original trim agrees with JS; reported trim defect not reproduced');
 for(const value of ['v',' vv ','\u000B','\u000B v \u000B']){
  assert.equal(sql(`select private.fr_text(${quote(JSON.stringify(value))}::jsonb)`),value.trim().length?'t':'f');
 }
 console.log('PASS native chr(11) regression comparison preserves original trim semantics');
 for(const [url,allowed] of urlCases){
  assert.equal(jsURLAllowed(url),allowed);assert.equal(sql(`select private.fr_url(${quote(JSON.stringify(url))}::jsonb)`),allowed?'t':'f',url);
  const payload=await rebind(report,url,contentDigest);
  try{sql(`begin;select private.fr_valid_payload(${quote(JSON.stringify(payload))}::jsonb);rollback;`);assert.equal(allowed,true,url);}
  catch(e){if(e instanceof assert.AssertionError)throw e;assert.equal(allowed,false,url);assert.match(e.stderr?.toString()??'',/22023/);}
 }
 console.log('PASS native '+urlCases.length+' authority/port cases with full source/receipt/digest rebinding');

 const begin=`begin;set local statement_timeout='12s';set local role authenticated;select set_config('request.jwt.claim.sub','${ids.owner}',true);`;
 const call=(req,op=parent(1),expected=0)=>`select public.save_first_result_draft('${ids.org}','${op}','${req}',${expected},${quote(JSON.stringify(report))}::jsonb);`;
 async function overlap({label,requestA,requestB,opB=parent(1),expected=0,expectedCode=null}){
  const a=session(label+'-holder'),b=session(label+'-contender');
  a.p.stdin.write(begin+call(requestA,parent(1),expected)+"select 'HOLDER_READY';\n");
  await until(()=>sql(`select exists(select 1 from pg_stat_activity where application_name='${label}-holder' and state='idle in transaction' and query like '%HOLDER_READY%')`)==='t');
  b.p.stdin.end(begin+call(requestB,opB,expected)+'commit;\n');
  const proof=JSON.parse(await until(()=>sql(`select json_build_object('holder',a.pid,'contender',b.pid,'observer',pg_backend_pid()) from pg_stat_activity a,pg_stat_activity b where a.application_name='${label}-holder' and b.application_name='${label}-contender' and b.wait_event_type='Lock' and a.pid=any(pg_blocking_pids(b.pid))`)));
  assert.equal(new Set(Object.values(proof)).size,3);
  a.p.stdin.end('commit;\n');
  const [ra,rb]=await Promise.all([a.done,b.done]);assert.equal(ra.code,0,ra.err);
  if(expectedCode){assert.notEqual(rb.code,0);assert.ok(rb.err.includes(expectedCode),rb.err);}else assert.equal(rb.code,0,rb.err);
  console.log('PASS native '+label+' '+JSON.stringify(proof));
 }
 await overlap({label:'same-request',requestA:request(1),requestB:request(1)});
 assert.equal(sql(`select count(*) from public.content_versions where first_result_request_id='${request(1)}'`),'1');
 assert.equal(sql(`select count(*) from public.audit_events where event_type='first_result_draft_saved' and details->>'request_id'='${request(1)}'`),'1');
 await overlap({label:'same-version',requestA:request(2),requestB:request(3),expected:1,expectedCode:'PT409'});
 await overlap({label:'cross-parent-id',requestA:request(4),requestB:request(4),opB:parent(2),expected:2,expectedCode:'22023'});
 assert.equal(sql('select count(*) from public.content_versions'),'3');assert.equal(sql("select count(*) from public.audit_events where event_type='first_result_draft_saved'"),'3');
 // Mixed legacy/typed regression. Control changes ONLY the org lock mode in
 // the isolated implementation, then restores the candidate before positive cases.
 const start=proposal.indexOf('create function private.save_first_result_draft_impl(');
 const end=proposal.indexOf('create function public.save_first_result_draft(',start);
 const implementation=proposal.slice(start,end).replace('create function private.','create or replace function private.');
 const oldImplementation=implementation.replace('where id=p_organization_id for no key update;','where id=p_organization_id for update;');
 assert.notEqual(oldImplementation,implementation,'org lock replacement must be exact');
 const ready=async label=>until(()=>sql(`select exists(select 1 from pg_stat_activity where application_name='${label}' and state='idle in transaction' and query like '%HOLDER_READY%')`)==='t');
 const blocked=async(holder,contender)=>{
  const proof=JSON.parse(await until(()=>sql(`select json_build_object('holder',a.pid,'contender',b.pid,'observer',pg_backend_pid()) from pg_stat_activity a,pg_stat_activity b where a.application_name='${holder}' and b.application_name='${contender}' and b.wait_event_type='Lock' and a.pid=any(pg_blocking_pids(b.pid))`)));
  assert.equal(new Set(Object.values(proof)).size,3);return proof;
 };
 async function mixed(kind,legacyId=null,controlMode=false){
  const label=(controlMode?'control-update-':'fixed-nokey-')+kind;
  const a=session(label+'-legacy'),b=session(label+'-typed');
  // Pause a real legacy RPC at its existing parent-lock boundary, not a fake
  // INSERT. Trusted fixture setup holds the same lock; the RPC then re-enters it.
  a.p.stdin.write(`begin;set local statement_timeout='12s';select id from public.growth_opportunities where id='${parent(2)}' for update;set local role authenticated;select set_config('request.jwt.claim.sub','${ids.owner}',true);select 'HOLDER_READY';\n`);
  await ready(label+'-legacy');
  b.p.stdin.end(begin+call(request(20),parent(2),legacyId?1:0)+'rollback;\n');
  const proof=await blocked(label+'-legacy',label+'-typed');
  const legacyCall=kind==='create'?`select public.create_content_draft('${ids.org}','${parent(2)}','Mixed legacy','Body');`:`select public.review_content_draft('${ids.org}','${legacyId}','approved','Mixed legacy review');`;
  a.p.stdin.end(legacyCall+'rollback;\n');
  const results=await Promise.all([a.done,b.done]);
  if(controlMode){
   assert.equal(results.filter(r=>r.code!==0&&r.err.includes('40P01')).length,1,JSON.stringify(results));
   assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));
   console.log('REPRODUCED native legacy/'+kind+' old FOR UPDATE deadlock 40P01 '+JSON.stringify(proof));
  }else{for(const r of results)assert.equal(r.code,0,r.err);console.log('PASS native mixed legacy/'+kind+' FOR NO KEY UPDATE '+JSON.stringify(proof));}
 }
 sql(oldImplementation);await mixed('create',null,true);sql(implementation);await mixed('create');
 const legacyId=sql(begin+`select public.create_content_draft('${ids.org}','${parent(2)}','Review seed','Body');commit;`).split('\n').find(line=>/^[0-9a-f]{8}-/.test(line)&&line!==ids.owner);
 assert.ok(legacyId);
 sql(oldImplementation);await mixed('review',legacyId,true);sql(implementation);await mixed('review',legacyId);
 assert.equal(sql(`select count(*) from public.content_reviews where version_id='${legacyId}'`),'0');
 assert.equal(sql('select count(*) from public.content_versions'),'4','mixed cases rolled back except explicit legacy seed');

 // A deletion held uncommitted lets B observe the old membership before B
 // waits on the org; after A commits, the post-wait membership check must deny.
 for(const [label,req,expected] of [['revoked-wait-new',request(60),3],['revoked-wait-retry',request(1),0]]){
  const a=session(label+'-revoker'),b=session(label+'-save');
  a.p.stdin.write(`begin;select id from public.organizations where id='${ids.org}' for no key update;delete from public.organization_members where organization_id='${ids.org}' and user_id='${ids.owner}';select 'HOLDER_READY';\n`);
  await ready(label+'-revoker');b.p.stdin.end(begin+call(req,parent(1),expected)+'commit;\n');
  const proof=await blocked(label+'-revoker',label+'-save');a.p.stdin.end('commit;\n');
  const [ra,rb]=await Promise.all([a.done,b.done]);assert.equal(ra.code,0,ra.err);assert.notEqual(rb.code,0);assert.match(rb.err,/42501/);
  assert.equal(sql('select count(*) from public.content_versions'),'4');
  sql(`insert into public.organization_members(organization_id,user_id,role) values('${ids.org}','${ids.owner}','owner')`);
  console.log('PASS native '+label+' post-wait owner denial '+JSON.stringify(proof));
 }
 // Inverse ordering: save owns membership SHARE; revocation must wait until
 // the authorized transaction commits, then an old-request replay is denied.
 {
  const a=session('save-before-revoke-holder'),b=session('save-before-revoke-deleter');
  a.p.stdin.write(begin+call(request(61),parent(1),3)+"select 'HOLDER_READY';\n");await ready('save-before-revoke-holder');
  b.p.stdin.end(`begin;set local statement_timeout='12s';delete from public.organization_members where organization_id='${ids.org}' and user_id='${ids.owner}';commit;\n`);
  const proof=await blocked('save-before-revoke-holder','save-before-revoke-deleter');a.p.stdin.end('commit;\n');
  const results=await Promise.all([a.done,b.done]);for(const r of results)assert.equal(r.code,0,r.err);
  assert.equal(sql('select count(*) from public.content_versions'),'5');
  let denied=false;try{sql(begin+call(request(61),parent(1),3)+'commit;');}catch(e){assert.match(e.stderr?.toString()??'',/42501/);denied=true;}assert.equal(denied,true);
  sql(`insert into public.organization_members(organization_id,user_id,role) values('${ids.org}','${ids.owner}','owner')`);
  console.log('PASS native save-before-revoke serialization and retry denial '+JSON.stringify(proof));
 }
 assert.equal(sql("select count(*) from public.audit_events where event_type='first_result_draft_saved'"),'4');
 assert.equal(protectedState(),before);
 console.log('PASS native PG17.6 independent backends; no network/remote Auth; history and ledger unchanged');
}finally{
 for(const p of sessions)if(p.exitCode===null)p.kill('SIGTERM');
 if(started)docker(['stop','--time','1',name]);
}
