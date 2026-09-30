// DOM behavior only. Not a layout/browser or real database acceptance test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createGoalPanel} from '../../apps/web/workspace-goals.mjs';
const waitFor=async(condition)=>{for(let i=0;i<100;i++){if(condition())return;await new Promise(done=>setTimeout(done,5));}throw Error('Timed out');};
test('guided panel saves, resumes, revises immutably, retries uncertain commit and clears a stale session',async()=>{
 const dom=new JSDOM('<div id="goal-panel"></div>');const previous=globalThis.document;globalThis.document=dom.window.document;
 const root=document.getElementById('goal-panel'),rows=new Map(),requests=new Map(),calls=[];let fail=true,hold=null;
 const api={listGoals:async()=>[...rows.keys()].map(id=>({id,created_at:'2026-09-30'})),readGoal:async id=>structuredClone(rows.get(id)),saveGoalTurn:async body=>{
  calls.push({...body});if(!requests.has(body.requestId)){const turns=rows.get(body.goalId)||[];assert.equal(body.expectedVersion,turns.length);turns.push({version_number:turns.length+1,question_key:body.questionKey,question_text:'引導問題',answer_text:body.answer});rows.set(body.goalId,turns);requests.set(body.requestId,body);}
  if(fail){fail=false;throw Error('HTTP 503');}if(hold){const pending=hold;hold=null;await pending;}
  return {goal_id:body.goalId};
 }};
 const panel=createGoalPanel(api,root);const submit=async(answer)=>{const form=root.querySelector('form');if(form.querySelector('textarea'))form.querySelector('textarea').value=answer;form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>!root.querySelector('button')?.disabled);};
 try{
  await panel.open('owner');await submit('更多流量');assert.match(root.textContent,/HTTP 503/);await submit('更多流量');assert.equal(calls[0].requestId,calls[1].requestId);assert.equal(rows.size,1);
  for(const answer of ['零件','採購人員','歐洲','自然搜尋','尚無連結','四週點擊'])await submit(answer);
  await submit();assert.match(root.textContent,/資料已確認/);
  panel.close();assert.equal(root.textContent,'');await panel.open('owner');assert.match(root.textContent,/尚無連結/);
  const edit=[...root.querySelectorAll('button')].find(button=>button.textContent==='修正目標受眾');edit.click();await submit('英國採購人員');assert.doesNotMatch(root.textContent,/資料已確認/);assert.equal([...rows.values()][0][2].answer_text,'採購人員');await submit();
  let release;hold=new Promise(resolve=>release=resolve);[...root.querySelectorAll('button')].find(button=>button.textContent==='修正推廣內容').click();
  const form=root.querySelector('form');form.querySelector('textarea').value='新產品';form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(done=>setTimeout(done,10));panel.close();
  api.listGoals=async()=>[];await panel.open('viewer');release();await new Promise(done=>setTimeout(done,10));assert.match(root.textContent,/檢視權限/);assert.doesNotMatch(root.textContent,/英國採購人員/);assert.equal(root.querySelector('form'),null);
 }finally{panel.close();globalThis.document=previous;dom.window.close();}
});
