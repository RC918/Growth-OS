// Memory-only M2 session. Refresh discards history; never calls storage or APIs.
import {inspectGrowthPlan,reviseGrowthPlan,approveGrowthPlan,transitionWorkCard} from './growth-plan-contract.mjs';
const clone=value=>structuredClone(value);
const fail=code=>{throw Error(code);};
const identity=c=>JSON.stringify([c?.organizationId,c?.goalId,c?.role,c?.sessionId??null]);
export function createGrowthPlanSession({getContext,getTurns}){
 if(typeof getContext!=='function'||typeof getTurns!=='function')fail('INVALID_SESSION');
 let selected=null,current=null,events=[],error=null;
 function clear(reason='CLOSED'){selected=null;current=null;events=[];error=reason;}
 function checked(owner=false){
  if(!current)fail('PLAN_REQUIRED');
  const context=getContext();
  try{
   if(!context||identity(context)!==identity(selected))fail('CONTEXT_CHANGED');
   const turns=getTurns();inspectGrowthPlan(current,context,turns);
   if(owner&&context.role!=='owner')fail('OWNER_REQUIRED');
   return {context,turns};
  }catch(e){clear(e.message);throw e;}
 }
 function view(){
  if(current){try{checked();}catch{/* Invalid context clears all local state. */}}
  return clone({status:current?'open':'closed',error,plan:current,events});
 }
 function apply(operation,expectedVersion,expectedStateRevision,run){
  const {context,turns}=checked(true);
  if(expectedVersion!==current.version)fail('PLAN_VERSION_CONFLICT');
  if(expectedStateRevision!==current.stateRevision)fail('STATE_VERSION_CONFLICT');
  const next=run({context,turns,expectedVersion,expectedStateRevision});
  inspectGrowthPlan(next,context,turns);
  events.push({sequence:events.length+1,operation,plan:clone(next)});current=next;error=null;
  return view();
 }
 return {
  clear,view,
  open(plan){
   clear();const context=getContext();
   const checkedPlan=inspectGrowthPlan(plan,context,getTurns());
   selected=clone(context);current=checkedPlan;events=[{sequence:1,operation:'opened',plan:clone(current)}];error=null;return view();
  },
  revise({expectedVersion,expectedStateRevision,cards}){
   return apply('revised',expectedVersion,expectedStateRevision,args=>reviseGrowthPlan(current,{...args,cards}));
  },
  approve({expectedVersion,expectedStateRevision}){
   return apply('approved',expectedVersion,expectedStateRevision,args=>approveGrowthPlan(current,args));
  },
  transition({expectedVersion,expectedStateRevision,cardId,status,result=null}){
   return apply('work_status',expectedVersion,expectedStateRevision,args=>transitionWorkCard(current,{...args,cardId,status,result}));
  },
 };
}
