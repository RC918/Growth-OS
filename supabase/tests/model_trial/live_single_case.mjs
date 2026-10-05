// One model POST per invocation; this CLI does NOT disable terminal echo.
// The operator must provide non-echoing raw stdin before supplying a login link.
// Login links/JWT stay in this process; tool/terminal recording is a separate risk.
// No credential creation/refresh, automatic retry or direct DB/business writes.
// The authenticated Edge endpoint DOES reserve and settle the persistent ledger.
// completed means HTTP/contract flags passed, not independent usage/billing proof.
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='https://vhzryhibmpvglzcmfnaa.supabase.co';
const key='sb_publishable_B9pMiED8jrCoxuy2kC0HoA_LmzKex9r';
const redirect='https://growth-os-preview-a0rpg9s0x-morning-ai.vercel.app/workspace.html';
const organization='93a88055-0a0b-40c0-b22f-a6d312320001';
const actor='e85f1a90-3565-4fc1-a7e0-3b7d08830d0e';
const cutoff=Date.parse('2026-10-07T11:48:00Z');
const fixture=process.argv[2],evidencePath=process.argv[3];
assert.ok(['synth-parts-v1','synth-shop-v1'].includes(fixture));
assert.ok(evidencePath);
const input=createInterface({input:process.stdin,terminal:false});
const lines=input[Symbol.asyncIterator]();
async function nextRecord(){for(;;){const line=await lines.next();assert.equal(line.done,false);if(line.value.trim())return JSON.parse(line.value);}}
const evidence={request_id:randomUUID(),fixture_id:fixture,model_posts:0,started_at:new Date().toISOString(),completed:false};
let stage='request-login',initialized=false;
async function request(path,token,body,timeout=10000){
 const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(timeout)});
 const raw=await response.text();assert.ok(Buffer.byteLength(raw)<=131072);
 return {status:response.status,data:JSON.parse(raw)};
}
try {
 await writeFile(evidencePath,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});initialized=true;
 assert.ok(Date.now()<cutoff);
 if(!process.argv.includes('--reuse-login')){
  const sent=await request('/auth/v1/otp?redirect_to='+encodeURIComponent(redirect),null,{email:'ryan2939x@gmail.com',create_user:false});assert.equal(sent.status,200);
 }
 console.log('WAIT_FRESH_MAIL');
 stage='verify-login';const {html}=await nextRecord();
 const href=[...html.matchAll(/href=["']([^"']+)["']/g)].map(m=>m[1].replaceAll('&amp;','&')).find(h=>h.startsWith('https://'));
 assert.ok(href);let url=new URL(href),token;
 for(let i=0;i<5;i++){
  assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');assert.equal(url.port,'');
  if(url.origin===origin){assert.equal(url.pathname,'/auth/v1/verify');assert.equal(url.searchParams.get('type'),'magiclink');assert.equal(url.searchParams.get('redirect_to'),redirect);}
  else assert.match(url.hostname,/^bccjgibi\.r\.[a-z]+\.d\.sendibt[23]\.com$/);
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(10000)});const location=response.headers.get('location');assert.ok(location);url=new URL(location,url);
  if(url.origin===new URL(redirect).origin){assert.equal(url.pathname,'/workspace.html');const params=new URLSearchParams(url.hash.slice(1));assert.equal(params.get('token_type'),'bearer');token=params.get('access_token');break;}
 }
 assert.ok(token);const user=await request('/auth/v1/user',token);assert.equal(user.status,200);assert.equal(user.data.id,actor);
 const members=await request('/rest/v1/organization_members?select=user_id,organization_id,role&user_id=eq.'+actor+'&organization_id=eq.'+organization+'&role=eq.owner',token);
 assert.equal(members.status,200);assert.equal(members.data.length,1);assert.equal(members.data[0].role,'owner');
 assert.equal(members.data[0].user_id,actor);assert.equal(members.data[0].organization_id,organization);
 evidence.owner_verified=true;console.log('AUTH_READY '+evidence.request_id);
 stage='await-dispatch';assert.equal((await nextRecord()).dispatch,fixture);
 assert.ok(Date.now()<cutoff);stage='model-request';evidence.model_posts=1;
 // Persist intent BEFORE sending. A crash/timeout never licenses another call.
 await writeFile(evidencePath,JSON.stringify({...evidence,stage},null,2)+'\n');
 const result=await request('/functions/v1/growth-model-trial',token,{request_id:evidence.request_id,organization_id:organization,fixture_id:fixture,expected_version:1},60000);
 evidence.http_status=result.status;
 if(result.status!==200){evidence.code=typeof result.data.code==='string'?result.data.code:'UNCLASSIFIED_STOP';evidence.accounting=result.data.accounting??null;throw new Error('STOP');}
 assert.equal(result.data.synthetic_trial,true);assert.equal(result.data.can_persist,false);
 evidence.accounting=result.data.accounting;evidence.proposal=result.data.proposal;evidence.completed=true;
 console.log('ONE_CASE_RETURNED; VERIFY DATABASE ACCOUNTING BEFORE ANY NEXT CASE');
}catch(error){evidence.stop=true;evidence.error_type=error instanceof assert.AssertionError?'AssertionError':error.name;console.log('STOP '+stage);process.exitCode=1;}
finally{input.close();evidence.finished_at=new Date().toISOString();evidence.stage=stage;if(initialized)await writeFile(evidencePath,JSON.stringify(evidence,null,2)+'\n');}
