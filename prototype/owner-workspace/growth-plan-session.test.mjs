import assert from 'node:assert/strict';
import test from 'node:test';
import {intakeFields} from '../../apps/web/goal-intake.mjs';
import {createGrowthPlan} from '../../apps/web/growth-plan-contract.mjs';
import {createGrowthPlanSession} from '../../apps/web/growth-plan-session.mjs';
function fixture(){
 let context={organizationId:'93a88055-0a0b-40c0-b22f-a6d312320001',goalId:'5055ca31-40cc-435d-9f52-cdf19166440c',role:'owner',sessionId:'synthetic'};
 let turns=[{version_number:1,question_key:'goal',answer_text:'合成工業零件搜尋'}];
 for(const field of intakeFields)turns.push({version_number:turns.length+1,question_key:field.key,answer_text:field.label});
 turns.push({version_number:8,question_key:'confirm',answer_text:'確認'});
 const cards=[{id:'draft',title:'草稿',deliverable:'內部預覽',dependsOn:[],missingInputs:[],evidence:[{turnVersion:1,quote:'工業零件'}]}];
 const plan=createGrowthPlan({id:'f709d43d-12be-4dc2-8833-aa6d8e96cf01',context,turns,cards});
 const session=createGrowthPlanSession({getContext:()=>context,getTurns:()=>turns});session.open(plan);
 return {session,cards,setContext:c=>{context=c;},getContext:()=>context,setTurns:t=>{turns=t;},getTurns:()=>turns};
}
const expected=s=>({expectedVersion:s.view().plan.version,expectedStateRevision:s.view().plan.stateRevision});
test('session retains immutable plan versions and status event snapshots',()=>{
 const {session:s,cards}=fixture();s.approve(expected(s));s.transition({...expected(s),cardId:'draft',status:'running'});
 s.transition({...expected(s),cardId:'draft',status:'completed',result:'合成預覽'});s.revise({...expected(s),cards});
 const v=s.view();assert.equal(v.plan.version,2);assert.equal(v.plan.status,'draft');assert.equal(v.events.length,5);
 assert.deepEqual(v.events.map(e=>e.operation),['opened','approved','work_status','work_status','revised']);
 assert.equal(v.events[0].plan.status,'draft');assert.equal(v.events[3].plan.cards[0].result,'合成預覽');assert.equal(v.plan.cards[0].result,null);
 v.events[3].plan.cards[0].result='changed';assert.equal(s.view().events[3].plan.cards[0].result,'合成預覽');
});
test('duplicate or stale approve/revise/transition never append events',()=>{
 const {session:s,cards}=fixture();const old=expected(s);s.approve(old);const count=s.view().events.length;
 assert.throws(()=>s.approve(old),/STATE_VERSION_CONFLICT/);assert.throws(()=>s.revise({...old,cards}),/STATE_VERSION_CONFLICT/);
 assert.throws(()=>s.transition({...old,cardId:'draft',status:'running'}),/STATE_VERSION_CONFLICT/);assert.equal(s.view().events.length,count);
});
test('logout, role/session/org/goal switch clears local plan and history',()=>{
 for(const change of [()=>null,c=>({...c,role:'viewer'}),c=>({...c,sessionId:'new'}),c=>({...c,goalId:'f709d43d-12be-4dc2-8833-aa6d8e96cf01'}),c=>({...c,organizationId:'f709d43d-12be-4dc2-8833-aa6d8e96cf01'})]){
  const f=fixture();f.setContext(change(f.getContext()));const v=f.session.view();assert.equal(v.status,'closed');assert.equal(v.plan,null);assert.deepEqual(v.events,[]);assert.equal(v.error,'CONTEXT_CHANGED');
 }
});
test('source drift clears local state and cannot approve stale contents',()=>{
 const f=fixture();const old=expected(f.session);f.setTurns(f.getTurns().map((t,i)=>i? t:{...t,answer_text:'不同目標'}));
 assert.throws(()=>f.session.approve(old),/GOAL_CHANGED/);assert.equal(f.session.view().plan,null);
});
test('viewer can open and inspect but cannot mutate; clear permits no operations',()=>{
 const f=fixture();const plan=f.session.view().plan;f.setContext({...f.getContext(),role:'viewer'});f.session.open(plan);
 assert.equal(f.session.view().plan.version,1);assert.throws(()=>f.session.approve(expected(f.session)),/OWNER_REQUIRED/);
 assert.equal(f.session.view().status,'closed');assert.throws(()=>f.session.revise({cards:f.cards}),/PLAN_REQUIRED/);
});
test('invalid open clears former state, and invalid status preserves prior event history',()=>{
 const f=fixture();f.session.approve(expected(f.session));const before=f.session.view();
 assert.throws(()=>f.session.transition({...expected(f.session),cardId:'draft',status:'completed',result:'跳過執行'}),/ILLEGAL_TRANSITION/);
 assert.deepEqual(f.session.view(),before);
 assert.throws(()=>f.session.open({...before.plan,published:true}));assert.equal(f.session.view().status,'closed');assert.deepEqual(f.session.view().events,[]);
});
