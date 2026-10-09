// One approved Actions attempt, not a reusable trial registry.
// Old R1-R6 reservations remain held. Never delete/update the fixed remote ref.
import {readFile,open,mkdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';

export const REPO='RC918/Growth-OS';
export const SOURCE_SHA='a20776cdfdb399a5e0b9c4d5a48021155f7b657d';
export const TRIAL='INTRO-GHA-01-R7';
export const TAG='intro-trial/2026-10-09-r7';
export const REF='refs/tags/'+TAG;
export const MODEL='gpt-5.4-mini-2026-03-17';
export const DEADLINE='2026-10-10T04:00:00Z';
export const APPROVAL='2026-10-09T17:16:10Z';
export const MANIFEST_HASH='828fc570ef42cb5e1fea280b935d4605f66b949875df6fe9b1ee20049bcfb366';
export const PAYLOAD_HASH='35357f8011a8a8c08278c5ef2f592eadeb73822e6441e41f58bd58b2589a2b26';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const ENDPOINT='https://api.openai.com/v1/responses';
const SHA=/^[a-f0-9]{40}$/;
const codes=new Set(['CONTEXT_REQUIRED','CHECKOUT_DRIFT','SOURCE_DRIFT','WINDOW_CLOSED','GH_UNKNOWN','ALREADY_RESERVED_OR_UNKNOWN','RESERVATION_MISMATCH','RERUN_FORBIDDEN','CREDENTIAL_MISSING','HTTP_UNKNOWN','RESULT_UNKNOWN','SECRET_IN_RESULT','RESPONSE_TOO_LARGE','LOCAL_REENTRY','COMMAND_REQUIRED']);
const stages=new Set(['preflight','reservation','readback','credential','dispatch','http','parse','validation','artifact']);
class Stop extends Error {constructor(code){super(code);this.code=code;}}
const stop=code=>{throw new Stop(code);};
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function windowOpen(now){if(!Number.isFinite(now)||now<Date.parse(APPROVAL)||now+40000>=Date.parse(DEADLINE))stop('WINDOW_CLOSED');}
export function contextFromEnvironment(env,now=Date.now()){
 if(env.GITHUB_RUN_ATTEMPT!=='1')stop('RERUN_FORBIDDEN');
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_ACTOR!=='RC918'||env.GITHUB_TRIGGERING_ACTOR!=='RC918'||!SHA.test(env.GITHUB_SHA||'')||env.GITHUB_WORKFLOW_SHA!==env.GITHUB_SHA||env.GITHUB_WORKFLOW_REF!==REPO+'/.github/workflows/intro-zh-once.yml@refs/heads/main'||!/^\d{1,20}$/.test(env.GITHUB_RUN_ID||'')||!/^[a-f0-9]{64}$/.test(env.INTRO_APPROVED_CODE_SHA256||''))stop('CONTEXT_REQUIRED');
 windowOpen(now);
 return {run_id:env.GITHUB_RUN_ID,run_attempt:1,workflow_sha:env.GITHUB_SHA};
}
function checkContext(ctx,now){
 if(ctx?.run_attempt!==1)stop('RERUN_FORBIDDEN');
 if(!/^\d{1,20}$/.test(ctx.run_id||'')||!SHA.test(ctx.workflow_sha||''))stop('CONTEXT_REQUIRED');
 windowOpen(now);
}
function gitHead(path){return execFileSync('git',['rev-parse','HEAD'],{cwd:path,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function cleanTracked(path){return !execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
export async function loadSource(dir=join(ROOT,'source')){
 if(gitHead(dir)!==SOURCE_SHA||!cleanTracked(dir))stop('SOURCE_DRIFT');
 const manifest=JSON.parse(await readFile(join(dir,'prototype/intro-trial/sources.json'),'utf8'));
 if(hash(manifest)!==MANIFEST_HASH)stop('SOURCE_DRIFT');
 const policy=await import(pathToFileURL(join(dir,'prototype/intro-trial/policy.mjs')).href);
 const contract=await import(pathToFileURL(join(dir,'apps/web/intro-candidate.mjs')).href);
 const source=policy.validateManifest(manifest).cases[0].source,body=policy.payload(source);
 if(hash(body)!==PAYLOAD_HASH||Buffer.byteLength(JSON.stringify(body))>4096||body.model!==MODEL)stop('SOURCE_DRIFT');
 return {source,body,contract};
}
export function reservationRecord(ctx){
 return {schema_version:1,trial:TRIAL,repository:REPO,run_id:ctx.run_id,run_attempt:1,workflow_sha:ctx.workflow_sha,source_sha:SOURCE_SHA,manifest_hash:MANIFEST_HASH,payload_hash:PAYLOAD_HASH,owner_approval:APPROVAL,deadline:DEADLINE,prior_attempts:6,prior_held_nusd:6000000000,new_held_nusd:1000000000,cumulative_held_nusd:7000000000,tax_percent:5,state:'RESERVED_NO_RECEIPT'};
}
async function boundedText(response,max){
 const reader=response.body?.getReader();if(!reader)stop('RESULT_UNKNOWN');
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)stop('RESPONSE_TOO_LARGE');chunks.push(value);}}
 finally{try{await reader.cancel();}catch{}}
 return Buffer.concat(chunks).toString('utf8');
}
// Fixed GitHub paths only; no endpoint override in CLI and no retry middleware.
export function githubAPI(getToken,fetchImpl=fetch){
 return async(method,path,body)=>{
  const allowed=(method==='POST'&&['/git/tags','/git/refs'].includes(path))||(method==='GET'&&(path==='/git/ref/tags/'+TAG||/^\/git\/tags\/[a-f0-9]{40}$/.test(path)));
  if(!allowed)stop('GH_UNKNOWN');
  try{
   const token=getToken();if(!token)stop('GH_UNKNOWN');
   const r=await fetchImpl('https://api.github.com/repos/'+REPO+path,{method,redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
   if(!r.ok){try{await r.body?.cancel();}catch{}return {status:r.status,body:null};}
   return {status:r.status,body:JSON.parse(await boundedText(r,16384))};
  }catch{stop('GH_UNKNOWN');}
 };
}
export async function verifyReservation(ctx,tagSha,api){
 if(!SHA.test(tagSha||''))stop('RESERVATION_MISMATCH');
 const ref=await api('GET','/git/ref/tags/'+TAG);
 if(ref.status!==200||ref.body?.ref!==REF||ref.body.object?.type!=='tag'||ref.body.object.sha!==tagSha)stop('RESERVATION_MISMATCH');
 const tag=await api('GET','/git/tags/'+tagSha);
 if(tag.status!==200||tag.body?.sha!==tagSha||tag.body.tag!==TAG||tag.body.object?.type!=='commit'||tag.body.object.sha!==ctx.workflow_sha||tag.body.message!==JSON.stringify(reservationRecord(ctx))+'\n')stop('RESERVATION_MISMATCH');
 return reservationRecord(ctx);
}
export async function reserve(ctx,api,clock=Date.now){
 checkContext(ctx,clock());
 const record=reservationRecord(ctx);
 const tag=await api('POST','/git/tags',{tag:TAG,message:JSON.stringify(record)+'\n',object:ctx.workflow_sha,type:'commit',tagger:{name:'Growth OS single-use reservation',email:'actions@users.noreply.github.com',date:APPROVAL}});
 if(tag.status!==201||!SHA.test(tag.body?.sha||''))stop('GH_UNKNOWN');
 windowOpen(clock());
 // This create is the atomic cross-run gate. NEVER accept an existing ref,
 // even for the same run/tag, and NEVER PATCH/DELETE/reconcile into dispatch.
 const ref=await api('POST','/git/refs',{ref:REF,sha:tag.body.sha});
 if(ref.status!==201)stop('ALREADY_RESERVED_OR_UNKNOWN');
 await verifyReservation(ctx,tag.body.sha,api);
 return tag.body.sha;
}
export function containsSecret(value,secrets){
 const variants=secrets.filter(s=>typeof s==='string'&&s).flatMap(s=>[s,Buffer.from(s).toString('base64'),encodeURIComponent(s)]);
 function scan(v){if(typeof v==='string')return variants.some(s=>v.includes(s));if(v&&typeof v==='object')return Object.entries(v).some(([k,x])=>scan(k)||scan(x));return false;}
 return scan(value);
}
const started=new Set(); // Only extra in-process protection; remote ref + run_attempt are authoritative.
export async function generate({ctx,source,tagSha,api,getKey,otherSecrets=[],fetchImpl=fetch,clock=Date.now}){
 let stage='preflight',key;
 const evidence={schema_version:1,trial:TRIAL,reservation_ref:REF,reservation_tag_sha:SHA.test(tagSha||'')?tagSha:null,record:reservationRecord(ctx),state:'STOPPED_HELD_READBACK_ONLY',dispatch:'not_invoked',http_status:null,provider_request_id:null,usage:null,billed_nusd:null,estimated_with_tax_nusd:null,candidate:null,error_code:null};
 try{
  checkContext(ctx,clock());
  if(hash(source.body)!==PAYLOAD_HASH||Buffer.byteLength(JSON.stringify(source.body))>4096)stop('SOURCE_DRIFT');
  stage='readback';await verifyReservation(ctx,tagSha,api);
  if(started.has(tagSha))stop('LOCAL_REENTRY');started.add(tagSha);
  stage='credential';key=getKey();if(typeof key!=='string'||!key)stop('CREDENTIAL_MISSING');
  windowOpen(clock());
  stage='dispatch';evidence.dispatch='invoked_delivery_unknown';
  const r=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','X-Client-Request-Id':TRIAL+'-'+ctx.run_id},body:JSON.stringify(source.body),signal:AbortSignal.timeout(40000)});
  stage='http';evidence.dispatch='http_response_observed';evidence.http_status=Number.isInteger(r.status)&&r.status>=100&&r.status<=599?r.status:null;
  const id=r.headers.get('x-request-id');
  if(/^req_[a-f0-9]{32}$/.test(id||'')&&!containsSecret(id,[key,...otherSecrets]))evidence.provider_request_id=id;
  if(r.status!==200){try{await r.body?.cancel();}catch{}stop('HTTP_UNKNOWN');}
  stage='parse';const result=JSON.parse(await boundedText(r,65536));
  stage='validation';const u=result.usage;
  if(result.model!==MODEL||result.status!=='completed'||result.service_tier!=='default'||!u||!Number.isInteger(u.input_tokens)||u.input_tokens<1||u.input_tokens>400000||!Number.isInteger(u.output_tokens)||u.output_tokens<0||u.output_tokens>1500||u.total_tokens!==u.input_tokens+u.output_tokens||!Array.isArray(result.output)||result.output.some(o=>!['message','reasoning'].includes(o.type)))stop('RESULT_UNKNOWN');
  const messages=result.output.filter(o=>o.type==='message');
  if(messages.length!==1||messages[0].role!=='assistant'||messages[0].content?.length!==1||messages[0].content[0].type!=='output_text')stop('RESULT_UNKNOWN');
  const output=source.contract.validateOutput(JSON.parse(messages[0].content[0].text),source.source);
  const candidate=await source.contract.candidateArtifact(source.source,output,{mode:'live',model:MODEL,response_id:result.id,request_id:evidence.provider_request_id||TRIAL+'-'+ctx.run_id,input_tokens:u.input_tokens,output_tokens:u.output_tokens},source.contract.TRIAL_R1);
  await source.contract.validateArtifact(candidate,source.source);
  if(containsSecret(candidate,[key,...otherSecrets]))stop('SECRET_IN_RESULT');
  evidence.usage={input_tokens:u.input_tokens,output_tokens:u.output_tokens,total_tokens:u.total_tokens};
  evidence.estimated_with_tax_nusd=Math.ceil((u.input_tokens*750+u.output_tokens*4500)*1.05);
  evidence.candidate=candidate;evidence.state='COMPLETE_HELD_REVIEW_REQUIRED';
 }catch(error){evidence.error_code=error instanceof Stop&&codes.has(error.code)?error.code:'RESULT_UNKNOWN';evidence.error_stage=stages.has(stage)?stage:'preflight';}
 // Do not publish even a sanitized envelope if a credential appears in it.
 if(containsSecret(evidence,[key,...otherSecrets]))stop('SECRET_IN_RESULT');
 return evidence;
}
export async function saveEvidence(dir,evidence,secrets){
 if(containsSecret(evidence,secrets))stop('SECRET_IN_RESULT');
 await mkdir(dir,{recursive:true,mode:0o700});
 const text=JSON.stringify(evidence,null,2)+'\n',f=await open(join(dir,'result.json'),'wx',0o600);
 try{await f.writeFile(text);await f.sync();}finally{await f.close();}
 return hash(text);
}
// Public-source delivery through already readable job logs. No network or replay.
// One escaped JSON line prevents candidate text from becoming workflow commands.
const DELIVERY_PREFIX='INTRO_PUBLIC_RESULT ';
export async function publicDeliveryLine(evidence,source,secrets=[]){
 if(evidence.state!=='COMPLETE_HELD_REVIEW_REQUIRED'||evidence.http_status!==200||evidence.error_code!==null)stop('RESULT_UNKNOWN');
 await source.contract.validateArtifact(evidence.candidate,source.source);
 if(!/^\d{1,20}$/.test(evidence.record?.run_id||'')||!SHA.test(evidence.record?.workflow_sha||''))stop('CONTEXT_REQUIRED');
 const receipt=evidence.candidate.receipt;
 if(evidence.usage?.input_tokens!==receipt.input_tokens||evidence.usage?.output_tokens!==receipt.output_tokens||evidence.usage?.total_tokens!==receipt.input_tokens+receipt.output_tokens)stop('RESULT_UNKNOWN');
 // Explicit projection: never spread evidence, raw response, headers, or errors.
 const payload={schema_version:1,trial:TRIAL,run_id:evidence.record.run_id,workflow_sha:evidence.record.workflow_sha,source_sha:SOURCE_SHA,result_sha256:hash(JSON.stringify(evidence,null,2)+'\n'),review_status:'PENDING_INDEPENDENT_REVIEW',candidate:evidence.candidate,usage:{input_tokens:receipt.input_tokens,output_tokens:receipt.output_tokens,total_tokens:receipt.input_tokens+receipt.output_tokens},billed_nusd:null};
 if(containsSecret(payload,secrets))stop('SECRET_IN_RESULT');
 // Legacy runner commands can start at an inline ##[; escape at wire level only.
 const line=DELIVERY_PREFIX+JSON.stringify({sha256:hash(payload),payload}).replaceAll('#','\\u0023');
 if(Buffer.byteLength(line)>32768)stop('RESPONSE_TOO_LARGE');
 return line;
}
export async function readPublicDelivery(log,expected,source){
 if(typeof log!=='string'||Buffer.byteLength(log)>1048576)stop('RESULT_UNKNOWN');
 // The official job-log reader may retain GitHub's UTC timestamp prefix.
 const frames=log.split(/\r?\n/).map(l=>l.replace(/^\d{4}-\d\d-\d\dT[0-9:.]+Z /,'')).filter(l=>l.startsWith(DELIVERY_PREFIX));
 if(frames.length!==1||Buffer.byteLength(frames[0])>32768)stop('RESULT_UNKNOWN');
 let frame;try{frame=JSON.parse(frames[0].slice(DELIVERY_PREFIX.length));}catch{stop('RESULT_UNKNOWN');}
 const p=frame.payload;
 const keys=(v,list)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===list.sort().join('|');
 if(!keys(frame,['sha256','payload'])||!keys(p,['schema_version','trial','run_id','workflow_sha','source_sha','result_sha256','review_status','candidate','usage','billed_nusd'])||!keys(p.usage,['input_tokens','output_tokens','total_tokens']))stop('RESULT_UNKNOWN');
 if(!p||frame.sha256!==hash(p)||p.schema_version!==1||p.trial!==TRIAL||p.source_sha!==SOURCE_SHA||p.review_status!=='PENDING_INDEPENDENT_REVIEW'||p.billed_nusd!==null||!/^\d{1,20}$/.test(expected?.run_id||'')||!SHA.test(expected?.workflow_sha||'')||!/^[a-f0-9]{64}$/.test(expected?.result_sha256||'')||p.run_id!==expected.run_id||p.workflow_sha!==expected.workflow_sha||p.result_sha256!==expected.result_sha256)stop('RESULT_UNKNOWN');
 await source.contract.validateArtifact(p.candidate,source.source);
 const r=p.candidate.receipt;if(p.usage?.input_tokens!==r.input_tokens||p.usage?.output_tokens!==r.output_tokens||p.usage?.total_tokens!==r.input_tokens+r.output_tokens)stop('RESULT_UNKNOWN');
 return p; // Still unreviewed content. Never auto-apply or publish.
}
async function cli(){
 const command=process.argv[2];if(process.argv.length!==3||!['preflight','reserve','generate'].includes(command))stop('COMMAND_REQUIRED');
 const ctx=contextFromEnvironment(process.env);
 if(gitHead(ROOT)!==ctx.workflow_sha||!cleanTracked(ROOT)||hash(await readFile(fileURLToPath(import.meta.url),'utf8'))!==process.env.INTRO_APPROVED_CODE_SHA256)stop('CHECKOUT_DRIFT');
 const source=await loadSource();
 if(command==='preflight'){console.log('PREFLIGHT_NO_API');return;}
 const api=githubAPI(()=>process.env.GH_TOKEN);
 if(command==='reserve'){
  const tagSha=await reserve(ctx,api);
  // Output only after successful create AND exact readback. Failure emits no permit.
  await appendFile(process.env.GITHUB_OUTPUT,'tag_sha='+tagSha+'\n');
  console.log('RESERVED_USD1_TOTAL_HELD7_NO_MODEL_CALL');return;
 }
 const evidence=await generate({ctx,source,tagSha:process.env.INTRO_RESERVATION_TAG,api,getKey:()=>process.env.OPENAI_API_KEY,otherSecrets:[process.env.GH_TOKEN]});
 const digest=await saveEvidence(join(ROOT,'evidence'),evidence,[process.env.OPENAI_API_KEY,process.env.GH_TOKEN]);
 await appendFile(process.env.GITHUB_OUTPUT,'evidence_ready=true\n');
 console.log(JSON.stringify({state:evidence.state,dispatch:evidence.dispatch,http_status:evidence.http_status,error_code:evidence.error_code,evidence_sha256:digest}));
 if(evidence.state==='COMPLETE_HELD_REVIEW_REQUIRED'){
  const line=await publicDeliveryLine(evidence,source,[process.env.OPENAI_API_KEY,process.env.GH_TOKEN]);
  await new Promise((done,fail)=>process.stdout.write(line+'\n',error=>error?fail(error):done()));
 }
 if(evidence.state!=='COMPLETE_HELD_REVIEW_REQUIRED')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await cli();}catch(error){console.error(JSON.stringify({state:'STOPPED_NO_RETRY',error_code:error instanceof Stop&&codes.has(error.code)?error.code:'RESULT_UNKNOWN'}));process.exitCode=1;}
}
