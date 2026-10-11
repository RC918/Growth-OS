import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {initialize,runBatch,readback,safeDiagnostic} from './runner.mjs';
import {TRIAL,FOLLOW_ON,EXECUTOR,FOLLOW_ON_APPROVED_AT,EXPIRES_AT,CAP_NUSD,payload,MODEL,readiness} from './policy.mjs';
import {OLD_RESERVED_AT} from './follow-on-state.mjs';
import {digest,validateArtifact} from '../../apps/web/intro-candidate.mjs';
const manifest=JSON.parse(await readFile(new URL('./sources.json',import.meta.url)));
const clock=()=>FOLLOW_ON_APPROVED_AT+1000;
const sha=s=>createHash('sha256').update(s).digest('hex');
async function fixture(t){
 const parent=await mkdtemp(join(tmpdir(),'intro-r2-')),root=join(parent,'r2'),priorRoot=join(parent,'old');t.after(()=>rm(parent,{recursive:true,force:true}));await mkdir(priorRoot);
 const manifestHash=await digest(manifest),request_id=TRIAL+'-1';
 const events=[{type:'initialized',trial:TRIAL,execution_task_id:EXECUTOR,manifest_hash:manifestHash,activation_hash:'a'.repeat(64)},{type:'reserved',case_id:'public-intro',kind:'generate',request_id,payload_hash:await digest(payload(manifest.cases[0].source)),max_nusd:CAP_NUSD,at:OLD_RESERVED_AT},{type:'UNKNOWN_STOP',request_id,held_nusd:CAP_NUSD,calls:1}];
 const oldBytes=events.map(JSON.stringify).join('\n')+'\n';await writeFile(join(priorRoot,'journal.jsonl'),oldBytes);await writeFile(join(priorRoot,'manifest.json'),JSON.stringify(manifest));await writeFile(join(priorRoot,'created.once'),TRIAL+'\n');
 const preflight={trial:FOLLOW_ON,ownerApproval:'2026-10-09T04:25:05Z',executionTaskId:EXECUTOR,soleExecutionTask:true,credentialBindingVerified:true,globalStandardVerified:true,platformProxyAuthorized:true,priorTrial:TRIAL,priorHeldNusd:CAP_NUSD,cumulativeCapNusd:2*CAP_NUSD,taxRatePercent:5,taxFeeCeilingNusd:15337500,priorJournalSha256:sha(oldBytes),reviewedHead:'a'.repeat(40),evidence:'SYNTHETIC ONLY'};
 return {root,priorRoot,preflight,manifestHash,clock,oldBytes};
}
async function prepare(a){await initialize(a.root,manifest,a.preflight,clock(),a.priorRoot);}
const fake=async(kind,body,id)=>{
 assert.equal(kind,'generate');assert.equal(id,FOLLOW_ON+'-1');assert.equal(body.model,MODEL);assert.equal(body.max_output_tokens,1500);assert.ok(Buffer.byteLength(JSON.stringify(body))<=4096);
 const source=manifest.cases[0].source,output={candidate:source.fields.intro_description,reason:'Preserve supported source.',citations:[{field:'intro_description',quote:source.fields.intro_description}]};
 return {requestId:id,body:{id:'resp_fake_r2',model:MODEL,status:'completed',service_tier:'default',usage:{input_tokens:5001,output_tokens:100,total_tokens:5101},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(output)}]}]}};
};
test('fixed second attempt retains old UNKNOWN bytes/mtime; one new prewrite reservation gives cumulative two dollars; artifact remains UI compatible',async t=>{
 const a=await fixture(t),before=await stat(join(a.priorRoot,'journal.jsonl'));await prepare(a);let calls=0;
 const args={...a,transport:async(...v)=>{calls++;const r=await readback(a.root);assert.equal(r.calls,1);assert.equal(r.prior_held_nusd,CAP_NUSD);assert.equal(r.cumulative_reserved_nusd,2*CAP_NUSD);assert.equal(r.events[1].prior_reservation.journal_sha256,a.preflight.priorJournalSha256);return fake(...v);}};
 const r=await runBatch(args);assert.equal(r.trial,FOLLOW_ON);assert.equal(r.state,'complete');await runBatch(args);assert.equal(calls,1);
 const artifact=JSON.parse(await readFile(join(a.root,'public-intro.candidate.json')));assert.equal(artifact.trial,TRIAL);assert.equal(artifact.receipt.request_id,FOLLOW_ON+'-1');await validateArtifact(artifact,manifest.cases[0].source);
 assert.equal(await readFile(join(a.priorRoot,'journal.jsonl'),'utf8'),a.oldBytes);assert.equal((await stat(join(a.priorRoot,'journal.jsonl'))).mtimeMs,before.mtimeMs);assert.equal((await readback(a.priorRoot)).state,'STOPPED_OR_UNKNOWN');await assert.rejects(prepare(a),/EXISTING_STATE/);
});
test('second UNKNOWN holds cumulative US2 permanently; restart cannot dispatch or reprepare',async t=>{
 const a=await fixture(t);await prepare(a);let calls=0;const args={...a,transport:async()=>{calls++;throw Object.assign(Error('FAKE_SECRET'),{code:'ECONNRESET'});}};
 let error;try{await runBatch(args);}catch(e){error=e;}assert.match(error.message,/UNKNOWN_STOP/);assert.equal(safeDiagnostic(error).client_request_id,FOLLOW_ON+'-1');
 assert.equal((await readback(a.root)).cumulative_reserved_nusd,2*CAP_NUSD);await assert.rejects(runBatch(args),/PRIOR_DISPATCH/);await assert.rejects(prepare(a),/EXISTING_STATE/);assert.equal(calls,1);assert.equal(await readFile(join(a.priorRoot,'journal.jsonl'),'utf8'),a.oldBytes);
});
for(const [name,patch] of [['wrong executor',{executionTaskId:'other-task'}],['absent-root fiction',{priorStateConfirmedAbsent:true}],['old hold forgotten',{priorHeldNusd:0}],['third-dollar cap',{cumulativeCapNusd:3*CAP_NUSD}],['different tax',{taxRatePercent:0}],['proxy unattested',{platformProxyAuthorized:false}],['wrong approval',{ownerApproval:'old'}],['missing prior hash',{priorJournalSha256:''}]])test(name+' blocks R2 before creating state',async t=>{
 const a=await fixture(t);a.preflight={...a.preflight,...patch};await assert.rejects(prepare(a));await assert.rejects(stat(a.root),/ENOENT/);
});
test('original deadline remains and 40 second dispatch margin is required',()=>{
 assert.throws(()=>readiness({trial:FOLLOW_ON},EXPIRES_AT-40000),/TRIAL_WINDOW_CLOSED/);assert.throws(()=>readiness({trial:FOLLOW_ON},FOLLOW_ON_APPROVED_AT-1),/TRIAL_WINDOW_CLOSED/);
});
test('missing, changed or wrong-task prior ledger cannot create R2; original root cannot be reused',async t=>{
 const a=await fixture(t);await assert.rejects(initialize(a.priorRoot,manifest,a.preflight,clock(),a.priorRoot),/PRIOR_RESERVATION/);
 await assert.rejects(initialize(a.root,manifest,a.preflight,clock(),join(a.priorRoot,'missing')),/ENOENT/);
 const events=a.oldBytes.trim().split('\n').map(JSON.parse);events[0].execution_task_id='other';const altered=events.map(JSON.stringify).join('\n')+'\n';await writeFile(join(a.priorRoot,'journal.jsonl'),altered);
 await assert.rejects(prepare(a),/PRIOR_RESERVATION/);a.preflight.priorJournalSha256=sha(altered);await assert.rejects(prepare(a),/PRIOR_RESERVATION/);await assert.rejects(stat(a.root),/ENOENT/);
});
test('old journal drift after prepare blocks before new reservation or transport',async t=>{
 const a=await fixture(t);await prepare(a);await writeFile(join(a.priorRoot,'journal.jsonl'),a.oldBytes+'\n');let calls=0;await assert.rejects(runBatch({...a,transport:async()=>calls++}),/PRIOR_RESERVATION/);assert.equal(calls,0);assert.equal((await readback(a.root)).calls,0);
});
test('concurrent second-attempt invocation cannot exceed cumulative two reservations',async t=>{
 const a=await fixture(t);await prepare(a);let enter,release,calls=0;const entered=new Promise(r=>enter=r),paused=new Promise(r=>release=r);
 const running=runBatch({...a,transport:async()=>{calls++;enter();await paused;throw Error('unknown');}});const stopped=assert.rejects(running,/UNKNOWN_STOP/);await entered;
 await assert.rejects(runBatch({...a,transport:async()=>calls++}),/EEXIST/);release();await stopped;assert.equal(calls,1);assert.equal((await readback(a.root)).cumulative_reserved_nusd,2*CAP_NUSD);
});
test('old prepare/live CLI is permanently readback-only without activation or secret lookup',()=>{
 for(const command of ['prepare','live']){const r=spawnSync(process.execPath,[new URL('./runner.mjs',import.meta.url).pathname,command],{env:{},encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/OLD_TRIAL_READBACK_ONLY/);}
});
test('SIGKILL after R2 reservation keeps both dollars and prevents a second dispatch',async t=>{
 const a=await fixture(t);await prepare(a);
 const script=`import {runBatch} from ${JSON.stringify(new URL('./runner.mjs',import.meta.url).href)};await runBatch({...${JSON.stringify({...a,clock:undefined})},clock:()=>${clock()},transport:async()=>{console.log('RESERVED');await new Promise(()=>setInterval(()=>{},1000));}});`;
 const p=spawn(process.execPath,['--input-type=module','-e',script],{env:{},stdio:['ignore','pipe','pipe']});t.after(()=>p.kill('SIGKILL'));p.stderr.resume();
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('child timeout')),5000);p.stdout.once('data',()=>{clearTimeout(timer);resolve();});p.once('exit',()=>{clearTimeout(timer);reject(Error('early child exit'));});});
 const exit=new Promise(r=>p.once('exit',(_,signal)=>r(signal)));p.kill('SIGKILL');assert.equal(await exit,'SIGKILL');assert.equal((await readback(a.root)).cumulative_reserved_nusd,2*CAP_NUSD);
 await assert.rejects(runBatch({...a,transport:async()=>assert.fail('must not resend')}),/EEXIST/);assert.equal(await readFile(join(a.priorRoot,'journal.jsonl'),'utf8'),a.oldBytes);
});
