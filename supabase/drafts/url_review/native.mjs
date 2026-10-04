// Isolated native PG17.6, existing image only. No downloads, host ports or credentials.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {baseline,fixtures,checks,saveGrant,reviewGrant,ids,parent,request} from './fixture.mjs';
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
 await until(()=>docker(['exec',name,'cat','/proc/1/comm'])==='postgres'&&sql('select 1')==='1',40000);
 assert.match(sql('show server_version'),/^17\.6/);assert.equal(sql('show listen_addresses'),'');
 sql(await baseline());sql(saveGrant+reviewGrant);const payload=(await fixtures())[0];
 const begin=`begin;set local statement_timeout='15s';set local role authenticated;select set_config('request.jwt.claim.sub','${ids.owner}',true);`;
 const save=(op,n,v=0)=>`select public.save_url_result_draft('${ids.org}','${parent(op)}','${request(n)}',${v},${quote(JSON.stringify(payload))}::jsonb);`;
 const review=(id,n)=>`select public.review_url_result('${ids.org}','${id}','${request(n)}',${quote(payload.snapshot.content_fingerprint)},${quote(payload.review.content_digest)},(select first_result_request_digest from public.content_versions where id='${id}'),${quote(JSON.stringify(checks))}::jsonb);`;
 const version=op=>sql(`select id from public.content_versions where opportunity_id='${parent(op)}' order by version_number limit 1`);
 const counts=id=>sql(`select (select count(*) from public.content_reviews where version_id='${id}')||'/'||(select count(*) from public.audit_events where event_type='url_result_reviewed' and object_id='${id}')`);
 const ready=label=>until(()=>sql(`select exists(select 1 from pg_stat_activity where application_name='${label}' and state='idle in transaction' and query like '%READY%')`)==='t');
 const blocked=async(a,b)=>{const proof=JSON.parse(await until(()=>sql(`select json_build_object('holder',a.pid,'contender',b.pid,'observer',pg_backend_pid()) from pg_stat_activity a,pg_stat_activity b where a.application_name='${a}' and b.application_name='${b}' and a.pid=any(pg_blocking_pids(b.pid))`)));assert.equal(new Set(Object.values(proof)).size,3);return proof;};
 for(const [op,label,same]of [[20,'same-request',true],[21,'competing-request',false]]){
  sql(begin+save(op,op)+'commit;');const id=version(op),a=session(label+'-a'),b=session(label+'-b');
  a.p.stdin.write(begin+review(id,100+op)+"select 'READY';\n");await ready(label+'-a');b.p.stdin.end(begin+review(id,same?100+op:200+op)+'commit;\n');const proof=await blocked(label+'-a',label+'-b');a.p.stdin.end('commit;\n');
  assert.equal((await a.done).code,0);const result=await b.done;if(same)assert.equal(result.code,0,result.err);else{assert.notEqual(result.code,0);assert.match(result.err,/PT409/);}assert.equal(counts(id),'1/1');console.log('PASS '+label+' one review/audit '+JSON.stringify(proof));
 }
 // Save wins organization/parent lock: stale review must observe new latest after waiting.
 sql(begin+save(22,22)+'commit;');const stale=version(22),a=session('save-first'),b=session('stale-review');
 a.p.stdin.write(begin+save(22,222,1)+"select 'READY';\n");await ready('save-first');b.p.stdin.end(begin+review(stale,122)+'commit;\n');const proof=await blocked('save-first','stale-review');a.p.stdin.end('commit;\n');assert.equal((await a.done).code,0);const result=await b.done;assert.notEqual(result.code,0);assert.match(result.err,/PT409/);assert.equal(counts(stale),'0/0');console.log('PASS Save winner prevents stale confirmation '+JSON.stringify(proof));
 // Review wins: a later Save remains unconfirmed; the old review is immutable history.
 sql(begin+save(23,23)+'commit;');const old=version(23),c=session('review-first'),d=session('save-after');
 c.p.stdin.write(begin+review(old,123)+"select 'READY';\n");await ready('review-first');d.p.stdin.end(begin+save(23,223,1)+'commit;\n');const proof2=await blocked('review-first','save-after');c.p.stdin.end('commit;\n');for(const r of await Promise.all([c.done,d.done]))assert.equal(r.code,0,r.err);assert.equal(counts(old),'1/1');assert.equal(sql(`select count(*) from public.content_reviews r join public.content_versions v on v.id=r.version_id where v.opportunity_id='${parent(23)}' and v.version_number=2`),'0');console.log('PASS later version never inherits prior confirmation '+JSON.stringify(proof2));
 // A membership change while waiting cannot pass the optimistic initial role test.
 sql(begin+save(24,24)+'commit;');const revoked=version(24),e=session('membership-holder'),f=session('membership-waiter');
 e.p.stdin.write(`begin;select user_id from public.organization_members where organization_id='${ids.org}' and user_id='${ids.owner}' for update;select 'READY';\n`);await ready('membership-holder');f.p.stdin.end(begin+review(revoked,124)+'commit;\n');const proof3=await blocked('membership-holder','membership-waiter');e.p.stdin.end(`update public.organization_members set role='viewer' where organization_id='${ids.org}' and user_id='${ids.owner}';commit;\n`);assert.equal((await e.done).code,0);const denied=await f.done;assert.notEqual(denied.code,0);assert.match(denied.err,/42501/);assert.equal(counts(revoked),'0/0');console.log('PASS membership downgrade across lock wait denies confirmation '+JSON.stringify(proof3));
}finally{for(const p of sessions)if(p.exitCode===null)p.kill();if(started)docker(['rm','-f',name]);}
