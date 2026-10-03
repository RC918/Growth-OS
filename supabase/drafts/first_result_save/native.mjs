// Isolated native PG17.6, existing image only. No downloads, host ports or credentials.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fixtures,ids,parent,request,bootstrapSQL,seedSQL} from './fixtures.mjs';
const image='postgres:17.6@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929';
const name='growth-first-result-'+randomUUID().slice(0,8);
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',timeout:15000,stdio:['pipe','pipe','pipe']}).trim();
try{docker(['image','inspect',image]);}catch{console.error('BLOCKED: existing pinned PostgreSQL 17.6 image unavailable; no pull attempted. No native concurrency evidence.');process.exit(2);}
const args=app=>['exec','-i','-e','PGAPPNAME='+app,name,'psql','-X','-w','-U','postgres','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
const sql=(query,app='first-result-observer')=>docker(args(app),query);
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
 sql(bootstrapSQL);
 for(const file of (await readdir(new URL('../../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())sql(await readFile(new URL('../../migrations/'+file,import.meta.url),'utf8'));
 sql(seedSQL);sql(await readFile(new URL('./proposal.sql',import.meta.url),'utf8'));
 const [report]=await fixtures();
 const protectedTables=sql("select tablename from pg_tables where schemaname='public' and tablename not in ('content_versions','audit_events') order by tablename").split('\n');
 assert.equal(protectedTables.length,18);
 const protectedState=()=>JSON.stringify(Object.fromEntries([...protectedTables.map(table=>['public.'+table,sql(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${table} t`)]),...['model_trial','model_trial_attempts'].map(table=>['private.'+table,sql(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from private.${table} t`)])]));
 const before=protectedState();
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
 assert.equal(protectedState(),before);
 console.log('PASS native PG17.6 independent backends; no network/remote Auth; history and ledger unchanged');
}finally{
 for(const p of sessions)if(p.exitCode===null)p.kill('SIGTERM');
 if(started)docker(['stop','--time','1',name]);
}
