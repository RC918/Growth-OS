// Explicit isolated fixture acceptance. Tokens and login links stay in memory.
// Input: fresh Gmail HTML bodies as JSON lines on stdin; output: safe status only.
import {createInterface} from 'node:readline';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createWorkspaceApi} from '../../apps/web/workspace-api.mjs';
const origin='https://vhzryhibmpvglzcmfnaa.supabase.co';
const key='sb_publishable_B9pMiED8jrCoxuy2kC0HoA_LmzKex9r';
const redirect='https://growth-os-preview-a0rpg9s0x-morning-ai.vercel.app/workspace.html';
const orgA='93a88055-0a0b-40c0-b22f-a6d312320001',orgB='93a88055-0a0b-40c0-b22f-a6d312320002';
const goal='5055ca31-40cc-435d-9f52-cdf19166440c';
const input=createInterface({input:process.stdin,terminal:false});
const lines=input[Symbol.asyncIterator]();
const results=[];let stage="start";
async function request(path,token,body) {
 const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{apikey:key,...(token?{Authorization:`Bearer ${token}`}:{}) ,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
 const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data={format:'non-json'};}return {status:response.status,data};
}
async function login(email) {
 stage="request-mail";
 if (!(email==='ryan2939x@gmail.com' && process.argv.includes('--reuse-owner-request'))) {
  const sent=await request('/auth/v1/otp?redirect_to='+encodeURIComponent(redirect),null,{email,create_user:false});assert.equal(sent.status,200);
 }console.log('WAIT_MAIL '+email);
 const line=await lines.next();assert.equal(line.done,false);
 stage="read-mail-input";const {html,link}=JSON.parse(line.value);
 const href=link || [...html.matchAll(/href=["']([^"']+)["']/g)].map(m=>m[1].replaceAll('&amp;','&')).find(h=>h.startsWith('https://'));
 stage="parse-mail-link";assert.ok(href);let url=new URL(href);
 for(let i=0;i<5;i++) {
  stage="follow-login-link-"+i;
  if(url.origin===origin) {
   assert.equal(url.pathname,'/auth/v1/verify');assert.equal(url.searchParams.get('type'),'magiclink');assert.equal(url.searchParams.get('redirect_to'),redirect);
  }else assert.match(url.hostname,/^bccjgibi\.r\.[a-z]+\.d\.sendibt[23]\.com$/);
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(30000)});const location=response.headers.get('location');assert.ok(location);url=new URL(location,url);
  if(url.origin===new URL(redirect).origin) {
   assert.equal(url.pathname,'/workspace.html');const params=new URLSearchParams(url.hash.slice(1));assert.equal(params.get('token_type'),'bearer');assert.ok(params.get('access_token'));return {token:params.get('access_token'),fragment:url.hash};
  }
 }
 throw Error('No allowed Auth callback');
}
const pass=(name,details={})=>{stage=name;results.push({name,...details});console.log('PASS '+name);};
try {
 const owner=await login('ryan2939x@gmail.com');
 const api=createWorkspaceApi({origin,key,redirectOrigin:new URL(redirect).origin});
 await api.completeMagicLink(owner.fragment);const before=await api.readGoal(goal);const version=before.length;assert.ok(version>=10);
 if(!process.argv.includes('--remaining-only') && !process.argv.includes('--concurrency-only') && !process.argv.includes('--sequential-conflict-only')) {
 pass('fresh real owner Auth and existing ten-turn readback');
 const viewer=await login('ryan2939x+growthosviewer@gmail.com');
 const viewerUser=await request('/auth/v1/user',viewer.token);assert.equal(viewerUser.status,200);
 for(const table of ['growth_goals','growth_goal_turns']) {
  const read=await request(`/rest/v1/${table}?select=id&organization_id=eq.${orgA}`,viewer.token);assert.equal(read.status,200);assert.deepEqual(read.data,[]);pass('real viewer cross-tenant '+table+' read denied');
 }
 for(const [name,token,org] of [['viewer own workspace',viewer.token,orgB],['viewer foreign workspace',viewer.token,orgA],['owner foreign workspace',owner.token,orgB]]) {
  // Invalid key prevents changes even if an authorization regression occurs.
  const probe=await request('/rest/v1/rpc/save_goal_turn',token,{p_organization_id:org,p_goal_id:goal,p_request_id:randomUUID(),p_expected_version:10,p_question_key:'invalid_probe_never_write',p_answer:'synthetic authorization probe'});
  assert.equal(probe.status,403);assert.equal(probe.data.code,'42501');pass('new RPC '+name+' denied',{http:probe.status,code:probe.data.code});
 }
 }
 if(!process.argv.includes('--concurrency-only') && !process.argv.includes('--sequential-conflict-only')) {
 const parts=owner.token.split('.');const badToken=parts.slice(0,2).join('.')+'.'+(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
 let corrupt=false;
 const recovering=createWorkspaceApi({origin,key,redirectOrigin:new URL(redirect).origin,fetchImpl:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(30000),headers:{...options.headers,...(corrupt?{Authorization:`Bearer ${badToken}`}:{})}})});
 await recovering.completeMagicLink(owner.fragment);corrupt=true;
 await assert.rejects(()=>recovering.readGoal(goal),/HTTP 401/);pass('real Data API HTTP 401 rejects deliberately invalid JWT');
 await assert.rejects(()=>recovering.completeMagicLink(owner.fragment),/HTTP 401|HTTP 403/);
 assert.throws(()=>recovering.listGoals(),/請先選擇工作區|請先登入/);pass('failed real Auth clears in-memory workspace');
 corrupt=false;await recovering.completeMagicLink(owner.fragment);assert.equal((await recovering.readGoal(goal)).length,version);pass('real Auth revalidation restores saved data after 401');
 }
 // Two HTTP requests overlap in the client. This asserts competing-version API
 // behavior, not PostgreSQL backend PID overlap or transaction scheduling.
 const sequential=process.argv.includes('--sequential-conflict-only');
 const send=index=>{
  const start=performance.now();return request('/rest/v1/rpc/save_goal_turn',owner.token,{p_organization_id:orgA,p_goal_id:goal,p_request_id:randomUUID(),p_expected_version:version,p_question_key:'audience',p_answer:`合成 API 並行驗收 ${index+1}：海外工業採購`}).then(r=>({...r,start,end:performance.now()}));
 };
 const calls=[];if(sequential){calls.push(Promise.resolve(await send(0)));calls.push(Promise.resolve(await send(1)));}else{calls.push(send(0),send(1));}
 stage=sequential?'sequential version-conflict requests':'concurrent HTTP requests';const settled=await Promise.allSettled(calls);results.push({name:'request completion evidence',baselineVersion:version,requests:settled.map(r=>r.status==='fulfilled'?{status:r.value.status,code:r.value.data?.code,format:r.value.data?.format,start:r.value.start,end:r.value.end}:{error:r.reason.name})});assert.ok(settled.every(r=>r.status==='fulfilled'));const pair=settled.map(r=>r.value);results.push({name:sequential?'sequential response evidence':'concurrent response evidence',baselineVersion:version,responses:pair.map(r=>({status:r.status,code:r.data?.code,format:r.data?.format,durationMs:r.end-r.start})),overlapMs:Math.min(...pair.map(r=>r.end))-Math.max(...pair.map(r=>r.start))});if(sequential){assert.ok(pair[1].start>=pair[0].end);assert.ok(pair[1].end-pair[1].start<10000);}else assert.ok(Math.max(...pair.map(r=>r.start))<Math.min(...pair.map(r=>r.end)));
 assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);assert.equal(pair.find(r=>r.status===409).data.code,'PT409');
 pass(sequential?'sequential real-owner save succeeds and stale version quickly conflicts':'overlapping real-owner HTTP saves yield one append and one version conflict',{statuses:pair.map(r=>r.status),code:'PT409',overlapMs:Math.min(...pair.map(r=>r.end))-Math.max(...pair.map(r=>r.start))});
 const after=await api.readGoal(goal);assert.equal(after.length,version+1);assert.deepEqual(after.slice(0,version),before);
 if(!sequential) {
 await api.saveGoalTurn({goalId:goal,requestId:randomUUID(),expectedVersion:version+1,questionKey:'confirm',answer:'確認'});
 assert.equal((await api.readGoal(goal)).length,version+2);pass('previous turns preserved and synthetic goal reconfirmed',{version:version+2});
 }else {assert.equal(after.at(-1).answer_text,'合成 API 並行驗收 1：海外工業採購');pass('all previous turns and successful new answer preserved',{version:version+1});}
 await writeFile(process.argv[2],JSON.stringify({scope:'Growth OS isolated test only; real Auth, safe probes and synthetic append; invalid signature 401, not natural JWT expiry; HTTP overlap does not prove backend overlap',results},null,2)+'\n');
 console.log('DONE safe evidence saved');
}catch(error){console.error('FAIL '+stage+' '+(error instanceof assert.AssertionError?'acceptance assertion':error.name));process.exitCode=1;}
finally{input.close();await writeFile(process.argv[2],JSON.stringify({completed:!process.exitCode,scope:'Isolated real Auth/API only. Invalid-signature 401, not natural expiry. HTTP overlap does not establish backend overlap.',results},null,2)+'\n');}
