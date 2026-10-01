// Synthetic memory-only rehearsal. No Auth, fetch, model, remote store or permission grant.
import {intakeFields,intakeState} from './goal-intake.mjs';
import {validatedInferenceData,materializeInferenceProposal,prepareConfirmedIntakeTurnWith} from './goal-inference-core.mjs';
export const offlineFixtures=Object.freeze([
 {id:'parts',label:'貿易商 · 合成零件',goal:'合成測試：希望海外採購人員找到合成零件；尚無連結。',offering:'合成零件',audience:'海外採購人員',quote:'希望海外採購人員找到合成零件'},
 {id:'shop',label:'電商 · 合成杯子',goal:'合成測試：希望台灣買家找到合成杯子；尚無連結。',offering:'合成杯子',audience:'台灣買家',quote:'希望台灣買家找到合成杯子'},
]);
const clone=value=>structuredClone(value);
const org='11111111-1111-4111-8111-111111111111';
const fixtureGoal=id=>id==='parts'?'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export function createMemoryDraftStore(fixtureId){
 const fixture=offlineFixtures.find(f=>f.id===fixtureId);if(!fixture)throw Error('INVALID_FIXTURE');
 const goal=fixtureGoal(fixture.id);
 let snapshot={organizationId:org,goalId:goal,role:'owner',turns:[{organization_id:org,goal_id:goal,version_number:1,question_key:'goal',question_text:'合成原始目標',answer_text:fixture.goal}]};
 return {
  read:()=>clone(snapshot),
  append(intent){
   if(intent.goalId!==goal||intent.expectedVersion!==snapshot.turns.length)throw Error('VERSION_DRIFT');
   const field=intakeFields.find(f=>f.key===intent.questionKey);if(!field)throw Error('INVALID_FIELD');
   const next=clone(snapshot);next.turns.push({organization_id:org,goal_id:goal,version_number:next.turns.length+1,question_key:field.key,question_text:field.question,answer_text:intent.answer});
   intakeState(next.turns);snapshot=next;return clone(snapshot);
  },
 };
}
async function proposalFor(raw,snapshot){
 const data=validatedInferenceData(raw,snapshot);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.fingerprintText));
 return materializeInferenceProposal(data,[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''));
}
export function createOfflineDraftSession(fixtureId,{store=createMemoryDraftStore(fixtureId)}={}){
 const fixture=offlineFixtures.find(f=>f.id===fixtureId);if(!fixture)throw Error('INVALID_FIXTURE');
 let snapshot=store.read(),phase='review',receipt=null,revision=0,pending=['offering','audience'];
 const values={offering:fixture.offering,audience:fixture.audience},edited=new Set();
 function invalidate(){receipt=null;revision++;}
 function contextError(current=snapshot){
  if(current.organizationId!==org||current.goalId!==fixtureGoal(fixtureId)||current.turns.some(t=>t.organization_id!==org||t.goal_id!==fixtureGoal(fixtureId)))return 'PROPOSAL_SCOPE_MISMATCH';
  return current.role==='owner'?null:'OWNER_REQUIRED';
 }
 function requireEditable(current=snapshot){const error=contextError(current);if(error)throw Error(error);}
 function raw(){const state=intakeState(snapshot.turns);return {contract_version:1,operation:'propose_intake_fields',organization_id:snapshot.organizationId,goal_id:snapshot.goalId,expected_version:snapshot.turns.length,
  fields:pending.map(key=>({key,value:values[key],source_refs:[{turn_version:1,quote:fixture.quote}]})),
  missing_fields:intakeFields.filter(f=>!state.answers[f.key]&&!pending.includes(f.key)).map(f=>f.key)};}
 function view(){return clone({phase,canEdit:contextError()===null,contextError:contextError(),fixture:fixture.label,version:snapshot.turns.length,fields:pending.map(key=>({key,label:intakeFields.find(f=>f.key===key).label,value:values[key],edited:edited.has(key),quote:fixture.quote,sourceVersion:1})),
  missing:raw().missing_fields.map(key=>intakeFields.find(f=>f.key===key).label),history:snapshot.turns,confirmed:receipt!==null,proposalId:receipt?.proposal_id??null});}
 return {
  view,
  edit(key,value){requireEditable();if(phase==='cancelled'||phase==='complete'||!pending.includes(key))throw Error('DRAFT_NOT_EDITABLE');values[key]=value;edited.add(key);phase='review';invalidate();return view();},
  cancel(){for(const key of pending){values[key]=fixture[key];edited.delete(key);}phase='cancelled';invalidate();return view();},
  reopen(){if(phase!=='cancelled')throw Error('DRAFT_NOT_CANCELLED');phase=pending.length?'review':'complete';invalidate();return view();},
  async confirm(){
   requireEditable();
   if(phase==='cancelled'||phase==='complete')throw Error('DRAFT_NOT_CONFIRMABLE');
   const ticket=revision;const proposal=await proposalFor(raw(),snapshot);
   if(ticket!==revision)throw Error('DRAFT_CHANGED');
   receipt={proposal_id:proposal.proposal_id,expected_version:proposal.expected_version,confirmed:true};phase='confirmed';return view();
  },
  async simulateSave(){
   if(!receipt||phase!=='confirmed')throw Error('CONFIRMATION_REQUIRED');
   const ticket=revision,output=raw(),confirmation=clone(receipt),current=store.read();
   try{
    requireEditable(current);
    const proposal=await proposalFor(output,current);
    if(ticket!==revision||phase!=='confirmed')throw Error('DRAFT_CHANGED');
    const key=pending[0];
    const intent=prepareConfirmedIntakeTurnWith(output,current,confirmation,key,crypto.randomUUID(),()=>proposal);
    snapshot=store.append(intent);pending=pending.filter(k=>k!==key);phase=pending.length?'review':'complete';invalidate();return view();
   }catch(error){snapshot=store.read();phase=pending.length?'review':'complete';invalidate();throw error;}
  },
 };
}
