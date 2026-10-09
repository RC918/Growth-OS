// Offline only. CI uses the pinned ./source checkout; local review can point
// INTRO_TEST_SOURCE at a clean checkout of that same immutable SOURCE_SHA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {REPO,SOURCE_SHA,TRIAL,TAG,REF,MODEL,DEADLINE,APPROVAL,CONFIRM,MANIFEST_HASH,PAYLOAD_HASH,hash,contextFromEnvironment,loadSource,reservationRecord,reserve,verifyReservation,generate,githubAPI,containsSecret,saveEvidence} from './intro-once.mjs';

const now=Date.parse(APPROVAL)+1000,clock=()=>now;
const sourceDir=process.env.INTRO_TEST_SOURCE||fileURLToPath(new URL('../source/',import.meta.url));
const source=await loadSource(sourceDir);
let run=1000;
const context=()=>({run_id:String(++run),run_attempt:1,workflow_sha:'a'.repeat(40)});
const fakeKey='FAKE_OPENAI_SECRET_ONLY_FOR_TESTS',fakeToken='FAKE_GITHUB_TOKEN_ONLY_FOR_TESTS';
const env=()=>({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:REPO,GITHUB_REF:'refs/heads/main',GITHUB_ACTOR:'RC918',GITHUB_TRIGGERING_ACTOR:'RC918',GITHUB_SHA:'a'.repeat(40),GITHUB_WORKFLOW_SHA:'a'.repeat(40),INTRO_REVIEWED_SHA:'a'.repeat(40),GITHUB_WORKFLOW_REF:REPO+'/.github/workflows/intro-once.yml@refs/heads/main',GITHUB_RUN_ID:'123456',GITHUB_RUN_ATTEMPT:'1',INTRO_CONFIRM:CONFIRM});
function githubFixture(){
 const state={tags:new Map(),ref:null,requests:[]};
 const api=async(method,path,body)=>{
  state.requests.push({method,path});
  if(method==='POST'&&path==='/git/tags'){
   const sha=createHash('sha1').update(JSON.stringify(body)).digest('hex');
   state.tags.set(sha,{sha,tag:body.tag,message:body.message,object:{type:body.type,sha:body.object}});
   return {status:201,body:{sha}};
  }
  if(method==='POST'&&path==='/git/refs'){
   if(state.ref)return {status:422,body:null};
   state.ref={ref:body.ref,object:{type:'tag',sha:body.sha}};return {status:201,body:structuredClone(state.ref)};
  }
  if(method==='GET'&&path==='/git/ref/tags/'+TAG)return {status:state.ref?200:404,body:structuredClone(state.ref)};
  if(method==='GET'&&path.startsWith('/git/tags/'))return {status:200,body:structuredClone(state.tags.get(path.slice('/git/tags/'.length)))};
  assert.fail('unexpected GitHub method/path');
 };
 return {state,api};
}
async function prepared(){const ctx=context(),g=githubFixture(),tagSha=await reserve(ctx,g.api,clock);return {ctx,...g,tagSha};}
function responseBody(){return {id:'resp_fake_only',model:MODEL,status:'completed',service_tier:'default',usage:{input_tokens:5001,output_tokens:100,total_tokens:5101},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({candidate:source.source.fields.intro_description,reason:'Preserve source meaning.',citations:[{field:'intro_description',quote:source.source.fields.intro_description}]})}]}]};}
function args(p,fetchImpl){return {...p,source,getKey:()=>fakeKey,otherSecrets:[fakeToken],fetchImpl,clock};}
test('fixed source and generation envelope have no count, tools or Cloud/R2 coupling',()=>{
 assert.equal(hash(source.body),PAYLOAD_HASH);assert.equal(Buffer.byteLength(JSON.stringify(source.body)),1733);
 assert.equal(source.source.url,'https://growthos.genman.work/ai-citation-check');assert.equal(source.body.model,MODEL);assert.equal(source.body.max_output_tokens,1500);assert.equal(source.body.reasoning.effort,'none');assert.equal(source.body.service_tier,'default');assert.equal(source.body.store,false);assert.equal(source.body.background,false);assert.equal(source.body.stream,false);assert.equal(source.body.truncation,'disabled');assert.deepEqual(source.body.tools,[]);assert.equal(source.body.tool_choice,'none');
});
test('context requires exact main/workflow/review SHA, Owner, explicit confirmation, first attempt and original deadline',()=>{
 assert.equal(contextFromEnvironment(env(),now).run_attempt,1);
 for(const patch of [{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_EVENT_NAME:'push'},{GITHUB_REF:'refs/heads/other'},{GITHUB_ACTOR:'other'},{GITHUB_TRIGGERING_ACTOR:'other'},{GITHUB_REPOSITORY:'fork/repo'},{INTRO_REVIEWED_SHA:'b'.repeat(40)},{GITHUB_WORKFLOW_SHA:'b'.repeat(40)},{INTRO_CONFIRM:''},{GITHUB_WORKFLOW_REF:'other'},{GITHUB_RUN_ID:'x\nsecret'},{GITHUB_ACTIONS:'false'}])assert.throws(()=>contextFromEnvironment({...env(),...patch},now));
 assert.throws(()=>contextFromEnvironment(env(),Date.parse(DEADLINE)-40000),/WINDOW_CLOSED/);assert.throws(()=>contextFromEnvironment(env(),Date.parse(APPROVAL)-1),/WINDOW_CLOSED/);
});
test('atomic fixed ref binds full immutable record; same-run and new-run reservation never resume',async()=>{
 const p=await prepared(),tag=p.state.tags.get(p.tagSha),record=JSON.parse(tag.message);
 assert.equal(record.workflow_sha,p.ctx.workflow_sha);assert.equal(record.source_sha,SOURCE_SHA);assert.equal(record.manifest_hash,MANIFEST_HASH);assert.equal(record.payload_hash,PAYLOAD_HASH);assert.equal(record.prior_held_nusd,5000000000);assert.equal(record.new_held_nusd,1000000000);assert.equal(record.cumulative_held_nusd,6000000000);assert.equal(record.run_id,p.ctx.run_id);
 await assert.rejects(reserve(p.ctx,p.api,clock),/ALREADY_RESERVED/);await assert.rejects(reserve(context(),p.api,clock),/ALREADY_RESERVED/);assert.equal(p.state.ref.object.sha,p.tagSha);assert.ok(p.state.requests.every(r=>['GET','POST'].includes(r.method)));
});
test('concurrent different runs yield exactly one reservation permit',async()=>{
 const g=githubFixture(),a=context(),b=context();const results=await Promise.allSettled([reserve(a,g.api,clock),reserve(b,g.api,clock)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
});
test('unknown create response consumes ref but emits no permit, including same-run retry',async()=>{
 const g=githubFixture(),ctx=context();const api=async(...v)=>{const r=await g.api(...v);if(v[0]==='POST'&&v[1]==='/git/refs')throw Error(fakeToken);return r;};
 await assert.rejects(reserve(ctx,api,clock));assert.ok(g.state.ref);await assert.rejects(reserve(ctx,g.api,clock),/ALREADY_RESERVED/);
});
test('successful create with wrong readback cannot emit permit',async()=>{
 const g=githubFixture(),ctx=context();const api=async(...v)=>{const r=await g.api(...v);if(v[0]==='GET'&&v[1].startsWith('/git/tags/'))r.body.message='{}\n';return r;};
 await assert.rejects(reserve(ctx,api,clock),/RESERVATION_MISMATCH/);assert.ok(g.state.ref);await assert.rejects(reserve(ctx,g.api,clock),/ALREADY_RESERVED/);
});
test('both jobs reject run_attempt >1 before any GitHub or model request',async()=>{
 let requests=0;const api=async()=>{requests++;throw Error('must not access');},ctx={...context(),run_attempt:2};await assert.rejects(reserve(ctx,api,clock),/RERUN_FORBIDDEN/);
 const r=await generate(args({ctx,api,tagSha:'a'.repeat(40)},async()=>requests++));assert.equal(r.error_code,'RERUN_FORBIDDEN');assert.equal(r.dispatch,'not_invoked');assert.equal(requests,0);
});
test('generation verifies all record fields and current run before credential access',async()=>{
 for(const field of ['run_id','run_attempt','workflow_sha','source_sha','manifest_hash','payload_hash','prior_held_nusd','new_held_nusd','cumulative_held_nusd','deadline']){
  const p=await prepared(),tag=p.state.tags.get(p.tagSha),record=JSON.parse(tag.message);record[field]='wrong';tag.message=JSON.stringify(record)+'\n';let keys=0,calls=0;
  const r=await generate({...args(p,async()=>calls++),getKey:()=>{keys++;return fakeKey;}});assert.equal(r.error_code,'RESERVATION_MISMATCH');assert.equal(keys,0);assert.equal(calls,0);
 }
});
test('one POST after exact readback; candidate remains compatible, measured usage retained, billing unknown',async()=>{
 const p=await prepared();let calls=0;
 const send=async(url,o)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(o.method,'POST');assert.equal(o.redirect,'error');assert.equal(o.headers.Authorization,'Bearer '+fakeKey);assert.equal(o.headers['X-Client-Request-Id'],TRIAL+'-'+p.ctx.run_id);assert.equal(o.body,JSON.stringify(source.body));assert.ok(o.signal instanceof AbortSignal);assert.ok(p.state.ref);return new Response(JSON.stringify(responseBody()),{headers:{'x-request-id':'req_'+'a'.repeat(32)}});};
 const r=await generate(args(p,send));assert.equal(r.state,'COMPLETE_HELD_REVIEW_REQUIRED');assert.equal(r.billed_nusd,null);assert.equal(r.usage.input_tokens,5001);assert.ok(r.estimated_with_tax_nusd<1000000000);await source.contract.validateArtifact(r.candidate,source.source);
 assert.equal(containsSecret(r,[fakeKey,fakeToken]),false);assert.equal((await generate(args(p,send))).error_code,'LOCAL_REENTRY');assert.equal(calls,1);
});
test('deadline rechecked after remote readback and immediately before dispatch',async()=>{
 const p=await prepared();let ticks=0,calls=0;const r=await generate({...args(p,async()=>calls++),clock:()=>++ticks===1?now:Date.parse(DEADLINE)-40000});assert.equal(r.error_code,'WINDOW_CLOSED');assert.equal(r.dispatch,'not_invoked');assert.equal(calls,0);
});
test('conservative full-context plus output limit and 5 percent tax fit the new all-in dollar, not an invoice',async()=>{
 const p=await prepared(),b=responseBody();b.usage={input_tokens:400000,output_tokens:1500,total_tokens:401500};const r=await generate(args(p,async()=>new Response(JSON.stringify(b))));assert.equal(r.state,'COMPLETE_HELD_REVIEW_REQUIRED');assert.equal(r.estimated_with_tax_nusd,322087500);assert.equal(r.billed_nusd,null);assert.equal(r.record.cumulative_held_nusd,6000000000);
});
test('missing credential does not issue an authentication probe or release reservation',async()=>{
 const p=await prepared();let calls=0;const r=await generate({...args(p,async()=>calls++),getKey:()=>''});assert.equal(r.error_code,'CREDENTIAL_MISSING');assert.equal(calls,0);assert.equal(r.record.cumulative_held_nusd,6000000000);assert.ok(p.state.ref);
});
test('401 is one call, raw error body/header never read or published, usage and billing remain unknown',async()=>{
 const p=await prepared();let calls=0,reads=0;const r=await generate(args(p,async()=>{calls++;return {status:401,headers:new Headers({'x-request-id':fakeKey,Authorization:fakeToken}),body:{cancel:async()=>{},getReader:()=>{reads++;throw Error(fakeKey);}}};}));assert.equal(calls,1);assert.equal(reads,0);assert.equal(r.http_status,401);assert.equal(r.provider_request_id,null);assert.equal(r.usage,null);assert.equal(r.billed_nusd,null);assert.equal(r.error_code,'HTTP_UNKNOWN');assert.equal(containsSecret(r,[fakeKey,fakeToken]),false);assert.ok(p.state.ref);
});
test('network timeout/error stops with unknown delivery, no raw exception or automatic retry',async()=>{
 const p=await prepared();let calls=0;const send=async()=>{calls++;throw Object.assign(Error(fakeKey),{stack:fakeToken,cause:{secret:fakeKey}});};const r=await generate(args(p,send));assert.equal(r.dispatch,'invoked_delivery_unknown');assert.equal(r.usage,null);assert.equal(r.billed_nusd,null);assert.equal(containsSecret(r,[fakeKey,fakeToken]),false);await generate(args(p,send));assert.equal(calls,1);
});
for(const [name,change] of [['wrong model',b=>b.model='other'],['missing usage',b=>delete b.usage],['input limit',b=>b.usage.input_tokens=400001],['output limit',b=>b.usage.output_tokens=1501],['inconsistent usage',b=>b.usage.total_tokens++],['incomplete',b=>b.status='incomplete'],['priority',b=>b.service_tier='priority'],['tool',b=>b.output.push({type:'function_call'})],['forged quote',b=>b.output[0].content[0].text=JSON.stringify({candidate:'fake',reason:'fake',citations:[{field:'intro_description',quote:'invented'}]})]])test(name+' blocks candidate and retains full reservation',async()=>{
 const p=await prepared(),b=responseBody();change(b);let calls=0;const r=await generate(args(p,async()=>{calls++;return new Response(JSON.stringify(b));}));assert.equal(r.state,'STOPPED_HELD_READBACK_ONLY');assert.equal(r.candidate,null);assert.equal(r.record.cumulative_held_nusd,6000000000);assert.equal(calls,1);
});
test('secret/encoded secret in a candidate is never persisted; valid artifact has exact content hash and is not overwritten',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'intro-actions-result-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 for(const secret of [fakeKey,Buffer.from(fakeToken).toString('base64')]){
  const p=await prepared(),b=responseBody(),o=JSON.parse(b.output[0].content[0].text);o.candidate=secret;b.output[0].content[0].text=JSON.stringify(o);const r=await generate(args(p,async()=>new Response(JSON.stringify(b))));assert.equal(r.error_code,'SECRET_IN_RESULT');assert.equal(r.candidate,null);assert.equal(containsSecret(r,[fakeKey,fakeToken]),false);
 }
 await assert.rejects(saveEvidence(dir,{candidate:fakeKey},[fakeKey]),/SECRET_IN_RESULT/);await assert.rejects(stat(join(dir,'result.json')),/ENOENT/);
 const p=await prepared(),r=await generate(args(p,async()=>new Response(JSON.stringify(responseBody())))),digest=await saveEvidence(dir,r,[fakeKey,fakeToken]);assert.equal(hash(await readFile(join(dir,'result.json'),'utf8')),digest);await assert.rejects(saveEvidence(dir,r,[fakeKey,fakeToken]),/EEXIST/);
});
test('unparseable or oversized response is sanitized and cannot be retried',async()=>{
 for(const raw of [fakeKey,'x'.repeat(65537)]){const p=await prepared();const r=await generate(args(p,async()=>new Response(raw)));assert.equal(r.candidate,null);assert.equal(r.usage,null);assert.equal(containsSecret(r,[fakeKey,fakeToken]),false);}
});
test('GitHub client has fixed routes, no redirect/retry and does not expose upstream raw errors',async()=>{
 let calls=0;const api=githubAPI(()=>fakeToken,async(url,o)=>{calls++;assert.match(url,/^https:\/\/api.github.com\/repos\/RC918\/Growth-OS\/git\//);assert.equal(o.redirect,'error');throw Error(fakeToken);});await assert.rejects(api('GET','/git/ref/tags/'+TAG),/^Error: GH_UNKNOWN$/);assert.equal(calls,1);await assert.rejects(api('DELETE','/git/ref/tags/'+TAG),/GH_UNKNOWN/);assert.equal(calls,1);
});
test('workflow isolates permissions, pins every action and both source/code SHAs, uploads one explicit safe file for 7 days',async()=>{
 const w=await readFile(new URL('../.github/workflows/intro-once.yml',import.meta.url),'utf8');
 assert.match(w,/^on:\n  workflow_dispatch:/m);assert.doesNotMatch(w,/^  (push|pull_request|schedule|workflow_call):/m);assert.match(w,/^permissions: \{\}/m);
 const reservation=w.split('  reservation:\n')[1].split('  generation:\n')[0],generation=w.split('  generation:\n')[1];
 assert.match(reservation,/contents: write/);assert.doesNotMatch(reservation,/secrets\.|environment:/);assert.match(generation,/permissions:\n      contents: read\n/);assert.doesNotMatch(generation,/contents: write/);assert.match(generation,/environment: intro-trial-once/);
 assert.match(reservation,/if: github.run_attempt == 1/);assert.match(generation,/if: github.run_attempt == 1/);
 for(const use of w.matchAll(/uses: ([^\s]+)/g))assert.match(use[1],/^actions\/(checkout|setup-node|upload-artifact)@[a-f0-9]{40}$/);
 assert.equal((w.match(/ref: \$\{\{ github.sha \}\}/g)||[]).length,3);assert.equal((w.match(new RegExp('ref: '+SOURCE_SHA,'g'))||[]).length,3);assert.equal((w.match(/persist-credentials: false/g)||[]).length,6);
 assert.equal((w.match(/secrets\.OPENAI_API_KEY/g)||[]).length,1);assert.equal((w.match(/node scripts\/intro-once.mjs generate/g)||[]).length,1);assert.equal((w.match(/uses: actions\/upload-artifact/g)||[]).length,1);assert.match(w,/path: evidence\/result.json\n          retention-days: 7/);assert.match(w,/overwrite: false/);assert.doesNotMatch(w,/--use-env-proxy|continue-on-error/);
});

async function loopback(t,{lostCreate=false,redirect=false,hang=false}={}){
 const g=githubFixture(),counts={model:0,forbidden:0};let lose=lostCreate;
 let entered;const modelEntered=new Promise(r=>entered=r);
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  if(req.url==='/v1/responses'){
   counts.model++;assert.equal(req.headers.authorization,'Bearer '+fakeKey);assert.equal(hash(JSON.parse(raw)),PAYLOAD_HASH);
   entered();if(hang)return;
   if(redirect){res.writeHead(302,{Location:'http://127.0.0.1:'+server.address().port+'/forbidden'});res.end();return;}
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(responseBody()));return;
  }
  if(req.url==='/forbidden'){counts.forbidden++;res.end();return;}
  assert.equal(req.headers.authorization,'Bearer '+fakeToken);
  const path=req.url.replace('/repos/'+REPO,''),r=await g.api(req.method,path,raw?JSON.parse(raw):undefined);
  if(lose&&req.method==='POST'&&path==='/git/refs'){lose=false;req.socket.destroy();return;}
  res.writeHead(r.status,{'Content-Type':'application/json'});res.end(JSON.stringify(r.body));
 });
 const sockets=new Set();server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));});
 return {...g,counts,modelEntered,origin:'http://127.0.0.1:'+server.address().port};
}
async function child(origin,ctx,onChild=()=>{}){
 const moduleURL=new URL('./intro-once.mjs',import.meta.url).href;
 const script=`import {loadSource,githubAPI,reserve,generate} from ${JSON.stringify(moduleURL)};
 const local=async(url,options)=>{const u=new URL(url);if(!['api.github.com','api.openai.com'].includes(u.hostname))throw Error('forbidden');return fetch(${JSON.stringify(origin)}+u.pathname,options);};
 try{const source=await loadSource(${JSON.stringify(sourceDir)}),ctx=${JSON.stringify(ctx)},api=githubAPI(()=>${JSON.stringify(fakeToken)},local),clock=()=>${now};
 const tagSha=await reserve(ctx,api,clock);const r=await generate({ctx,source,api,tagSha,getKey:()=>${JSON.stringify(fakeKey)},otherSecrets:[${JSON.stringify(fakeToken)}],fetchImpl:local,clock});console.log(JSON.stringify({state:r.state,dispatch:r.dispatch}));if(r.state!=='COMPLETE_HELD_REVIEW_REQUIRED')process.exitCode=1;
 }catch{console.log('STOPPED_NO_RETRY');process.exitCode=1;}`;
 return new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,['--input-type=module','-e',script],{env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});onChild(p);let out='';p.stdout.on('data',v=>out+=v);p.stderr.resume();const timer=setTimeout(()=>{p.kill('SIGKILL');reject(Error('child timeout'));},10000);p.on('error',reject);p.on('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal,out});});
 });
}
test('real loopback child runs share remote reservation: first sends once, same/new run and rerun send zero',async t=>{
 const g=await loopback(t),ctx=context();const first=await child(g.origin,ctx);assert.equal(first.code,0);assert.match(first.out,/COMPLETE_HELD_REVIEW_REQUIRED/);assert.equal(g.counts.model,1);
 for(const other of [ctx,context(),{...ctx,run_attempt:2}])assert.equal((await child(g.origin,other)).code,1);assert.equal(g.counts.model,1);assert.equal(containsSecret(first.out,[fakeKey,fakeToken]),false);
 t.diagnostic('Real Node fetch child processes: persistent fake GitHub ref permits 1 model POST across 4 runs; all sockets loopback, fake credentials only.');
});
test('real loopback lost reservation acknowledgement never sends, including fresh child with same run',async t=>{
 const g=await loopback(t,{lostCreate:true}),ctx=context();assert.equal((await child(g.origin,ctx)).code,1);assert.ok(g.state.ref);assert.equal((await child(g.origin,ctx)).code,1);assert.equal(g.counts.model,0);
});
test('real loopback redirect is not followed and new process cannot retry the consumed attempt',async t=>{
 const g=await loopback(t,{redirect:true}),ctx=context();assert.equal((await child(g.origin,ctx)).code,1);assert.equal(g.counts.model,1);assert.equal(g.counts.forbidden,0);assert.equal((await child(g.origin,ctx)).code,1);assert.equal(g.counts.model,1);
});
test('SIGKILL after model POST leaves durable remote reservation and fresh child cannot resend',async t=>{
 const g=await loopback(t,{hang:true}),ctx=context();let process;
 const running=child(g.origin,ctx,p=>process=p);await g.modelEntered;process.kill('SIGKILL');assert.equal((await running).signal,'SIGKILL');assert.equal(g.counts.model,1);assert.ok(g.state.ref);
 assert.equal((await child(g.origin,ctx)).code,1);assert.equal(g.counts.model,1);
});
