// Unwired contract adapter. Only injected API/context; no Auth, fetch, model or storage.
// readGoal rows omit scope IDs. Their query context comes from the selected panel and
// current membership; explicit returned IDs must match. Remote RLS remains unverified.
import {intakeState,intakeFields} from './goal-intake.mjs';
import {validatedInferenceData,materializeInferenceProposal,prepareConfirmedIntakeTurnWith} from './goal-inference-core.mjs';
const clone=value=>structuredClone(value);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=code=>{throw Error(code);};
const identity=c=>JSON.stringify([c.organizationId,c.goalId,c.role,c.sessionId??null]);
const history=turns=>JSON.stringify(turns.map(t=>[t.version_number,t.question_key,t.answer_text]));
function snapshotFor(context,rows){
 if(!uuid.test(context?.organizationId)||!uuid.test(context?.goalId)||!['owner','editor','viewer'].includes(context.role)||!Array.isArray(rows)||!rows.length||rows.length>200)fail('INVALID_CONTEXT');
 const turns=rows.map(row=>{
  if((row.organization_id!==undefined&&row.organization_id!==context.organizationId)||(row.goal_id!==undefined&&row.goal_id!==context.goalId))fail('SOURCE_SCOPE_MISMATCH');
  return {...clone(row),organization_id:context.organizationId,goal_id:context.goalId};
 });
 const snapshot={organizationId:context.organizationId,goalId:context.goalId,role:context.role,turns};
 const state=intakeState(turns);
 // Reuse full shape/history checks even before a proposal is supplied.
 validatedInferenceData({contract_version:1,operation:'propose_intake_fields',organization_id:context.organizationId,goal_id:context.goalId,expected_version:state.version,fields:[],missing_fields:intakeFields.filter(f=>!state.answers[f.key]).map(f=>f.key)},snapshot);
 return snapshot;
}
async function proposalFor(raw,snapshot){
 const data=validatedInferenceData(raw,snapshot),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.fingerprintText));
 return materializeInferenceProposal(data,[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join(''));
}
export function createGoalDraftAdapter({api,getContext}){
 if(typeof api?.readGoal!=='function'||typeof api?.saveGoalTurn!=='function'||typeof getContext!=='function')fail('INVALID_ADAPTER');
 let context=null,snapshot=null,raw=null,proposal=null,receipt=null,epoch=0,active=null,status='closed',error=null;
 function clear(reason='CLOSED'){epoch++;context=null;snapshot=null;raw=null;proposal=null;receipt=null;active=null;status='closed';error=reason;}
 function guard(ticket){
  if(ticket.epoch!==epoch||!context||identity(ticket.context)!==identity(context))fail('STALE_OPERATION');
  const current=getContext();if(!current)fail('SIGN_IN_REQUIRED');
  if(current.organizationId!==context.organizationId||(current.goalId!==undefined&&current.goalId!==context.goalId)||(current.sessionId??null)!==(context.sessionId??null))fail('CONTEXT_CHANGED');
  if(current.role!=='owner'||context.role!=='owner')fail('OWNER_REQUIRED');
 }
 function view(){
  if(context){try{guard({epoch,context});}catch(e){clear(e.message);}}
  return clone({status,error,busy:active!==null,context,snapshot,raw,proposal,receipt,confirmed:receipt!==null});
 }
 async function run(operation){
  if(active)fail('DRAFT_BUSY');
  const ticket={epoch,context:clone(context)};active=ticket;
  try{guard(ticket);await operation(ticket);}
  catch(e){if(active===ticket){raw=null;proposal=null;receipt=null;status='error';error=e.message;epoch++;}throw e;}
  finally{if(active===ticket)active=null;}
  return view();
 }
 async function fresh(ticket){const rows=await api.readGoal(ticket.context.goalId);guard(ticket);return snapshotFor(ticket.context,rows);}
 return {
  clear,view,
  select(selected){clear('SELECTION_CHANGED');const next=snapshotFor(selected,selected.turns);context={organizationId:selected.organizationId,goalId:selected.goalId,role:selected.role,sessionId:selected.sessionId??null};snapshot=next;status='idle';error=null;return view();},
  review(output){return run(async ticket=>{const validated=validatedInferenceData(output,snapshot);raw=clone(validated.proposal);receipt=null;proposal=await proposalFor(raw,snapshot);guard(ticket);status='review';error=null;return view();});},
  edit(key,value){
   if(active)fail('DRAFT_BUSY');
   try{
    guard({epoch,context});if(!raw||!raw.fields.some(f=>f.key===key))fail('FIELD_NOT_ALLOWED');
    // Any attempted edit invalidates the old confirmation, including invalid text.
    receipt=null;proposal=null;epoch++;status='review';
    const next=clone(raw);next.fields.find(f=>f.key===key).value=value;raw=clone(validatedInferenceData(next,snapshot).proposal);return view();
   }catch(e){raw=null;proposal=null;receipt=null;status='error';error=e.message;throw e;}
  },
  confirm(){return run(async ticket=>{
   if(!raw)fail('DRAFT_REQUIRED');receipt=null;
   const baseline=await proposalFor(raw,snapshot);guard(ticket);
   const current=await fresh(ticket),checked=await proposalFor(raw,current);guard(ticket);
   if(checked.proposal_id!==baseline.proposal_id)fail('SOURCE_CHANGED');
   snapshot=current;proposal=checked;receipt={proposal_id:checked.proposal_id,expected_version:checked.expected_version,confirmed:true};status='confirmed';error=null;return view();
  });},
  save(fieldKey){return run(async ticket=>{
   if(!raw||!receipt||status!=='confirmed')fail('CONFIRMATION_REQUIRED');
   const output=clone(raw),confirmation=clone(receipt),current=await fresh(ticket);
   const checked=await proposalFor(output,current);guard(ticket);
   const intent=prepareConfirmedIntakeTurnWith(output,current,confirmation,fieldKey,crypto.randomUUID(),()=>checked);
   // Consume before dispatch: no duplicate click or automatic retry after uncertainty.
   receipt=null;status='saving';
   const result=await api.saveGoalTurn({goalId:intent.goalId,requestId:intent.requestId,expectedVersion:intent.expectedVersion,questionKey:intent.questionKey,answer:intent.answer});guard(ticket);
   if(result?.goal_id!==context.goalId)fail('SAVE_RESULT_MISMATCH');
   const readback=await fresh(ticket),last=readback.turns.at(-1);
   if(readback.turns.length!==current.turns.length+1||history(readback.turns.slice(0,-1))!==history(current.turns)||last.question_key!==intent.questionKey||last.answer_text!==intent.answer)fail('READBACK_MISMATCH');
   snapshot=readback;raw=null;proposal=null;receipt=null;epoch++;status='saved';error=null;return view();
  });},
 };
}
