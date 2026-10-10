// Native PG17 multi-connection proof; existing pinned image, no network, ports or credentials.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
const image='postgres:17.6@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929',name='growth-r7-deadline-'+randomUUID().slice(0,8);
const owner='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000003';
const hash='3913033f19d0b9ccc1f1dac01693363aec56ee29d897d96c66fc7ac9b8c74c04',source='7061a900b6aad2703ff9f7ce46a44cfa95f6be3ed0370bd686f1d32f32a6713d';
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',timeout:15000,stdio:['pipe','pipe','pipe']}).trim();
try{docker(['image','inspect',image]);}catch{console.error('BLOCKED: existing pinned PG17 image unavailable; no pull attempted.');process.exit(2);}
const args=app=>['exec','-i','-e','PGAPPNAME='+app,name,'psql','-X','-w','-U','postgres','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
const sql=(text,app='r7-observer')=>docker(args(app),text),quote=s=>"'"+s.replaceAll("'","''")+"'";
const sessions=[];let started=false;
async function until(check,ms=10000){const end=Date.now()+ms;while(Date.now()<end){try{const value=check();if(value)return value;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('native barrier timed out');}
function session(app){const p=spawn('docker',args(app),{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);const done=new Promise(r=>p.once('close',code=>r({code,out,err})));sessions.push(p);return {p,done,ready:()=>out.includes('READY')};}
const actor=`begin;set local statement_timeout='15s';set local role authenticated;select set_config('request.jwt.claim.sub','${owner}',true);`;
const counts=()=>sql('select (select count(*) from r7_private.versions)||\'/\'||(select count(*) from r7_private.confirmations)||\'/\'||(select count(*) from r7_private.audit)');
const latest=()=>JSON.parse(sql('select row_to_json(v) from public.intro_versions v order by version desc limit 1'));
const payload=JSON.stringify(JSON.parse(await readFile('apps/web/intro-r7.json','utf8')));
const action=(kind)=>{const v=Number(sql('select coalesce(max(version),0) from r7_private.versions'));return kind==='save'?`select public.save_r7_intro('${org}','${randomUUID()}',${v},'${hash}','${source}',${quote(payload)}::json);`:`select public.confirm_r7_intro('${org}','${randomUUID()}',${v},'${hash}','${source}','${latest().id}');`;};
const lock=`select pg_advisory_xact_lock(hashtextextended('${org}',0));`;
const blocked=(holder,waiter)=>until(()=>{const proof=sql(`select json_build_object('holder',a.pid,'waiter',b.pid,'observer',pg_backend_pid()) from pg_stat_activity a,pg_stat_activity b where a.application_name='${holder}' and b.application_name='${waiter}' and a.pid=any(pg_blocking_pids(b.pid))`);if(!proof)return null;const p=JSON.parse(proof);assert.equal(new Set(Object.values(p)).size,3);return p;});
const deny=async s=>{const r=await s.done;assert.notEqual(r.code,0,r.out);assert.match(r.err,/42501/);};
try{
 docker(['run','--pull=never','--detach','--rm','--network','none','--name',name,'-e','POSTGRES_HOST_AUTH_METHOD=trust',image,'postgres','-c','listen_addresses=']);started=true;
 await until(()=>docker(['exec',name,'cat','/proc/1/comm'])==='postgres'&&sql('select 1')==='1',40000);assert.match(sql('show server_version'),/^17\.6/);assert.equal(sql('show listen_addresses'),'');
 sql(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${owner}');`);
 const files={};const hashes=JSON.parse(await readFile('supabase/drafts/r7_intro/SHA256.json','utf8'));
 for(const n of ['proposal.sql','enable.sql','disable.sql']){files[n]=await readFile('supabase/drafts/r7_intro/'+n,'utf8');assert.equal(createHash('sha256').update(files[n]).digest('hex'),hashes[n]);}
 sql(files['proposal.sql']);
 const enable=()=>sql(`select set_config('r7.actor_id','${owner}',false),set_config('r7.organization_id','${org}',false),set_config('r7.expires_at',(clock_timestamp()+interval '5 minutes')::text,false);`+files['enable.sql']);
 enable();sql(actor+action('save')+'commit;');
 for(const kind of ['save','confirm'])for(const mode of ['expiry','disable']){
 enable();if(mode==='expiry')sql("update r7_private.write_gate set expires_at=clock_timestamp()+interval '3 seconds'");
 const before=counts(),hname=kind+'-'+mode+'-holder',wname=kind+'-'+mode+'-waiter',h=session(hname),w=session(wname);
 h.p.stdin.write('begin;'+lock+"select 'READY';\n");await until(h.ready);w.p.stdin.end(actor+action(kind)+'commit;\n');const proof=await blocked(hname,wname);
 if(mode==='expiry')await until(()=>sql('select expires_at<=clock_timestamp() from r7_private.write_gate')==='t');else sql(files['disable.sql']);
 h.p.stdin.end('commit;\n');assert.equal((await h.done).code,0);await deny(w);assert.equal(counts(),before);console.log('PASS queued '+kind+' rejects '+mode+'; zero version/confirmation/audit delta '+JSON.stringify(proof));
 }
 // Disable starts first but is uncommitted: writer passes optimistic read, then waits on gate row.
 enable();const before=counts(),d=session('disable-first'),w=session('gate-waiter');d.p.stdin.write(files['disable.sql'].replace(/commit;\s*$/,'')+"select 'READY';\n");await until(d.ready);w.p.stdin.end(actor+action('save')+'commit;\n');const proof=await blocked('disable-first','gate-waiter');d.p.stdin.end('commit;\n');assert.equal((await d.done).code,0);await deny(w);assert.equal(counts(),before);console.log('PASS gate row wait observes committed disable '+JSON.stringify(proof));
 // Admitted writer owns SHARE until commit. Disable must wait; it is effective at its own commit.
 enable();const admitted=session('admitted-writer');admitted.p.stdin.write(actor+action('save')+"select 'READY';\n");await until(admitted.ready);const closing=session('disable-after');closing.p.stdin.end(files['disable.sql']);const proof2=await blocked('admitted-writer','disable-after');admitted.p.stdin.end('commit;\n');assert.equal((await admitted.done).code,0);assert.equal((await closing.done).code,0);assert.equal(sql('select enabled from r7_private.write_gate'),'f');assert.throws(()=>sql(actor+action('save')+'commit;'),/42501/);console.log('PASS disable waits for admitted writer then blocks later writers '+JSON.stringify(proof2));
 // A later DML lock crosses expiry: final check rolls back version AND audit.
 enable();sql("update r7_private.write_gate set expires_at=clock_timestamp()+interval '3 seconds'");const beforeLate=counts(),a=session('audit-holder'),b=session('late-body');a.p.stdin.write("begin;lock table r7_private.audit in share mode;select 'READY';\n");await until(a.ready);b.p.stdin.end(actor+action('save')+'commit;\n');const proof3=await blocked('audit-holder','late-body');await until(()=>sql('select expires_at<=clock_timestamp() from r7_private.write_gate')==='t');a.p.stdin.end('commit;\n');assert.equal((await a.done).code,0);await deny(b);assert.equal(counts(),beforeLate);console.log('PASS expiry during audit wait rolls back whole write '+JSON.stringify(proof3));
 console.log('PASS 7 native multi-connection deadline/disable cases; isolated PG17 only');
}finally{for(const p of sessions)if(p.exitCode===null){p.stdin.destroy();p.kill('SIGTERM');}if(started)docker(['rm','-f',name]);}
