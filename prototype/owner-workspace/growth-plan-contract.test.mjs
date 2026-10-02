import assert from 'node:assert/strict';
import test from 'node:test';
import {intakeFields} from '../../apps/web/goal-intake.mjs';
import {createGrowthPlan,inspectGrowthPlan,reviseGrowthPlan,approveGrowthPlan,transitionWorkCard} from '../../apps/web/growth-plan-contract.mjs';
const context={organizationId:'93a88055-0a0b-40c0-b22f-a6d312320001',goalId:'5055ca31-40cc-435d-9f52-cdf19166440c',role:'owner'};
const turns=[{version_number:1,question_key:'goal',answer_text:'合成：讓採購找到工業零件'}];
for(const field of intakeFields)turns.push({version_number:turns.length+1,question_key:field.key,answer_text:field.label});
turns.push({version_number:8,question_key:'confirm',answer_text:'確認'});
const cards=[{id:'draft',title:'整理產品搜尋草稿',deliverable:'產品標題與描述預覽',dependsOn:[],missingInputs:[],evidence:[{turnVersion:1,quote:'工業零件'}]},
 {id:'review',title:'內部核對來源',deliverable:'查核紀錄',dependsOn:['draft'],missingInputs:[],evidence:[{turnVersion:1,quote:'採購'}]}];
