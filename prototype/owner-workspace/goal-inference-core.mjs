// Offline contract only. No model, persistence, network or production auth boundary.
import {intakeFields,intakeState} from '../../apps/web/goal-intake.mjs';
const keys=intakeFields.map(field=>field.key);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=code=>{throw new Error(code);};
function exact(object,allowed,code='INVALID_SHAPE') {
 if(!object || Object.getPrototypeOf(object)!==Object.prototype ||
 Reflect.ownKeys(object).length!==allowed.length || allowed.some(key=>
 !Object.hasOwn(Object.getOwnPropertyDescriptor(object,key)||{},'value')))fail(code);
}
function dense(array,max,min=0) {
 return Array.isArray(array)&&Object.getPrototypeOf(array)===Array.prototype&&array.length>=min&&array.length<=max&&
 Reflect.ownKeys(array).length===array.length+1&&
 Array.from({length:array.length},(_,index)=>index).every(index=>
 Object.hasOwn(Object.getOwnPropertyDescriptor(array,String(index))||{},'value'));
}
function text(value) {
 if(typeof value!=='string'||!value.trim()||Array.from(value.trim()).length>2000)fail('INVALID_TEXT');
 return value.trim();
}
function context(snapshot) {
 if(!snapshot || typeof snapshot.organizationId!=='string'||typeof snapshot.goalId!=='string'||
 !uuid.test(snapshot.organizationId)||!uuid.test(snapshot.goalId)||
 !['owner','editor','viewer'].includes(snapshot.role)||!dense(snapshot.turns,200,1))fail('INVALID_CONTEXT');
 for(const turn of snapshot.turns) {
  if(turn.organization_id!==snapshot.organizationId||turn.goal_id!==snapshot.goalId)fail('SOURCE_SCOPE_MISMATCH');
  text(turn.answer_text);
 }
 return intakeState(snapshot.turns);
}
function freeze(value) {
 if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
 return value;
}
export function validatedInferenceData(output,snapshot) {
 const state=context(snapshot);
 exact(output,['contract_version','operation','organization_id','goal_id','expected_version','fields','missing_fields']);
 if(output.contract_version!==1||output.operation!=='propose_intake_fields')fail('OPERATION_NOT_ALLOWED');
 if(output.organization_id!==snapshot.organizationId||output.goal_id!==snapshot.goalId)fail('PROPOSAL_SCOPE_MISMATCH');
 if(!Number.isInteger(output.expected_version)||output.expected_version!==state.version)fail('VERSION_DRIFT');
 if(!dense(output.fields,keys.length)||!dense(output.missing_fields,keys.length))fail('INVALID_FIELDS');
 const seen=new Set();
 const fields=output.fields.map(field=>{
  exact(field,['key','value','source_refs']);
  if(!keys.includes(field.key)||seen.has(field.key))fail('FIELD_NOT_ALLOWED');
  seen.add(field.key);
  const value=text(field.value);
  if(!dense(field.source_refs,8,1))fail('SOURCE_REQUIRED');
  const refs=field.source_refs.map(ref=>{
   exact(ref,['turn_version','quote']);
   if(!Number.isInteger(ref.turn_version))fail('INVALID_SOURCE');
   const turn=snapshot.turns[ref.turn_version-1];
   if(!turn||turn.version_number!==ref.turn_version||
    !['goal',field.key].includes(turn.question_key)||typeof ref.quote!=='string'||
    !ref.quote.trim()||!turn.answer_text.includes(ref.quote))fail('UNVERIFIABLE_SOURCE');
   return {turn_version:ref.turn_version,quote:ref.quote};
  });
  if(new Set(refs.map(ref=>JSON.stringify(ref))).size!==refs.length)fail('DUPLICATE_SOURCE');
  refs.sort((a,b)=>a.turn_version-b.turn_version||a.quote.localeCompare(b.quote));
  return {key:field.key,value,source_refs:refs};
 }).sort((a,b)=>keys.indexOf(a.key)-keys.indexOf(b.key));
 const missing=keys.filter(key=>!state.answers[key]&&!seen.has(key));
 if(output.missing_fields.some(key=>!keys.includes(key))||
 new Set(output.missing_fields).size!==output.missing_fields.length||
 missing.length!==output.missing_fields.length||missing.some(key=>!output.missing_fields.includes(key)))fail('MISSING_FIELDS_MISMATCH');
 const proposal={contract_version:1,operation:'propose_intake_fields',organization_id:snapshot.organizationId,
 goal_id:snapshot.goalId,expected_version:state.version,fields,missing_fields:missing};
 // Binds confirmation to content AND immutable source snapshot; not an auth token.
 const history=snapshot.turns.map(t=>[t.version_number,t.question_key,t.answer_text]);
 return freeze({proposal,fingerprintText:JSON.stringify([proposal,history])});
}
export function materializeInferenceProposal(data,proposal_id) {
 if(typeof proposal_id!=='string'||!/^[a-f0-9]{64}$/.test(proposal_id))fail('INVALID_PROPOSAL_HASH');
 return freeze({...data.proposal,proposal_id,status:'awaiting_user_confirmation',inference_verified:false});
}
export function prepareConfirmedIntakeTurnWith(output,snapshot,confirmation,fieldKey,requestId,validateInferenceProposal) {
 const proposal=validateInferenceProposal(output,snapshot);
 if(snapshot.role!=='owner')fail('OWNER_REQUIRED');
 exact(confirmation,['proposal_id','expected_version','confirmed'],'CONFIRMATION_REQUIRED');
 if(confirmation.confirmed!==true||confirmation.proposal_id!==proposal.proposal_id||
 confirmation.expected_version!==proposal.expected_version)fail('CONFIRMATION_REQUIRED');
 if(typeof requestId!=='string'||!uuid.test(requestId))fail('INVALID_REQUEST_ID');
 const field=proposal.fields.find(item=>item.key===fieldKey);
 const state=intakeState(snapshot.turns);
 if(!field||(!state.answers[fieldKey]&&state.next?.key!==fieldKey))fail('INTAKE_ORDER_REQUIRED');
 if(state.version>=200)fail('HISTORY_LIMIT');
 // A single append intent; actual authenticated RPC remains the write boundary.
 // Each accepted append changes the version, so the next proposal needs reconfirmation.
 return freeze({goalId:proposal.goal_id,requestId,expectedVersion:proposal.expected_version,
 questionKey:field.key,answer:field.value,requiresGoalReconfirmation:true});
}
