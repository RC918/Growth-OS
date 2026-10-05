import {sha256Hex} from './hash.mjs';
import {validatedInferenceData,materializeInferenceProposal} from '../../../../prototype/owner-workspace/goal-inference-core.mjs';
import {POLICY,FIXTURE_IDS,fixtureSnapshot,providerBody} from './policy.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function requestBody(body) {
 const names=['request_id','organization_id','fixture_id','expected_version'];
 if(!body||Object.getPrototypeOf(body)!==Object.prototype||Object.keys(body).length!==names.length||
 names.some(k=>!Object.hasOwn(body,k))||typeof body.request_id!=='string'||typeof body.organization_id!=='string'||
 !uuid.test(body.request_id)||!uuid.test(body.organization_id)||!FIXTURE_IDS.includes(body.fixture_id)||body.expected_version!==1)throw new Error('INVALID_REQUEST');
}
export function createTrialHandler({authenticate,ledger,provider,ready=false,getSnapshot=fixtureSnapshot}) {
 return async request=>{
  if(request.method!=='POST')return response(405,{code:'POST_REQUIRED'});
  if(!ready)return response(503,{code:'TRIAL_NOT_READY'});
  let reserved=false,requestId,actor,organization,outcome='provider_failure',usage=null,accounting=null;
  try {
   // No raw request body, headers, provider messages or exception text are logged.
   // ID-only envelope byte cap is NOT a bound on model input tokens.
   const raw=await request.text();if(new TextEncoder().encode(raw).length>1024)throw new Error('INVALID_REQUEST');
   const body=JSON.parse(raw);requestBody(body);requestId=body.request_id;organization=body.organization_id;
   actor=await authenticate(request,organization);
   if(!actor||!uuid.test(actor.id)||actor.role!=='owner')return response(403,{code:'OWNER_REQUIRED'});
   const snapshot=getSnapshot(body.fixture_id,organization);
   if(snapshot.organizationId!==organization||snapshot.role!=='owner')throw new Error('SOURCE_SCOPE_MISMATCH');
   if(snapshot.turns.length!==body.expected_version)throw new Error('VERSION_DRIFT');
   const payload=providerBody(snapshot);
   const fingerprint=await sha256Hex(JSON.stringify([POLICY.version,body.fixture_id,snapshot,payload]));
   const reservation=await ledger.reserve({requestId,actorId:actor.id,organizationId:organization,fixtureId:body.fixture_id,hash:fingerprint,expectedVersion:body.expected_version});
   if(reservation.dispatch!==true)return response(409,{code:'REPLAY_NOT_DISPATCHED'});
   reserved=true;
   await ledger.authorize({requestId,actorId:actor.id,organizationId:organization});
   const result=await provider.generate(payload);
   // 2048 is POST-generation usage acceptance, never a preflight token guarantee.
   if(result.model!==POLICY.model||!result.usage||!Number.isInteger(result.usage.input_tokens)||
    !Number.isInteger(result.usage.output_tokens)||
    result.usage.input_tokens<1||result.usage.input_tokens>POLICY.maxInput||
    result.usage.output_tokens<0||result.usage.output_tokens>POLICY.maxOutput||
    result.usage.total_tokens!==result.usage.input_tokens+result.usage.output_tokens||
    result.service_tier!=='default') {outcome='usage_unknown';throw new Error('USAGE_UNKNOWN');}
   usage={input:result.usage.input_tokens,output:result.usage.output_tokens};
   if(result.status!=='completed'){outcome='incomplete';throw new Error('INCOMPLETE');}
   const content=result.output?.length===1&&result.output[0].type==='message'&&result.output[0].role==='assistant'&&result.output[0].content;
   if(!Array.isArray(content)||content.length!==1||content[0].type!=='output_text'){outcome='refusal';throw new Error('REFUSAL');}
   let inferred,proposal;
   try {
    inferred=JSON.parse(content[0].text);
    if(Object.keys(inferred).length!==2||!Object.hasOwn(inferred,'fields')||!Object.hasOwn(inferred,'missing_fields'))throw new Error();
    const validated=validatedInferenceData({contract_version:1,operation:'propose_intake_fields',organization_id:snapshot.organizationId,
     goal_id:snapshot.goalId,expected_version:snapshot.turns.length,...inferred},snapshot);
    proposal=materializeInferenceProposal(validated,await sha256Hex(validated.fingerprintText));
   } catch {outcome='invalid_output';throw new Error('INVALID_OUTPUT');}
   // Recheck current membership/version before exposing a proposal; never save it.
   const currentActor=await authenticate(request,organization);
   const current=getSnapshot(body.fixture_id,organization);
   if(currentActor?.id!==actor.id||currentActor.role!=='owner'||
    JSON.stringify(current)!==JSON.stringify(snapshot)){outcome='scope_changed';throw new Error('SCOPE_CHANGED');}
   outcome='ok';
   accounting=await ledger.settle({requestId,input:usage.input,output:usage.output,result:outcome});
   reserved=false;
   return response(200,{synthetic_trial:true,can_persist:false,proposal,accounting});
  } catch {
   if(reserved) {
    try {accounting=await ledger.settle({requestId,input:usage?.input??null,output:usage?.output??null,result:outcome});}
    catch {return response(503,{code:'LEDGER_UNCONFIRMED_STOP'});}
   }
   return response(503,{code:reserved?'TRIAL_ATTEMPT_STOPPED':'TRIAL_REQUEST_DENIED',accounting});
  }
 };
}
