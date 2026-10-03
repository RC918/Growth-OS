import assert from 'node:assert/strict';
import test from 'node:test';
import {intakeState,intakeFields} from '../../apps/web/goal-intake.mjs';
import {createWorkspaceApi} from '../../apps/web/workspace-api.mjs';
const turns=[{version_number:1,question_key:'goal',answer_text:'让海外买家找到我的零件'}];
for(const field of intakeFields)turns.push({version_number:turns.length+1,question_key:field.key,answer_text:field.key==='asset'?'尚無連結':field.label});
test('goal without a website completes intake only, then waits for confirmation',()=>{
 assert.equal(intakeState([]).next.key,'goal');
 assert.equal(intakeState(turns.slice(0,1)).next.key,'offering');
 const result=intakeState(turns);assert.equal(result.next.key,'confirm');assert.equal(result.answers.asset,'尚無連結');assert.equal(result.confirmed,false);
});
test('confirmation and later correction preserve previous answers and invalidate confirmation',()=>{
 const confirmed=[...turns,{version_number:8,question_key:'confirm',answer_text:'確認'}];assert.equal(intakeState(confirmed).confirmed,true);
 const revised=[...confirmed,{version_number:9,question_key:'audience',answer_text:'海外採購人員'}];const state=intakeState(revised);
 assert.equal(state.confirmed,false);assert.equal(state.next.key,'confirm');assert.equal(state.answers.audience,'海外採購人員');assert.equal(confirmed[2].answer_text,'目標受眾');
});
test('incomplete, unordered or malformed conversation is rejected rather than guessed',()=>{
 for(const bad of [[{...turns[0],version_number:2}],[turns[0],{version_number:2,question_key:'confirm',answer_text:'確認'}],
 [turns[0],{version_number:2,question_key:'market',answer_text:'台灣'}]])assert.throws(()=>intakeState(bad));
});
test('goal API uses authenticated org, blocks viewer writes and refuses partial or absent history',async()=>{
 let role='owner',empty=false;const calls=[];
 const api=createWorkspaceApi({origin:'https://test.supabase.co',key:'sb_publishable_test',redirectOrigin:'https://test.example',fetchImpl:async(url,options)=>{
  const parsed=new URL(url);calls.push({parsed,options});
  let body=parsed.pathname==='/auth/v1/user'?{id:'test-user'}:parsed.pathname.endsWith('organization_members')?[{organization_id:'org-a',role}]:
   parsed.pathname.endsWith('growth_goals')?[{id:'goal-a'}]:parsed.pathname.endsWith('growth_goal_turns')?(empty?[]:turns):{goal_id:'goal-a',version_number:1};
  return {ok:true,json:async()=>body};
 }});
 const fragment='#access_token=synthetic&token_type=bearer&expires_in=3600';await api.completeMagicLink(fragment);
 await api.listGoals();await api.readGoal('goal-a');await api.saveGoalTurn({goalId:'goal-a',requestId:'request',expectedVersion:0,questionKey:'goal',answer:'目標'});
 for(const call of calls.filter(call=>call.parsed.pathname.includes('growth_goal')))assert.equal(call.parsed.searchParams.get('organization_id'),'eq.org-a');
 assert.equal(JSON.parse(calls.at(-1).options.body).p_organization_id,'org-a');
 empty=true;await assert.rejects(api.readGoal('goal-a'),/完整/);
 api.signOut();role='viewer';await api.completeMagicLink(fragment);assert.throws(()=>api.saveGoalTurn({}),/企業擁有者/);
 api.signOut();assert.throws(()=>api.listGoals(),/工作區/);
});
