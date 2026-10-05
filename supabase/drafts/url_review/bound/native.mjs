// Isolated native PG17.6, existing image only. No downloads, host ports or credentials.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {baseline} from './fixture.mjs';
import {manifest,render,checks,quote as literal} from './candidate.mjs';
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
try {
 docker(['run','--pull=never','--detach','--rm','--network','none','--name',name,'-e','POSTGRES_HOST_AUTH_METHOD=trust',image,'postgres','-c','listen_addresses=']);started=true;
 await until(()=>docker(['exec',name,'cat','/proc/1/comm'])==='postgres'&&sql('select 1')==='1',40000);assert.match(sql('show server_version'),/^17\.6/);
 const m=await manifest(),pack=await render(m,{cutoff:'2099-01-01T00:00:00.000Z'});sql(await baseline());sql(pack.opening);
 const begin=`begin;set local statement_timeout='15s';set local role authenticated;select set_config('request.jwt.claim.sub','${m.actor_id}',true);`;
 const call=`select public.review_url_result('${m.organization_id}','${m.version_id}','${m.request_id}','${m.source_digest}','${m.content_digest}','${m.version_digest}',${literal(JSON.stringify(checks))}::jsonb);`;
 const ready=label=>until(()=>sql(`select exists(select 1 from pg_stat_activity where application_name='${label}' and state='idle in transaction' and query like '%READY%')`)==='t');
 const blocked=async(a,b)=>{const proof=JSON.parse(await until(()=>sql(`select json_build_object('holder',a.pid,'contender',b.pid,'observer',pg_backend_pid()) from pg_stat_activity a,pg_stat_activity b where a.application_name='${a}' and b.application_name='${b}' and a.pid=any(pg_blocking_pids(b.pid))`)));assert.equal(new Set(Object.values(proof)).size,3);return proof;};
 const counts=()=>sql(`select (select count(*) from public.content_reviews where url_review_request_id='${m.request_id}')||'/'||(select count(*) from public.audit_events where details->>'request_id'='${m.request_id}')`);
 const versions=()=>sql(`select jsonb_agg(to_jsonb(v) order by version_number)::text from public.content_versions v where opportunity_id='${m.opportunity_id}'`),before=versions();
 for(const [label,lock]of [['org',`select id from public.organizations where id='${m.organization_id}' for no key update;`],['membership',`select user_id from public.organization_members where organization_id='${m.organization_id}' and user_id='${m.actor_id}' for update;`],['parent',`select id from public.growth_opportunities where id='${m.opportunity_id}' for update;`]]){
  sql((await render(m,{cutoff:new Date(Date.now()+3500).toISOString()})).implementation);
  const a=session(label+'-holder'),b=session(label+'-waiter');a.p.stdin.write('begin;'+lock+"select 'READY';\n");await ready(label+'-holder');b.p.stdin.end(begin+call+'commit;\n');const proof=await blocked(label+'-holder',label+'-waiter');a.p.stdin.end('select pg_sleep(3.6);commit;\n');assert.equal((await a.done).code,0);const result=await b.done;assert.notEqual(result.code,0);assert.match(result.err,/42501/);assert.equal(counts(),'0/0');assert.equal(versions(),before);console.log('PASS bounded Review expiry after '+label+' wait '+JSON.stringify(proof));
 }
 sql(pack.implementation);const a=session('same-review-a'),b=session('same-review-b');a.p.stdin.write(begin+call+"select 'READY';\n");await ready('same-review-a');b.p.stdin.end(begin+call+'commit;\n');const proof=await blocked('same-review-a','same-review-b');a.p.stdin.end('commit;\n');for(const r of await Promise.all([a.done,b.done]))assert.equal(r.code,0,r.err);assert.equal(counts(),'1/1');assert.equal(versions(),before);console.log('PASS fixed concurrent Review one review/audit '+JSON.stringify(proof));
 sql((await render(m,{cutoff:'2000-01-01T00:00:00.000Z'})).implementation);assert.throws(()=>sql(begin+call+'commit;'),e=>e.stderr.toString().includes('42501'));sql(pack.cleanup);assert.throws(()=>sql(begin+call+'commit;'),e=>e.stderr.toString().includes('42501'));assert.equal(counts(),'1/1');assert.equal(versions(),before);console.log('PASS expired replay and cleaned ACL deny, full v1/v2 unchanged');
}finally{for(const p of sessions)if(p.exitCode===null)p.kill();if(started)docker(['rm','-f',name]);}
