// One fixed batch. The CLI has no test-mode, journal-path or readiness overrides.
import {open,readFile,unlink,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {candidateArtifact,validateArtifact,validateOutput,digest,MODEL,TRIAL} from '../../apps/web/intro-candidate.mjs';
import {LIVE_READINESS,readiness,validateManifest,payload,CAP_NUSD} from './policy.mjs';
const ROOT='/workspace/intro-trial-state/INTRO-TRIAL-01';
const PATHS=Object.freeze({count:'/v1/responses/input_tokens',generate:'/v1/responses'});
async function durable(path,text,flag='wx'){
 const file=await open(path,flag,0o600);try{await file.writeFile(text);await file.sync();}finally{await file.close();}
}
async function syncDirectory(path){const file=await open(path,'r');try{await file.sync();}finally{await file.close();}}
async function lines(root){const raw=await readFile(join(root,'journal.jsonl'),'utf8');if(!raw.endsWith('\n'))throw Error('JOURNAL_INCOMPLETE');return raw.trim().split('\n').map(JSON.parse);}
async function append(root,event){await durable(join(root,'journal.jsonl'),JSON.stringify(event)+'\n','a');}
export async function initialize(root,manifest){
 const fixed=validateManifest(manifest);const created=await mkdir(root,{recursive:true,mode:0o700});
 if(created){let cursor=root;const parent=dirname(created);while(cursor!==parent){await syncDirectory(cursor);cursor=dirname(cursor);}await syncDirectory(parent);}
 // Retained marker makes a missing/partial journal a blocker, never a new budget.
 await durable(join(root,'created.once'),TRIAL+'\n');await syncDirectory(root);
 await durable(join(root,'manifest.json'),JSON.stringify(fixed));
 await durable(join(root,'journal.jsonl'),JSON.stringify({type:'initialized',trial:TRIAL,manifest_hash:await digest(fixed)})+'\n');
 await syncDirectory(root);
}
export async function readback(root){
 const events=await lines(root),reserved=events.filter(e=>e.type==='reserved'),terminal=events.at(-1)?.type;
 return {trial:TRIAL,calls:reserved.length,reserved_nusd:reserved.reduce((s,e)=>s+e.max_nusd,0),state:terminal==='complete'?'complete':terminal==='initialized'?'prepared':'STOPPED_OR_UNKNOWN',events};
}
export function liveTransport(getKey){
 return async(kind,body,requestId)=>{
  if(!Object.hasOwn(PATHS,kind))throw Error('INVALID_REQUEST_KIND');
  const key=getKey();if(typeof key!=='string'||!key)throw Error('CREDENTIAL_NOT_BOUND');
  const sent=kind==='count'?Object.fromEntries(['model','instructions','input','text','tools','tool_choice'].map(k=>[k,body[k]])):body;
  const response=await fetch('https://api.openai.com'+PATHS[kind],{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','X-Client-Request-Id':requestId},body:JSON.stringify(sent),signal:AbortSignal.timeout(40000)});
  if(!response.ok)throw Error('UPSTREAM_UNKNOWN');
  const reader=response.body.getReader();let total=0;const parts=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>65536)throw Error('RESPONSE_TOO_LARGE');parts.push(value);}}finally{await reader.cancel();}
  return {body:JSON.parse(Buffer.concat(parts).toString('utf8')),requestId:response.headers.get('x-request-id')||requestId};
 };
}
export async function runBatch({root,transport,preflight,manifestHash,clock=Date.now,mode='synthetic'}){
 const rates=readiness(preflight,clock());
 const lock=await open(join(root,'run.lock'),'wx',0o600);await lock.sync();await syncDirectory(root);
 try{
  const manifest=validateManifest(JSON.parse(await readFile(join(root,'manifest.json'),'utf8'))),history=await lines(root);
  if(!manifestHash||manifestHash!==await digest(manifest)||history[0]?.trial!==TRIAL||history[0]?.manifest_hash!==manifestHash)throw Error('MANIFEST_DRIFT');
  if(history.at(-1)?.type==='complete')return readback(root);
  if(history.length!==1||history[0]?.type!=='initialized')throw Error('PRIOR_DISPATCH_STOP_READBACK_ONLY');
  let calls=0,held=0;
  for(const item of manifest.cases){
   const body=payload(item.source),bodyHash=await digest(body);
   let counted;
   for(const kind of ['count','generate']){
    readiness(preflight,clock());
    if(calls>=6||held+rates[kind]>CAP_NUSD)throw Error('BUDGET_EXCEEDED');
    if(kind==='generate'&&await digest(body)!==bodyHash)throw Error('PAYLOAD_DRIFT');
    const requestId=TRIAL+'-'+String(calls+1),max=rates[kind];
    await append(root,{type:'reserved',case_id:item.id,kind,request_id:requestId,payload_hash:bodyHash,max_nusd:max,at:clock()});calls++;held+=max;
    try{
     const reply=await transport(kind,structuredClone(body),requestId),result=reply.body;
     if(kind==='count'){
      if(result?.object!=='response.input_tokens'||!Number.isInteger(result.input_tokens)||result.input_tokens<1||result.input_tokens>4000)throw Error('INPUT_LIMIT_OR_COUNT_UNKNOWN');
      counted=result.input_tokens;
      await append(root,{type:'counted',request_id:requestId,input_tokens:counted});
     }else{
      if(result?.status!=='completed'||result.model!==MODEL||result.service_tier!=='default'||!result.usage||result.usage.input_tokens!==counted||!Number.isInteger(result.usage.output_tokens)||result.usage.output_tokens<0||result.usage.output_tokens>1500||result.usage.total_tokens!==counted+result.usage.output_tokens)throw Error('USAGE_OR_RESULT_UNKNOWN');
      const messages=result.output?.filter(o=>o.type==='message');
      if(!Array.isArray(result.output)||result.output.some(o=>!['message','reasoning'].includes(o.type))||messages.length!==1||messages[0].role!=='assistant'||messages[0].content?.length!==1||messages[0].content[0].type!=='output_text')throw Error('INVALID_OUTPUT');
      const output=validateOutput(JSON.parse(messages[0].content[0].text),item.source);
      const artifact=await candidateArtifact(item.source,output,{mode,model:MODEL,response_id:result.id,request_id:reply.requestId,input_tokens:counted,output_tokens:result.usage.output_tokens});
      await validateArtifact(artifact,item.source);
      // Preserve the received result before settlement; a crash never resends it.
      await durable(join(root,item.id+'.candidate.json'),JSON.stringify(artifact));await syncDirectory(root);
      await append(root,{type:'received',request_id:requestId,response_id:result.id,input_tokens:counted,output_tokens:result.usage.output_tokens,artifact_hash:await digest(artifact)});
     }
    }catch{
     await append(root,{type:'UNKNOWN_STOP',request_id:requestId,held_nusd:held,calls});
     throw Error('UNKNOWN_STOP_READBACK_ONLY');
    }
   }
  }
  await append(root,{type:'complete',calls,held_nusd:held});return readback(root);
 }finally{await lock.close();await unlink(join(root,'run.lock'));}
}
// No live credential lookup happens until the fixed readiness gate succeeds.
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  const command=process.argv[2];
  if(command==='readback'){const r=await readback(ROOT);console.log(JSON.stringify({trial:r.trial,calls:r.calls,reserved_nusd:r.reserved_nusd,state:r.state}));}
  else if(command==='prepare'&&process.argv.length===3){const manifest=JSON.parse(await readFile(new URL('./sources.json',import.meta.url),'utf8'));await initialize(ROOT,manifest);console.log('PREPARED_NO_NETWORK');}
  else if(command==='live'&&process.argv.length===3){readiness(LIVE_READINESS,Date.now());if(!Object.hasOwn(process.env,'OPENAI_API_KEY'))throw Error('CREDENTIAL_NOT_BOUND');const manifestHash=await digest(JSON.parse(await readFile(new URL('./sources.json',import.meta.url),'utf8')));const r=await runBatch({root:ROOT,manifestHash,transport:liveTransport(()=>process.env.OPENAI_API_KEY),preflight:LIVE_READINESS,mode:'live'});console.log(JSON.stringify({trial:r.trial,calls:r.calls,state:r.state}));}
  else throw Error('EXPLICIT_PREPARE_LIVE_OR_READBACK_REQUIRED');
 }catch(e){console.error(['TRIAL_WINDOW_CLOSED','LIVE_PREREQUISITES_UNVERIFIED','CREDENTIAL_NOT_BOUND','UNKNOWN_STOP_READBACK_ONLY','PRIOR_DISPATCH_STOP_READBACK_ONLY'].includes(e.message)?e.message:'TRIAL_STOPPED_READBACK_REQUIRED');process.exitCode=1;}
}
