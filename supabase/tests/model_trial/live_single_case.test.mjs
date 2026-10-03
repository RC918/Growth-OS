// Child processes execute the real CLI with fetch replaced before it loads.
// No credentials, real HTTP, Supabase, provider, browser, ledger or deployment.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const runner=fileURLToPath(new URL('./live_single_case.mjs',import.meta.url));
const fakeToken='OFFLINE_FAKE_JWT_MUST_NOT_BE_SAVED';
const fakeMailToken='OFFLINE_FAKE_MAIL_TOKEN';
const origin='https://vhzryhibmpvglzcmfnaa.supabase.co';
const redirect='https://growth-os-preview-a0rpg9s0x-morning-ai.vercel.app/workspace.html';
const actor='e85f1a90-3565-4fc1-a7e0-3b7d08830d0e';
const org='93a88055-0a0b-40c0-b22f-a6d312320001';
const preload=`
const scenario=process.env.RUNNER_SCENARIO;
Date.now=()=>Date.parse(scenario==='expired'?'2026-10-07T11:48:00Z':'2026-10-01T15:00:00Z');
globalThis.fetch=async (target,options={})=>{
 const u=new URL(target);let route;
 if(u.origin!==${JSON.stringify(origin)})throw Error('OFFLINE_UNEXPECTED_HOST');
 if(u.pathname==='/auth/v1/otp')route='otp';
 else if(u.pathname==='/auth/v1/verify')route='verify';
 else if(u.pathname==='/auth/v1/user')route='user';
 else if(u.pathname==='/rest/v1/organization_members')route='members';
 else if(u.pathname==='/functions/v1/growth-model-trial')route='model';
 else throw Error('OFFLINE_UNEXPECTED_ROUTE');
 console.log('OFFLINE_FETCH '+route);
 if(!(options.signal instanceof AbortSignal))throw Error('MISSING_TIMEOUT');
 const json=(body,status=200)=>Response.json(body,{status});
 if(route==='otp')return json({});
 if(route==='verify')return new Response(null,{status:303,headers:{location:${JSON.stringify(redirect+'#token_type=bearer&access_token='+fakeToken)}}});
 if(options.headers.Authorization!==${JSON.stringify('Bearer '+fakeToken)})throw Error('MISSING_OWNER_JWT');
 if(route==='user')return json({id:${JSON.stringify(actor)}});
 if(route==='members')return scenario==='owner-denied'?json([],403):json([{user_id:${JSON.stringify(actor)},organization_id:scenario==='wrong-org'?'cccccccc-cccc-4ccc-8ccc-cccccccccccc':${JSON.stringify(org)},role:'owner'}]);
 if(options.method!=='POST'||options.redirect!=='error')throw Error('BAD_MODEL_REQUEST');
 const body=JSON.parse(options.body);
 if(Object.keys(body).sort().join(',')!=='expected_version,fixture_id,organization_id,request_id'||body.organization_id!==${JSON.stringify(org)}||body.expected_version!==1)throw Error('BAD_ENVELOPE');
 if(scenario==='timeout')throw new DOMException(${JSON.stringify(fakeToken)},'TimeoutError');
 if(scenario==='model-denied')return json({code:'OWNER_REQUIRED'},403);
 if(scenario==='unknown')return json({code:'TRIAL_ATTEMPT_STOPPED',accounting:{state:'paused',held_nusd:420668800,spent_nusd:0,calls_reserved:2}},503);
 return json({synthetic_trial:true,can_persist:scenario==='persistable',proposal:{status:'awaiting_user_confirmation',inference_verified:false},accounting:{state:'active',held_nusd:0,spent_nusd:238000,calls_reserved:2}});
};`;
async function run(scenario,{fixture='synth-parts-v1',existing=false}={}){
 const dir=await mkdtemp(join(tmpdir(),'growth-runner-offline-'));const evidence=join(dir,'evidence.json');
 if(existing)await writeFile(evidence,'ORIGINAL_EVIDENCE');
 const child=spawn(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(preload),runner,fixture,evidence],{env:{RUNNER_SCENARIO:scenario},stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='',mailSent=false,dispatchSent=false;
 const timer=setTimeout(()=>child.kill('SIGTERM'),5000);
 child.stdout.on('data',chunk=>{
  stdout+=chunk;
  if(!mailSent&&stdout.includes('WAIT_FRESH_MAIL')){
   mailSent=true;
   if(scenario==='eof'){child.stdin.end();return;}
   const url=scenario==='insecure-link'?'http://bccjgibi.r.af.d.sendibt2.com/link':origin+'/auth/v1/verify?type=magiclink&redirect_to='+encodeURIComponent(redirect)+'&token='+fakeMailToken;
   child.stdin.write(JSON.stringify({html:'<a href="'+url+'">Sign in</a>'})+'\n');
  }
  if(!dispatchSent&&stdout.includes('AUTH_READY')){
   dispatchSent=true;child.stdin.write(JSON.stringify({dispatch:scenario==='wrong-dispatch'?'synth-shop-v1':fixture})+'\n');
  }
 });
 child.stderr.on('data',chunk=>{stderr+=chunk;});
 try{
  const result=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});
  clearTimeout(timer);assert.equal(result.signal,null,'child must finish without force-kill');
  const raw=await readFile(evidence,'utf8');
  for(const secret of [fakeToken,fakeMailToken])assert.ok(![stdout,stderr,raw].some(value=>value.includes(secret)),'credential markers must not reach outputs');
  return {...result,stdout,stderr,raw,evidence:existing?null:JSON.parse(raw),routes:[...stdout.matchAll(/OFFLINE_FETCH (\w+)/g)].map(m=>m[1])};
 }finally{clearTimeout(timer);child.stdin.destroy();await rm(dir,{recursive:true,force:true});}
}
test('each fixed fixture dispatches exactly once after owner validation, never writes a business RPC',async()=>{
 for(const fixture of ['synth-parts-v1','synth-shop-v1']){
  const r=await run('ok',{fixture});assert.equal(r.code,0);assert.equal(r.evidence.completed,true);assert.equal(r.evidence.fixture_id,fixture);
  assert.deepEqual(r.routes,['otp','verify','user','members','model']);assert.equal(r.evidence.model_posts,1);
 }
});
test('existing evidence is preserved and prevents even the OTP request',async()=>{
 const r=await run('ok',{existing:true});assert.equal(r.code,1);assert.equal(r.raw,'ORIGINAL_EVIDENCE');assert.deepEqual(r.routes,[]);
});
test('at reserve cutoff no Auth or model request is sent',async()=>{
 const r=await run('expired');assert.equal(r.code,1);assert.deepEqual(r.routes,[]);assert.equal(r.evidence.model_posts,0);
});
test('EOF and a non-HTTPS mail link stop before verification, without retrying OTP',async()=>{
 for(const scenario of ['eof','insecure-link']){const r=await run(scenario);assert.equal(r.code,1);assert.deepEqual(r.routes,['otp']);assert.equal(r.evidence.model_posts,0);}
});
test('owner denial and mismatched organization prevent model dispatch',async()=>{
 for(const scenario of ['owner-denied','wrong-org']){const r=await run(scenario);assert.equal(r.code,1);assert.deepEqual(r.routes,['otp','verify','user','members']);assert.equal(r.evidence.model_posts,0);}
});
test('wrong dispatch record prevents a model call after successful Auth',async()=>{
 const r=await run('wrong-dispatch');assert.equal(r.code,1);assert.equal(r.evidence.owner_verified,true);assert.ok(!r.routes.includes('model'));assert.equal(r.evidence.model_posts,0);
});
test('model rejection and timeout each stop after one POST, without refresh or retry',async()=>{
 for(const scenario of ['model-denied','timeout']){const r=await run(scenario);assert.equal(r.code,1);assert.equal(r.evidence.completed,false);assert.deepEqual(r.routes,['otp','verify','user','members','model']);assert.equal(r.evidence.model_posts,1);}
});
test('unknown usage preserves returned held amount, never settles/refunds through another request',async()=>{
 const r=await run('unknown');assert.equal(r.code,1);assert.equal(r.evidence.accounting.held_nusd,420668800);assert.equal(r.evidence.accounting.state,'paused');assert.equal(r.evidence.completed,false);assert.deepEqual(r.routes,['otp','verify','user','members','model']);
});
test('a persistable response cannot be labelled completed',async()=>{
 const r=await run('persistable');assert.equal(r.code,1);assert.equal(r.evidence.completed,false);assert.equal(r.evidence.model_posts,1);
});
