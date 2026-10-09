// One R1 request. No count endpoint, retry, reset, or journal-path override.
import {open,readFile,unlink,mkdir,lstat} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {candidateArtifact,validateArtifact,validateOutput,digest,MODEL} from '../../apps/web/intro-candidate.mjs';
import {TRIAL,readiness,validateManifest,payload,CAP_NUSD} from './policy.mjs';
const ROOT='/workspace/intro-trial-state/INTRO-TRIAL-01';
const PATHS=Object.freeze({generate:'/v1/responses'});
const diagnostics=new WeakMap(),responseMetadata=new WeakMap();
const STAGES=new Set(['cli','preflight','lock','state_read','payload','reservation','credential','request_build','dispatch','http_status','response_read','response_parse','response_validation','output_parse','output_validation','artifact_write','receipt_write','complete_write','cleanup']);
const TYPES=new Set(['Error','TypeError','SyntaxError','RangeError','AbortError','TimeoutError']);
const CODES=new Set(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','EACCES','EPERM','ENOSPC','EISDIR','EIO','ENOENT','EEXIST','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_CERT_ALTNAME_INVALID','ABORT_ERR','TRIAL_WINDOW_CLOSED','LIVE_PREREQUISITES_UNVERIFIED','BUDGET_EXCEEDED','MANIFEST_DRIFT','PRIOR_DISPATCH_STOP_READBACK_ONLY','CREDENTIAL_NOT_BOUND','INVALID_REQUEST_KIND','UPSTREAM_UNKNOWN','RESPONSE_TOO_LARGE','USAGE_OR_RESULT_UNKNOWN','INVALID_OUTPUT','INVALID_CANDIDATE','UNBOUND_CITATION','INVALID_RECEIPT','PAYLOAD_BYTE_LIMIT','UNKNOWN_STOP_READBACK_ONLY','REVIEWED_CHECKPOINT_REQUIRED','EXISTING_STATE_STOP_READBACK_ONLY','JOURNAL_INCOMPLETE','INVALID_MANIFEST']);
function data(value,key){try{for(let i=0;value&&i<3;i++,value=Object.getPrototypeOf(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(d)return Object.hasOwn(d,'value')?d.value:undefined;}}catch{}return undefined;}
function errorCode(error){const seen=new Set();for(let i=0;error&&i<3&&!seen.has(error);i++,error=data(error,'cause')){seen.add(error);for(const k of ['code','message']){const v=data(error,k);if(CODES.has(v))return v;}}return 'UNCLASSIFIED';}
const providerId=value=>typeof value==='string'&&/^req_[a-f0-9]{32}$/.test(value)?value:null;
export function runtimeCapabilities(){return {node:/^v[0-9.]+$/.test(process.version)?process.version:null,undici:/^[0-9.]+$/.test(process.versions.undici||'')?process.versions.undici:null,fetch_available:typeof fetch==='function',env_proxy_flag_supported:process.allowedNodeEnvironmentFlags.has('--use-env-proxy'),env_proxy_opt_in_observed:process.env.NODE_USE_ENV_PROXY==='1'||process.execArgv.includes('--use-env-proxy')||/(?:^|\s)--use-env-proxy(?:\s|$)/.test(process.env.NODE_OPTIONS||''),http_proxy_name_present:['HTTP_PROXY','http_proxy'].some(k=>Object.hasOwn(process.env,k)),https_proxy_name_present:['HTTPS_PROXY','https_proxy'].some(k=>Object.hasOwn(process.env,k)),no_proxy_name_present:['NO_PROXY','no_proxy'].some(k=>Object.hasOwn(process.env,k)),explicit_dispatcher:false,network_compatibility_verified:false};}
export function safeDiagnostic(error,context={},now=Date.now()){
 const known=diagnostics.get(error);
 const base={stage:STAGES.has(context.stage)?context.stage:'cli',error_type:TYPES.has(data(error,'name'))?data(error,'name'):'UnknownError',error_code:errorCode(error),dispatch:['not_invoked','invoked_delivery_unknown','http_response_observed'].includes(context.dispatch)?context.dispatch:'not_invoked',http_status:Number.isInteger(context.http_status)&&context.http_status>=100&&context.http_status<=599?context.http_status:null,provider_request_id:providerId(context.provider_request_id),client_request_id:context.client_request_id===TRIAL+'-1'?context.client_request_id:null};
 return {...base,...known,at:Number.isFinite(now)&&Math.abs(now)<=8640000000000000?new Date(now).toISOString():null,operation_id:known?.operation_id??(typeof context.operation_id==='string'&&/^[a-f0-9-]{36}$/.test(context.operation_id)?context.operation_id:null)};
}
function diagnosticError(error,context,now=Date.now(),message){const out=Error(message||errorCode(error));diagnostics.set(out,safeDiagnostic(error,context,now));return out;}
async function durable(path,text,flag='wx'){
 const file=await open(path,flag,0o600);try{await file.writeFile(text);await file.sync();}finally{await file.close();}
}
async function syncDirectory(path){const file=await open(path,'r');try{await file.sync();}finally{await file.close();}}
async function lines(root){const raw=await readFile(join(root,'journal.jsonl'),'utf8');if(!raw.endsWith('\n'))throw Error('JOURNAL_INCOMPLETE');return raw.trim().split('\n').map(JSON.parse);}
async function append(root,event){await durable(join(root,'journal.jsonl'),JSON.stringify(event)+'\n','a');}
export async function initialize(root,manifest,activation,now=Date.now()){
 readiness(activation,now);
 try{await lstat(root);throw Error('EXISTING_STATE_STOP_READBACK_ONLY');}catch(e){if(e.code!=='ENOENT')throw e;}
 const fixed=validateManifest(manifest);const created=await mkdir(root,{recursive:true,mode:0o700});
 if(created){let cursor=root;const parent=dirname(created);while(cursor!==parent){await syncDirectory(cursor);cursor=dirname(cursor);}await syncDirectory(parent);}
 // Retained marker makes a missing/partial journal a blocker, never a new budget.
 await durable(join(root,'created.once'),TRIAL+'\n');await syncDirectory(root);
 await durable(join(root,'manifest.json'),JSON.stringify(fixed));
 await durable(join(root,'journal.jsonl'),JSON.stringify({type:'initialized',trial:TRIAL,activation_hash:await digest(activation),execution_task_id:activation.executionTaskId,manifest_hash:await digest(fixed)})+'\n');
 await syncDirectory(root);
}
export async function readback(root){
 try{await lstat(root);}catch(e){if(e.code==='ENOENT')return {trial:TRIAL,calls:null,reserved_nusd:null,state:'ABSENT_NOT_AUTHORIZATION',events:[]};throw e;}
 const events=await lines(root),reserved=events.filter(e=>e.type==='reserved'),terminal=events.at(-1)?.type;
 return {trial:events[0]?.trial,calls:reserved.length,reserved_nusd:reserved.reduce((s,e)=>s+e.max_nusd,0),state:events[0]?.trial!==TRIAL?'LEGACY_STOP_READBACK_ONLY':terminal==='complete'?'complete':terminal==='initialized'?'prepared':'STOPPED_OR_UNKNOWN',events};
}
export function liveTransport(getKey){
 return async(kind,body,requestId)=>{
  const context={stage:'credential',dispatch:'not_invoked',client_request_id:requestId};
  try{
   if(!Object.hasOwn(PATHS,kind))throw Error('INVALID_REQUEST_KIND');
   const key=getKey();if(typeof key!=='string'||!key)throw Error('CREDENTIAL_NOT_BOUND');
   // Set invoked immediately before fetch; it does not prove upstream delivery.
   context.stage='request_build';
   const options={method:'POST',redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','X-Client-Request-Id':requestId},body:JSON.stringify(body),signal:AbortSignal.timeout(40000)};
   context.stage='dispatch';context.dispatch='invoked_delivery_unknown';
   const response=await fetch('https://api.openai.com'+PATHS[kind],options);
   context.stage='http_status';context.dispatch='http_response_observed';context.http_status=response.status;
   const id=providerId(response.headers.get('x-request-id'));
   context.provider_request_id=id&&(!id.includes(key)&&!key.includes(id))?id:null;
   if(!response.ok)throw Error('UPSTREAM_UNKNOWN');
   context.stage='response_read';
   const reader=response.body.getReader();let total=0;const parts=[];
   let readError;try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>65536)throw Error('RESPONSE_TOO_LARGE');parts.push(value);}}catch(error){readError=error;throw error;}finally{try{await reader.cancel();}catch(error){if(!readError)throw error;}}
   context.stage='response_parse';
   const reply={body:JSON.parse(Buffer.concat(parts).toString('utf8')),requestId:context.provider_request_id||requestId};
   responseMetadata.set(reply,{dispatch:context.dispatch,http_status:context.http_status,provider_request_id:context.provider_request_id});return reply;
  }catch(error){throw diagnosticError(error,context);}
 };
}
export async function runBatch(options){
 const context={stage:'preflight',dispatch:'not_invoked',operation_id:randomUUID(),client_request_id:TRIAL+'-1'};
 try{return await runBatchCore(options,context);}catch(error){throw diagnosticError(error,context,(options.clock||Date.now)());}
}
async function runBatchCore({root,transport,preflight,manifestHash,clock=Date.now,mode='synthetic'},context){
 readiness(preflight,clock());
 context.stage='lock';
 const lock=await open(join(root,'run.lock'),'wx',0o600);await lock.sync();await syncDirectory(root);
 let primaryError;try{
  context.stage='state_read';
  const manifest=validateManifest(JSON.parse(await readFile(join(root,'manifest.json'),'utf8'))),history=await lines(root);
  if(!manifestHash||manifestHash!==await digest(manifest)||history[0]?.trial!==TRIAL||history[0]?.manifest_hash!==manifestHash||history[0]?.activation_hash!==await digest(preflight))throw Error('MANIFEST_DRIFT');
  if(history.at(-1)?.type==='complete')return readback(root);
  if(history.length!==1||history[0]?.type!=='initialized')throw Error('PRIOR_DISPATCH_STOP_READBACK_ONLY');
  let calls=0,held=0;
  for(const item of manifest.cases){
   context.stage='payload';
   const body=payload(item.source),bodyHash=await digest(body);
   readiness(preflight,clock());
   if(calls!==0)throw Error('BUDGET_EXCEEDED');
   const requestId=TRIAL+'-1';
   context.stage='reservation';
   await append(root,{type:'reserved',case_id:item.id,kind:'generate',request_id:requestId,payload_hash:bodyHash,max_nusd:CAP_NUSD,at:clock()});calls=1;held=CAP_NUSD;
   try{
      context.stage='dispatch';context.dispatch='invoked_delivery_unknown';
      const reply=await transport('generate',structuredClone(body),requestId),result=reply.body;
      Object.assign(context,responseMetadata.get(reply));context.stage='response_validation';
      if(result?.status!=='completed'||result.model!==MODEL||result.service_tier!=='default'||!result.usage||!Number.isInteger(result.usage.input_tokens)||result.usage.input_tokens<1||result.usage.input_tokens>400000||!Number.isInteger(result.usage.output_tokens)||result.usage.output_tokens<0||result.usage.output_tokens>1500||result.usage.total_tokens!==result.usage.input_tokens+result.usage.output_tokens)throw Error('USAGE_OR_RESULT_UNKNOWN');
      const messages=result.output?.filter(o=>o.type==='message');
      if(!Array.isArray(result.output)||result.output.some(o=>!['message','reasoning'].includes(o.type))||messages.length!==1||messages[0].role!=='assistant'||messages[0].content?.length!==1||messages[0].content[0].type!=='output_text')throw Error('INVALID_OUTPUT');
      context.stage='output_parse';const parsed=JSON.parse(messages[0].content[0].text);
      context.stage='output_validation';const output=validateOutput(parsed,item.source);
      const artifact=await candidateArtifact(item.source,output,{mode,model:MODEL,response_id:result.id,request_id:reply.requestId,input_tokens:result.usage.input_tokens,output_tokens:result.usage.output_tokens},TRIAL);
      await validateArtifact(artifact,item.source);
      // Preserve the received result before settlement; a crash never resends it.
      context.stage='artifact_write';
      await durable(join(root,item.id+'.candidate.json'),JSON.stringify(artifact));await syncDirectory(root);
      context.stage='receipt_write';
      await append(root,{type:'received',request_id:requestId,response_id:result.id,input_tokens:result.usage.input_tokens,output_tokens:result.usage.output_tokens,artifact_hash:await digest(artifact)});
    }catch(error){
     const diagnostic=safeDiagnostic(error,context,clock());
     const stopped=diagnosticError(error,context,clock(),'UNKNOWN_STOP_READBACK_ONLY');
     try{await append(root,{type:'UNKNOWN_STOP',request_id:requestId,held_nusd:held,calls,at:clock(),diagnostic,runtime:runtimeCapabilities()});}
     catch(writeError){diagnostics.set(stopped,{...diagnostic,journal_write_failed:true,journal_error_code:errorCode(writeError)});}
     throw stopped;
    }
  }
  context.stage='complete_write';
  await append(root,{type:'complete',calls,held_nusd:held});return readback(root);
 }catch(error){primaryError=error;throw error;}finally{
  try{await lock.close();await unlink(join(root,'run.lock'));}catch(error){
   if(primaryError)diagnostics.set(primaryError,{...safeDiagnostic(primaryError,context,clock()),cleanup_failed:true,cleanup_error_code:errorCode(error)});
   else throw diagnosticError(error,{...context,stage:'cleanup'},clock());
  }
 }
}
// Non-secret parent-issued handoff. Not proof of cross-task state by itself:
// the parent must authorize exactly one execution task and preserve its journal.
function activationFromEnvironment(){
 const activation=JSON.parse(process.env.INTRO_TRIAL_R1_ACTIVATION||'null');
 readiness(activation,Date.now());
 const cwd=fileURLToPath(new URL('../../',import.meta.url));
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim();
 const dirty=execFileSync('git',['status','--porcelain'],{cwd,encoding:'utf8'}).trim();
 if(head!==activation.reviewedHead||dirty)throw Error('REVIEWED_CHECKPOINT_REQUIRED');
 return activation;
}
// No live credential lookup happens until the fixed readiness gate succeeds.
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  const command=process.argv[2];
  if(command==='readback'){const r=await readback(ROOT);console.log(JSON.stringify({trial:r.trial,calls:r.calls,reserved_nusd:r.reserved_nusd,state:r.state}));}
  else if(command==='prepare'&&process.argv.length===3){const manifest=JSON.parse(await readFile(new URL('./sources.json',import.meta.url),'utf8'));const activation=activationFromEnvironment();await initialize(ROOT,manifest,activation);console.log('PREPARED_NO_NETWORK');}
  else if(command==='live'&&process.argv.length===3){const activation=activationFromEnvironment();if(!Object.hasOwn(process.env,'OPENAI_API_KEY'))throw Error('CREDENTIAL_NOT_BOUND');const manifestHash=await digest(JSON.parse(await readFile(new URL('./sources.json',import.meta.url),'utf8')));const r=await runBatch({root:ROOT,manifestHash,transport:liveTransport(()=>process.env.OPENAI_API_KEY),preflight:activation,mode:'live'});console.log(JSON.stringify({trial:r.trial,calls:r.calls,state:r.state}));}
  else throw Error('EXPLICIT_PREPARE_LIVE_OR_READBACK_REQUIRED');
 }catch(error){console.error(JSON.stringify({state:'TRIAL_STOPPED_READBACK_REQUIRED',diagnostic:safeDiagnostic(error,{stage:'cli',dispatch:'not_invoked',operation_id:randomUUID()}),runtime:runtimeCapabilities()}));process.exitCode=1;}
}
