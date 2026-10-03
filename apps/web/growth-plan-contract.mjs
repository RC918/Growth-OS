// Offline M2 contract only: caller context is not remote Auth/RLS proof.
// No model, persistence, publishing or external execution is performed here.
import {intakeState} from './goal-intake.mjs';
const copy=value=>structuredClone(value);
const fail=code=>{throw new Error(code);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text=(value,max=2000)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
function scope(context,owner=false){
 if(!uuid.test(context?.organizationId)||!uuid.test(context?.goalId)||!['owner','viewer','editor'].includes(context.role))fail('INVALID_CONTEXT');
 if(owner&&context.role!=='owner')fail('OWNER_REQUIRED');
}
function source(context,turns){
 scope(context);
 if(!Array.isArray(turns)||turns.length===0||turns.length>200)fail('INVALID_HISTORY');
 for(const t of turns){
  if((t.organization_id!==undefined&&t.organization_id!==context.organizationId)||(t.goal_id!==undefined&&t.goal_id!==context.goalId))fail('SOURCE_SCOPE_MISMATCH');
  if(!Number.isSafeInteger(t.version_number)||!text(t.answer_text))fail('INVALID_HISTORY');
 }
 const state=intakeState(turns);
 if(!state.confirmed)fail('GOAL_CONFIRMATION_REQUIRED');
 return {version:state.version,fingerprint:JSON.stringify(turns.map(t=>[t.version_number,t.question_key,t.answer_text]))};
}
function cardsFor(cards,turns){
 if(!Array.isArray(cards)||cards.length===0||cards.length>20)fail('INVALID_CARDS');
 const seen=new Set();
 return cards.map(card=>{
  if(!text(card.id,80)||seen.has(card.id)||!text(card.title,200)||!text(card.deliverable)||!Array.isArray(card.dependsOn)||new Set(card.dependsOn).size!==card.dependsOn.length||card.dependsOn.some(id=>!seen.has(id)))fail('INVALID_CARD_DEPENDENCY');
  if(!Array.isArray(card.missingInputs)||card.missingInputs.length>20||card.missingInputs.some(v=>!text(v,200)))fail('INVALID_MISSING_INPUTS');
  if(!Array.isArray(card.evidence)||card.evidence.length===0||card.evidence.length>20)fail('EVIDENCE_REQUIRED');
  const evidence=card.evidence.map(ref=>{
   if(!Number.isSafeInteger(ref.turnVersion)||!text(ref.quote,500)||!turns[ref.turnVersion-1]?.answer_text.includes(ref.quote))fail('EVIDENCE_MISMATCH');
   return {turnVersion:ref.turnVersion,quote:ref.quote};
  });
  seen.add(card.id);
  return {id:card.id,title:card.title,deliverable:card.deliverable,dependsOn:copy(card.dependsOn),missingInputs:copy(card.missingInputs),evidence,status:'draft',result:null};
 });
}
function approvalContent(plan,cards){return JSON.stringify([plan.id,plan.organizationId,plan.goalId,plan.goalVersion,plan.sourceFingerprint,plan.version,cards]);}
function nextRevision(plan){if(plan.stateRevision===Number.MAX_SAFE_INTEGER)fail('STATE_VERSION_LIMIT');return plan.stateRevision+1;}
function check(plan,context,turns,owner=false){
 scope(context,owner);
 if(plan?.organizationId!==context.organizationId||plan?.goalId!==context.goalId)fail('PLAN_SCOPE_MISMATCH');
 const current=source(context,turns);
 if(plan.goalVersion!==current.version||plan.sourceFingerprint!==current.fingerprint)fail('GOAL_CHANGED');
 if(plan.contractVersion!==1||!uuid.test(plan.id)||!Number.isSafeInteger(plan.version)||plan.version<1||!['draft','approved'].includes(plan.status)||plan.published!==false||plan.generation!=='manual_rules')fail('INVALID_PLAN');
 if(!Number.isSafeInteger(plan.stateRevision)||plan.stateRevision<1)fail('INVALID_STATE_VERSION');
 const normalized=cardsFor(plan.cards,turns);
 if(plan.status==='draft'&&plan.approvalFingerprint!==null)fail('INVALID_DRAFT_APPROVAL');
 if(plan.status==='approved'&&plan.approvalFingerprint!==approvalContent(plan,normalized))fail('APPROVAL_CHANGED');
 for(let i=0;i<plan.cards.length;i++){
  const c=plan.cards[i];
  if(!['draft','ready','running','completed','failed'].includes(c.status))fail('INVALID_CARD_STATUS');
  if(c.status==='completed'&&!text(c.result))fail('RESULT_REQUIRED');
  if(c.status==='failed'&&!text(c.result))fail('FAILURE_REASON_REQUIRED');
  if(['draft','ready','running'].includes(c.status)&&c.result!==null)fail('INVALID_CARD_RESULT');
  if(plan.status==='draft'&&c.status!=='draft')fail('INVALID_DRAFT_STATE');
  if(plan.status==='approved'&&(c.status==='draft'||c.missingInputs.length))fail('INVALID_APPROVED_STATE');
  if(['running','completed','failed'].includes(c.status)&&normalized[i].dependsOn.some(id=>plan.cards.find(v=>v.id===id).status!=='completed'))fail('DEPENDENCY_NOT_COMPLETE');
 }
 return current;
}
export function createGrowthPlan({id,context,turns,cards}){
 scope(context,true);if(!uuid.test(id))fail('INVALID_PLAN_ID');
 const current=source(context,turns);
 return {contractVersion:1,id,organizationId:context.organizationId,goalId:context.goalId,goalVersion:current.version,sourceFingerprint:current.fingerprint,version:1,stateRevision:1,approvalFingerprint:null,status:'draft',generation:'manual_rules',published:false,cards:cardsFor(cards,turns)};
}
export function inspectGrowthPlan(plan,context,turns){check(plan,context,turns);return copy(plan);}
export function reviseGrowthPlan(plan,{context,turns,expectedVersion,cards}){
 check(plan,context,turns,true);if(expectedVersion!==plan.version)fail('PLAN_VERSION_CONFLICT');
 if(plan.version===Number.MAX_SAFE_INTEGER)fail('PLAN_VERSION_LIMIT');
 return {...copy(plan),version:plan.version+1,stateRevision:nextRevision(plan),approvalFingerprint:null,status:'draft',cards:cardsFor(cards,turns)};
}
export function approveGrowthPlan(plan,{context,turns,expectedVersion}){
 check(plan,context,turns,true);if(expectedVersion!==plan.version)fail('PLAN_VERSION_CONFLICT');
 if(plan.status!=='draft')fail('PLAN_ALREADY_APPROVED');
 if(plan.cards.some(c=>c.missingInputs.length))fail('MISSING_INPUTS');
 return {...copy(plan),status:'approved',stateRevision:nextRevision(plan),approvalFingerprint:approvalContent(plan,cardsFor(plan.cards,turns)),cards:plan.cards.map(c=>({...copy(c),status:'ready'}))};
}
export function transitionWorkCard(plan,{context,turns,expectedVersion,expectedStateRevision,cardId,status,result=null}){
 check(plan,context,turns,true);if(expectedVersion!==plan.version)fail('PLAN_VERSION_CONFLICT');
 if(plan.status!=='approved')fail('PLAN_APPROVAL_REQUIRED');
 if(expectedStateRevision!==plan.stateRevision)fail('STATE_VERSION_CONFLICT');
 const card=plan.cards.find(c=>c.id===cardId);if(!card)fail('CARD_NOT_FOUND');
 if(card.dependsOn.some(id=>plan.cards.find(c=>c.id===id).status!=='completed'))fail('DEPENDENCY_NOT_COMPLETE');
 const legal={ready:['running'],running:['completed','failed'],failed:['running'],completed:[]};
 if(!legal[card.status]?.includes(status))fail('ILLEGAL_TRANSITION');
 if((status==='completed'||status==='failed')&&!text(result))fail(status==='failed'?'FAILURE_REASON_REQUIRED':'RESULT_REQUIRED');
 if(status==='running'&&result!==null)fail('INVALID_CARD_RESULT');
 return {...copy(plan),stateRevision:nextRevision(plan),cards:plan.cards.map(c=>c.id===cardId?{...copy(c),status,result}:copy(c))};
}
