// Isolated native PG17.6, existing image only. No downloads, host ports or credentials.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fixtures,ids,parent,request,bootstrapSQL,seedSQL} from '../first_result_save/fixtures.mjs';
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
 await until(()=>sql('select 1')==='1',40000);assert.match(sql('show server_version'),/^17\.6/);
 sql(bootstrapSQL);
 for(const f of (await readdir(new URL('../../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())sql(await readFile(new URL('../../migrations/'+f,import.meta.url),'utf8'));
 sql(seedSQL);sql(await readFile(new URL('../first_result_save/proposal.sql',import.meta.url),'utf8'));sql(await readFile(new URL('../first_result_save/disable_writes.sql',import.meta.url),'utf8'));sql(await readFile(new URL('./proposal.sql',import.meta.url),'utf8'));
 for(const f of ['public.save_url_result_draft','private.save_url_result_draft_impl'])assert.equal(sql(`select has_function_privilege('authenticated','${f}(uuid,uuid,uuid,integer,jsonb)','execute')`),'f');
 sql('grant execute on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated');
 const [report]=await fixtures();const begin=`begin;set local statement_timeout='12s';set local role authenticated;select set_config('request.jwt.claim.sub','${ids.owner}',true);`;
 const call=(n,v=0,op=parent(20))=>`select public.save_url_result_draft('${ids.org}','${op}','${request(n)}',${v},${quote(JSON.stringify(report))}::jsonb);`;
 const ready=label=>until(()=>sql(`select exists(select 1 from pg_stat_activity where application_name='${label}' and state='idle in transaction' and query like '%READY%')`)==='t');
 const blocked=async(a,b)=>{const proof=JSON.parse(await until(()=>sql(`select json_build_object('holder',a.pid,'contender',b.pid,'observer',pg_backend_pid()) from pg_stat_activity a,pg_stat_activity b where a.application_name='${a}' and b.application_name='${b}' and a.pid=any(pg_blocking_pids(b.pid))`)));assert.equal(new Set(Object.values(proof)).size,3);return proof;};
 async function overlap(label,first,second,code=null){
  const a=session(label+'-a'),b=session(label+'-b');a.p.stdin.write(begin+first+"select 'READY';\n");await ready(label+'-a');
  b.p.stdin.end(begin+second+'commit;\n');const proof=await blocked(label+'-a',label+'-b');a.p.stdin.end('commit;\n');
  const [ra,rb]=await Promise.all([a.done,b.done]);assert.equal(ra.code,0,ra.err);if(code){assert.notEqual(rb.code,0);assert.match(rb.err,new RegExp(code));}else assert.equal(rb.code,0,rb.err);
  console.log('PASS URL native '+label+' '+JSON.stringify(proof));
 }
 await overlap('same-request',call(20),call(20));
 assert.equal(sql("select count(*) from public.growth_opportunities where entry_kind='url_result'"),'1');assert.equal(sql('select count(*) from public.content_versions'),'1');assert.equal(sql("select count(*) from public.audit_events where event_type='url_result_draft_saved'"),'1');
 await overlap('same-version',call(21,1),call(22,1),'PT409');
 await overlap('cross-parent-request',call(23,2),call(23,0,parent(21)),'22023');
 // Save holds membership SHARE until commit, so revocation waits behind save.
 const a=session('url-save-before-revoke'),b=session('url-revoke-after-save');a.p.stdin.write(begin+call(24,3)+"select 'READY';\n");await ready('url-save-before-revoke');
 b.p.stdin.end(`begin;delete from public.organization_members where user_id='${ids.owner}' and organization_id='${ids.org}';commit;\n`);
 const proof=await blocked('url-save-before-revoke','url-revoke-after-save');a.p.stdin.end('commit;\n');const results=await Promise.all([a.done,b.done]);for(const r of results)assert.equal(r.code,0,r.err);console.log('PASS URL native save-before-revoke '+JSON.stringify(proof));
 assert.throws(()=>sql(begin+call(25,4)+'commit;'),e=>e.stderr.toString().includes('42501'));
 sql(`insert into public.organization_members values('${ids.org}','${ids.owner}','owner')`);
 // Revocation commits while save waits for org lock; post-wait membership recheck rejects.
 const c=session('url-org-holder'),d=session('url-recheck');c.p.stdin.write(`begin;select id from public.organizations where id='${ids.org}' for no key update;select 'READY';\n`);await ready('url-org-holder');
 d.p.stdin.end(begin+call(25,4)+'commit;\n');await blocked('url-org-holder','url-recheck');sql(`delete from public.organization_members where user_id='${ids.owner}' and organization_id='${ids.org}'`);c.p.stdin.end('commit;\n');await c.done;const rd=await d.done;assert.notEqual(rd.code,0);assert.match(rd.err,/42501/);console.log('PASS URL native revoke-during-org-wait');
 // Save waits directly for membership row locked by a revocation transaction.
 sql(`insert into public.organization_members values('${ids.org}','${ids.owner}','owner')`);
 const e=session('url-membership-holder'),f=session('url-membership-waiter');e.p.stdin.write(`begin;delete from public.organization_members where user_id='${ids.owner}' and organization_id='${ids.org}';select 'READY';\n`);await ready('url-membership-holder');
 f.p.stdin.end(begin+call(25,4)+'commit;\n');await blocked('url-membership-holder','url-membership-waiter');e.p.stdin.end('commit;\n');await e.done;const rf=await f.done;assert.notEqual(rf.code,0);assert.match(rf.err,/42501/);console.log('PASS URL native revoke-before-membership-lock');
 assert.equal(sql('select count(*) from public.content_versions'),'4');assert.equal(sql("select count(*) from public.audit_events where event_type='url_result_draft_saved'"),'4');assert.equal(sql("select count(*) from public.growth_opportunities where entry_kind='url_result'"),'1');
} finally {for(const p of sessions)if(p.exitCode===null)p.kill();if(started)docker(['rm','-f',name]);}