const make=()=>createGrowthPlan({id:'f709d43d-12be-4dc2-8833-aa6d8e96cf01',context,turns,cards});
const args=extra=>({context,turns,expectedVersion:1,...extra});
const approved=()=>approveGrowthPlan(make(),args());
const step=(p,extra)=>transitionWorkCard(p,args({expectedStateRevision:p.stateRevision,...extra}));
test('confirmed goal creates a source-linked manual draft, never a publication',()=>{
 const p=make();assert.equal(p.goalVersion,8);assert.equal(p.status,'draft');assert.equal(p.generation,'manual_rules');assert.equal(p.published,false);
 assert.deepEqual(p.cards[1].dependsOn,['draft']);assert.equal(p.cards[0].evidence[0].quote,'工業零件');
 p.cards[0].evidence[0].quote='changed';assert.equal(cards[0].evidence[0].quote,'工業零件');
});
test('incomplete, unconfirmed, malformed and foreign history are rejected',()=>{
 for(const history of [turns.slice(0,-1),[{...turns[0],version_number:2}],turns.map(t=>({...t,organization_id:'foreign'})),turns.map(t=>({...t,goal_id:'foreign'}))])assert.throws(()=>createGrowthPlan({id:make().id,context,turns:history,cards}));
});
test('viewer and editor may inspect only; owner required for all mutations',()=>{
 const plan=make();
 for(const role of ['viewer','editor']){
  const c={...context,role};assert.deepEqual(inspectGrowthPlan(plan,c,turns),plan);
  for(const call of [()=>createGrowthPlan({id:plan.id,context:c,turns,cards}),()=>approveGrowthPlan(plan,args({context:c})),()=>reviseGrowthPlan(plan,args({context:c,cards})),()=>transitionWorkCard(approved(),args({context:c,cardId:'draft',status:'running'}))])assert.throws(call,/OWNER_REQUIRED/);
 }
});
test('scope mismatch and signed out contexts cannot read or mutate plans',()=>{
 for(const c of [null,{...context,organizationId:'f709d43d-12be-4dc2-8833-aa6d8e96cf01'},{...context,goalId:'f709d43d-12be-4dc2-8833-aa6d8e96cf01'}])assert.throws(()=>inspectGrowthPlan(make(),c,turns));
});
test('changed goal, even same-version content, invalidates plan approval and actions',()=>{
 for(const history of [turns.map((t,i)=>i===0?{...t,answer_text:'別的目標'}:t),[...turns,{version_number:9,question_key:'offering',answer_text:'修正'}]]){
  assert.throws(()=>approveGrowthPlan(make(),args({turns:history})));
  assert.throws(()=>transitionWorkCard(approved(),args({turns:history,cardId:'draft',status:'running'})));
 }
});
test('quotes must be present in exact source turns and dependency order must be acyclic',()=>{
 for(const bad of [[{...cards[0],evidence:[{turnVersion:2,quote:'工業零件'}]}],[{...cards[0],dependsOn:['draft']}],[{...cards[0],dependsOn:['review']},cards[1]],[cards[0],{...cards[1],id:'draft'}],[{...cards[0],evidence:[]}]])assert.throws(()=>createGrowthPlan({id:make().id,context,turns,cards:bad}));
});
test('missing inputs are visible and block approval',()=>{
 const p=createGrowthPlan({id:make().id,context,turns,cards:[{...cards[0],missingInputs:['產品公開來源']} ]});
 assert.deepEqual(p.cards[0].missingInputs,['產品公開來源']);assert.throws(()=>approveGrowthPlan(p,args()),/MISSING_INPUTS/);
});
test('revision creates a new draft version, clears every approval and result, preserves old plan',()=>{
 const a=approved();const running=step(a,{cardId:'draft',status:'running'});
 const done=step(running,{cardId:'draft',status:'completed',result:'合成內部預覽'});
 const next=reviseGrowthPlan(done,args({cards:done.cards}));assert.equal(next.version,2);assert.equal(next.status,'draft');
 assert.ok(next.cards.every(c=>c.status==='draft'&&c.result===null));assert.equal(done.cards[0].status,'completed');
 assert.throws(()=>approveGrowthPlan(next,args()),/PLAN_VERSION_CONFLICT/);
 assert.equal(approveGrowthPlan(next,args({expectedVersion:2})).status,'approved');
});
test('unapproved plans cannot run; dependencies cannot run until evidence-backed completion',()=>{
 assert.throws(()=>transitionWorkCard(make(),args({cardId:'draft',status:'running'})),/PLAN_APPROVAL_REQUIRED/);
 let p=approved();assert.throws(()=>step(p,{cardId:'review',status:'running'}),/DEPENDENCY_NOT_COMPLETE/);
 p=step(p,{cardId:'draft',status:'running'});assert.throws(()=>step(p,{cardId:'draft',status:'completed'}),/RESULT_REQUIRED/);
 p=step(p,{cardId:'draft',status:'completed',result:'本機預覽檔'});p=step(p,{cardId:'review',status:'running'});
 assert.equal(p.cards[1].status,'running');assert.equal(p.published,false);
});
test('failures need a reason, explicit retry is allowed, completed work cannot restart',()=>{
 let p=step(approved(),{cardId:'draft',status:'running'});
 assert.throws(()=>step(p,{cardId:'draft',status:'failed'}),/FAILURE_REASON_REQUIRED/);
 p=step(p,{cardId:'draft',status:'failed',result:'缺少附件'});p=step(p,{cardId:'draft',status:'running'});assert.equal(p.cards[0].result,null);
 p=step(p,{cardId:'draft',status:'completed',result:'本機檔案'});assert.throws(()=>step(p,{cardId:'draft',status:'running'}),/ILLEGAL_TRANSITION/);
});
test('invalid publication/state/result and stale expected versions fail closed',()=>{
 for(const changed of [{published:true},{status:'published'},{version:0},{generation:'ai'}])assert.throws(()=>inspectGrowthPlan({...make(),...changed},context,turns));
 assert.throws(()=>approveGrowthPlan(make(),args({expectedVersion:0})),/PLAN_VERSION_CONFLICT/);
 assert.throws(()=>step(approved(),{cardId:'draft',status:'published'}),/ILLEGAL_TRANSITION/);
 const p=approved();p.cards[0].status='completed';assert.throws(()=>inspectGrowthPlan(p,context,turns),/RESULT_REQUIRED/);
});
test('approved content tampering cannot reuse approval',()=>{
 const p=approved();p.cards[0].deliverable='未核准的新內容';
 assert.throws(()=>step(p,{expectedStateRevision:p.stateRevision,cardId:'draft',status:'running'}),/APPROVAL_CHANGED/);
});
test('stale work state revision cannot overwrite a newer transition',()=>{
 const a=approved();
 const running=transitionWorkCard(a,args({expectedStateRevision:a.stateRevision,cardId:'draft',status:'running'}));
 assert.throws(()=>transitionWorkCard(running,args({expectedStateRevision:a.stateRevision,cardId:'draft',status:'failed',result:'舊畫面'})),/STATE_VERSION_CONFLICT/);
});
