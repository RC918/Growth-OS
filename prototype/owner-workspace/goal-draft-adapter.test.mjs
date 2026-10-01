// Injected Auth/Data API shapes only. No network, credentials, model or remote DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createGoalDraftAdapter} from '../../apps/web/goal-draft-adapter.mjs';
import {createGoalPanel} from '../../apps/web/workspace-goals.mjs';
import {createWorkspaceApi} from '../../apps/web/workspace-api.mjs';
import {intakeFields,intakeState} from '../../apps/web/goal-intake.mjs';
const org='13572468-1111-4111-8111-123456789abc',otherOrg='24681357-1111-4111-8111-123456789abc';
const goal='31415926-2222-4222-8222-123456789abc',otherGoal='27182818-2222-4222-8222-123456789abc';
const original=()=>[{version_number:1,question_key:'goal',question_text:'原始目標',answer_text:'合成測試：讓買家找到零件',created_at:'2026-10-02'}];
const clone=v=>structuredClone(v),waitFor=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,2));}throw Error('Test timed out');};
function draft(turns=original(),scope={organizationId:org,goalId:goal},keys=['offering','audience']){
 const state=intakeState(turns);return {contract_version:1,operation:'propose_intake_fields',organization_id:scope.organizationId,goal_id:scope.goalId,expected_version:state.version,
  fields:keys.map(key=>({key,value:key==='offering'?'零件':'買家',source_refs:[{turn_version:1,quote:'買家找到零件'}]})),missing_fields:intakeFields.filter(f=>!state.answers[f.key]&&!keys.includes(f.key)).map(f=>f.key)};
}
async function harness(){
 let current={organizationId:org,goalId:goal,role:'owner',sessionId:'synthetic-session-a'};
 const rows=new Map([[goal,original()],[otherGoal,original()]]),calls=[],controls={};
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 const api=createWorkspaceApi({origin:'https://offline-adapter.supabase.co',key:'sb_publishable_synthetic_only',redirectOrigin:'https://example.invalid',fetchImpl:async(url,options)=>{
  const parsed=new URL(url),path=parsed.pathname,body=options.body?JSON.parse(options.body):null;calls.push({path,method:options.method,body,query:parsed.searchParams});
  if(path==='/auth/v1/user')return json({id:'synthetic-user'});
  if(path==='/rest/v1/organization_members')return json([{organization_id:org,role:'owner'}]);
  if(path==='/rest/v1/growth_goals'){if(controls.holdList){controls.listWaiting=true;await controls.holdList;}return json([...rows.keys()].map(id=>({id,created_at:'2026-10-02'})));}
  if(path==='/rest/v1/growth_goal_turns'){
   assert.equal(parsed.searchParams.get('organization_id'),'eq.'+org);const id=parsed.searchParams.get('goal_id').slice(3);
   if(controls.holdRead){const held=controls.holdRead;controls.holdRead=null;controls.readWaiting=true;await held;}
   if(controls.failRead)return json({},503);
   return json(rows.get(id)); // Exactly the existing API columns: no scope IDs.
  }
  if(path==='/rest/v1/rpc/save_goal_turn'){
   assert.deepEqual(Object.keys(body).sort(),['p_organization_id','p_goal_id','p_request_id','p_expected_version','p_question_key','p_answer'].sort());assert.equal(body.p_organization_id,org);assert.match(body.p_request_id,/^[a-f0-9-]{36}$/);
   if(controls.failSave)return json({},503);
   if(controls.holdSave){controls.saveWaiting=true;await controls.holdSave;}
   const list=rows.get(body.p_goal_id);assert.equal(body.p_expected_version,list.length);
   if(!controls.noAppend)list.push({version_number:list.length+1,question_key:body.p_question_key,question_text:intakeFields.find(f=>f.key===body.p_question_key).question,answer_text:body.p_answer,created_at:'2026-10-02'});
   if(controls.failReadAfterSave)controls.failRead=true;
   return json({goal_id:controls.wrongResult?otherGoal:body.p_goal_id});
  }
  throw Error('Unexpected mock endpoint');
 }});
 await api.completeMagicLink('#access_token=synthetic-only&expires_in=3600&token_type=bearer');
 const adapter=createGoalDraftAdapter({api,getContext:()=>current});
 const select=async()=>adapter.select({...current,turns:await api.readGoal(current.goalId)});
 await select();
 return {api,adapter,rows,calls,controls,select,get context(){return current;},set context(v){current=v;},posts:()=>calls.filter(c=>c.path.endsWith('/rpc/save_goal_turn')),reads:()=>calls.filter(c=>c.path==='/rest/v1/growth_goal_turns')};
}
test('adapter is not enabled or imported by existing workspace/offline demo; panel mirrors stay exact',async()=>{
 for(const path of ['workspace.mjs','offline-draft-review.mjs'])assert.doesNotMatch(await readFile(new URL('../../apps/web/'+path,import.meta.url),'utf8'),/goal-draft-adapter|draftAdapter:/);
 assert.equal(await readFile(new URL('../../apps/web/workspace-goals.mjs',import.meta.url),'utf8'),await readFile(new URL('./workspace-goals.mjs',import.meta.url),'utf8'));
 const dom=new JSDOM('<div></div>'),previous=globalThis.document;globalThis.document=dom.window.document;
 try{const panel=createGoalPanel({},document.querySelector('div'));await assert.rejects(()=>panel.reviewDraft({}),/NOT_ENABLED/);await assert.rejects(()=>panel.saveDraftField('offering'),/NOT_ENABLED/);}finally{globalThis.document=previous;dom.window.close();}
});
test('real API-shaped mock uses supplied scope unchanged, rereads before confirm/save and reads back immutable append',async()=>{
 const h=await harness(),output=draft(),copy=clone(output);await h.adapter.review(output);await assert.rejects(()=>h.adapter.save('offering'),/CONFIRMATION/);assert.equal(h.posts().length,0);
 await h.adapter.review(output);await h.adapter.confirm();assert.equal(h.reads().length,2);const prior=clone(h.rows.get(goal));const result=await h.adapter.save('offering');
 assert.equal(result.status,'saved');assert.equal(result.busy,false);assert.equal(result.snapshot.turns.length,2);assert.equal(result.raw,null);assert.equal(result.confirmed,false);assert.equal(h.reads().length,4);assert.equal(h.posts().length,1);
 assert.equal(h.posts()[0].body.p_goal_id,output.goal_id);assert.equal(h.posts()[0].body.p_expected_version,1);assert.deepEqual(output,copy);assert.deepEqual(h.rows.get(goal).slice(0,1),prior);
 await assert.rejects(()=>h.adapter.save('audience'),/CONFIRMATION/);assert.equal(h.posts().length,1);
});
test('editing and invalid text consume confirmation; each next version requires an explicit new proposal and confirmation',async()=>{
 const h=await harness();await h.adapter.review(draft());await h.adapter.confirm();const hash=h.adapter.view().receipt.proposal_id;
 h.adapter.edit('offering','合成修正');assert.equal(h.adapter.view().confirmed,false);await h.adapter.confirm();assert.notEqual(h.adapter.view().receipt.proposal_id,hash);await h.adapter.save('offering');
 await assert.rejects(()=>h.adapter.review(draft()),/VERSION_DRIFT/);assert.equal(h.adapter.view().raw,null);assert.equal(h.posts().length,1);
 const next=draft(h.rows.get(goal),h.context,['audience']);await h.adapter.review(next);await h.adapter.confirm();assert.throws(()=>h.adapter.edit('audience',' '),/INVALID_TEXT/);assert.equal(h.adapter.view().confirmed,false);assert.equal(h.adapter.view().raw,null);
 await h.adapter.review(next);await h.adapter.confirm();await h.adapter.save('audience');assert.equal(h.rows.get(goal).length,3);assert.equal(h.posts().length,2);assert.equal(h.adapter.view().confirmed,false);
});
test('foreign proposal goal/tenant and explicit foreign source rows are refused without scope rewriting or save',async()=>{
 for(const scope of [{organizationId:otherOrg,goalId:goal},{organizationId:org,goalId:otherGoal}]){
  const h=await harness(),raw=draft(original(),scope),before=clone(raw);await assert.rejects(()=>h.adapter.review(raw),/PROPOSAL_SCOPE_MISMATCH/);assert.deepEqual(raw,before);assert.equal(h.posts().length,0);assert.equal(h.adapter.view().raw,null);
 }
 const h=await harness();await h.adapter.review(draft());h.api.readGoal=async()=>original().map(t=>({...t,organization_id:otherOrg,goal_id:goal}));await assert.rejects(()=>h.adapter.confirm(),/SOURCE_SCOPE_MISMATCH/);assert.equal(h.posts().length,0);
});
test('confirmation reread rejects version drift and same-version source changes even when quote still exists',async()=>{
 for(const mode of ['version','source','quote']){
  const h=await harness();await h.adapter.review(draft());if(mode==='version')h.rows.get(goal).push({version_number:2,question_key:'offering',answer_text:'別處更新'});else h.rows.get(goal)[0].answer_text=mode==='source'?'合成測試：讓買家找到零件；來源有改動':'原始來源已替換';
  await assert.rejects(()=>h.adapter.confirm(),mode==='version'?/VERSION_DRIFT/:mode==='source'?/SOURCE_CHANGED/:/UNVERIFIABLE_SOURCE/);assert.equal(h.posts().length,0);assert.equal(h.adapter.view().confirmed,false);assert.equal(h.adapter.view().raw,null);
 }
});
test('save reread refuses stale version/source, field order and revoked scope or role without dispatch',async()=>{
 for(const mode of ['version','source','goal','tenant','viewer','editor','logout','session','order']){
  const h=await harness();await h.adapter.review(draft());await h.adapter.confirm();
  if(mode==='version')h.rows.get(goal).push({version_number:2,question_key:'offering',answer_text:'其他版本'});
  if(mode==='source')h.rows.get(goal)[0].answer_text+='；改寫';
  if(mode==='goal')h.context={...h.context,goalId:otherGoal};if(mode==='tenant')h.context={...h.context,organizationId:otherOrg};
  if(['viewer','editor'].includes(mode))h.context={...h.context,role:mode};if(mode==='logout')h.context=null;if(mode==='session')h.context={...h.context,sessionId:'new-session'};
  await assert.rejects(()=>h.adapter.save(mode==='order'?'audience':'offering'),/VERSION_DRIFT|CONFIRMATION_REQUIRED|CONTEXT_CHANGED|OWNER_REQUIRED|SIGN_IN_REQUIRED|INTAKE_ORDER_REQUIRED/);
  assert.equal(h.posts().length,0,mode);assert.equal(h.adapter.view().confirmed,false,mode);assert.equal(h.adapter.view().raw,null,mode);
 }
});
test('viewer/editor cannot create a draft; reading current context on view clears revoked confirmation',async()=>{
 for(const role of ['viewer','editor']){const h=await harness();h.context={...h.context,role};await assert.rejects(()=>h.adapter.review(draft()),/OWNER_REQUIRED/);assert.equal(h.posts().length,0);}
 const h=await harness();await h.adapter.review(draft());await h.adapter.confirm();h.context=null;assert.equal(h.adapter.view().confirmed,false);assert.equal(h.adapter.view().snapshot,null);
});
test('scope switch or logout during pending reread cannot restore a proposal or dispatch a save',async()=>{
 for(const stage of ['confirm','save'])for(const change of ['logout','goal','tenant']){
  const h=await harness();await h.adapter.review(draft());if(stage==='save')await h.adapter.confirm();let release;h.controls.holdRead=new Promise(r=>release=r);
  const pending=stage==='confirm'?h.adapter.confirm():h.adapter.save('offering');await waitFor(()=>h.controls.readWaiting);
  if(change==='logout'){h.adapter.clear('SIGNED_OUT');h.context=null;}else{h.context={...h.context,goalId:otherGoal,...(change==='tenant'?{organizationId:otherOrg}: {})};h.adapter.select({...h.context,turns:original()});}
  release();await assert.rejects(()=>pending,/STALE_OPERATION/);
  if(change==='logout')assert.equal(h.adapter.view().snapshot,null);else assert.equal(h.adapter.view().context.goalId,otherGoal);
  assert.equal(h.adapter.view().raw,null);assert.equal(h.adapter.view().confirmed,false);assert.equal(h.posts().length,0);
 }
});
test('save error/readback mismatch consumes draft and never retries or regenerates a saveable proposal',async()=>{
 for(const mode of ['failSave','wrongResult','noAppend','failReadAfterSave']){
  const h=await harness();await h.adapter.review(draft());await h.adapter.confirm();h.controls[mode]=true;
  await assert.rejects(()=>h.adapter.save('offering'),/HTTP 503|SAVE_RESULT_MISMATCH|READBACK_MISMATCH/);assert.equal(h.posts().length,1);assert.equal(h.adapter.view().raw,null);assert.equal(h.adapter.view().confirmed,false);
  if(mode==='failReadAfterSave'){assert.equal(h.rows.get(goal).length,2);assert.equal(h.adapter.view().snapshot.turns.length,1);assert.equal(h.adapter.view().status,'error');} // Unknown server outcome, no local success or retry.
  await assert.rejects(()=>h.adapter.save('offering'),/CONFIRMATION/);assert.equal(h.posts().length,1);if(mode==='failSave')assert.equal(h.rows.get(goal).length,1);
 }
});
test('duplicate confirmation/save clicks allow only one pending operation and one append',async()=>{
 const h=await harness();await h.adapter.review(draft());let releaseRead;h.controls.holdRead=new Promise(r=>releaseRead=r);const confirming=h.adapter.confirm();await waitFor(()=>h.controls.readWaiting);await assert.rejects(()=>h.adapter.confirm(),/DRAFT_BUSY/);releaseRead();await confirming;
 let releaseSave;h.controls.holdSave=new Promise(r=>releaseSave=r);const saving=h.adapter.save('offering');await waitFor(()=>h.controls.saveWaiting);await assert.rejects(()=>h.adapter.save('offering'),/DRAFT_BUSY/);assert.equal(h.posts().length,1);releaseSave();await saving;assert.equal(h.rows.get(goal).length,2);assert.equal(h.adapter.view().busy,false);
});
test('optional goal panel seam synchronizes saved history and clears receipt on input, selection, workspace switch and close',async()=>{
 const h=await harness(),dom=new JSDOM('<div id="goal-panel"></div>'),previous=globalThis.document;globalThis.document=dom.window.document;
 const root=document.querySelector('div'),panel=createGoalPanel(h.api,root,{draftAdapter:h.adapter});
 try{
  // Membership callback can omit goalId: selection is owned by panel.select/epoch.
  h.context={organizationId:org,role:'owner',sessionId:'synthetic-session-a'};await panel.open('owner',h.context);
  await panel.reviewDraft(draft());await panel.confirmDraft();root.querySelector('textarea').dispatchEvent(new dom.window.Event('input'));assert.equal(h.adapter.view().confirmed,false);await assert.rejects(()=>panel.saveDraftField('offering'),/STALE|CONFIRMATION/);assert.equal(h.posts().length,0);
  await panel.reviewDraft(draft());await panel.confirmDraft();await panel.saveDraftField('offering');assert.match(root.textContent,/零件/);assert.match(root.textContent,/已保存並讀回/);assert.equal(h.adapter.view().confirmed,false);assert.equal(h.rows.get(goal).length,2);
  await panel.reviewDraft(draft(h.rows.get(goal),{organizationId:org,goalId:goal},['audience']));await panel.confirmDraft();const select=root.querySelector('#goal-select');select.value=otherGoal;select.dispatchEvent(new dom.window.Event('change'));await waitFor(()=>h.adapter.view().context?.goalId===otherGoal);assert.equal(h.adapter.view().confirmed,false);assert.equal(h.adapter.view().raw,null);
  await panel.reviewDraft(draft(original(),{organizationId:org,goalId:otherGoal}));await panel.confirmDraft();panel.close();assert.equal(h.adapter.view().snapshot,null);assert.equal(root.textContent,'');assert.equal(h.posts().length,1);
  h.context={organizationId:otherOrg,role:'viewer',sessionId:'synthetic-session-b'};await panel.open('viewer');assert.equal(h.adapter.view().confirmed,false);assert.equal(root.querySelector('form'),null);
 }finally{panel.close();globalThis.document=previous;dom.window.close();}
});
test('closing panel during post-save list refresh cannot repopulate its UI or restore old confirmation',async()=>{
 const h=await harness(),dom=new JSDOM('<div></div>'),previous=globalThis.document;globalThis.document=dom.window.document;
 const root=document.querySelector('div'),panel=createGoalPanel(h.api,root,{draftAdapter:h.adapter});
 try{
  h.context={organizationId:org,role:'owner',sessionId:'synthetic-session-a'};await panel.open('owner',h.context);await panel.reviewDraft(draft());await panel.confirmDraft();
  let release;h.controls.holdList=new Promise(r=>release=r);const pending=panel.saveDraftField('offering');await waitFor(()=>h.controls.listWaiting);panel.close();h.context=null;release();await assert.rejects(()=>pending,/STALE_OPERATION/);
  assert.equal(root.textContent,'');assert.equal(h.adapter.view().confirmed,false);assert.equal(h.adapter.view().snapshot,null);assert.equal(h.posts().length,1); // Already-dispatched mock commit cannot be undone.
 }finally{panel.close();globalThis.document=previous;dom.window.close();}
});
