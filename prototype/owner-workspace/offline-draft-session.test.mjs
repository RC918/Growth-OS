import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createOfflineDraftSession,createMemoryDraftStore} from '../../apps/web/offline-draft-session.mjs';
test('browser contract mirror differs only in the relative intake import',async()=>{
 const source=await readFile(new URL('./goal-inference-core.mjs',import.meta.url),'utf8');
 const browser=await readFile(new URL('../../apps/web/goal-inference-core.mjs',import.meta.url),'utf8');
 assert.equal(browser,source.replace('../../apps/web/goal-intake.mjs','./goal-intake.mjs'));
});
test('fixed synthetic sources are required and cannot save before confirmation',async()=>{
 const s=createOfflineDraftSession('parts');assert.match(s.view().history[0].answer_text,/合成測試/);assert.equal(s.view().confirmed,false);
 await assert.rejects(()=>s.simulateSave(),/CONFIRMATION/);assert.equal(s.view().history.length,1);
 assert.throws(()=>createOfflineDraftSession('unknown'),/FIXTURE/);
});
test('editing after confirmation invalidates it and changes its source-bound identity',async()=>{
 const s=createOfflineDraftSession('parts');await s.confirm();const old=s.view().proposalId;
 s.edit('offering','使用者修正的合成零件');assert.equal(s.view().confirmed,false);await assert.rejects(()=>s.simulateSave(),/CONFIRMATION/);
 assert.equal(s.view().fields[0].edited,true);assert.match(s.view().fields[0].quote,/合成零件/);
 await s.confirm();assert.notEqual(s.view().proposalId,old);await s.simulateSave();assert.equal(s.view().history[1].answer_text,'使用者修正的合成零件');
});
test('cancel clears confirmation, preserves memory history and requires fresh confirmation after reopen',async()=>{
 const s=createOfflineDraftSession('shop');await s.confirm();await s.simulateSave();const prior=s.view().history;
 s.edit('audience','未保存的合成修正');
 await s.confirm();s.cancel();await assert.rejects(()=>s.simulateSave(),/CONFIRMATION/);await assert.rejects(()=>s.confirm(),/CONFIRMABLE/);
 assert.deepEqual(s.view().history,prior);s.reopen();assert.equal(s.view().fields[0].value,'台灣買家');assert.equal(s.view().fields[0].edited,false);assert.equal(s.view().confirmed,false);await assert.rejects(()=>s.simulateSave(),/CONFIRMATION/);
 await s.confirm();await s.simulateSave();assert.equal(s.view().phase,'complete');assert.deepEqual(s.view().history.slice(0,2),prior);
});
test('cancel before any save discards all unsaved edits and modified source labels',async()=>{
 const s=createOfflineDraftSession('parts'),original=s.view().fields;s.edit('offering','捨棄的產品');s.edit('audience','捨棄的受眾');await s.confirm();s.cancel();s.reopen();
 assert.deepEqual(s.view().fields,original);assert.equal(s.view().confirmed,false);assert.equal(s.view().history.length,1);
});
test('viewer/editor and cross-goal contexts cannot edit, confirm or append even outside the UI',async()=>{
 for(const mode of ['viewer','editor','goal']){
  const base=createMemoryDraftStore('parts');let appends=0;
  const store={read(){const value=base.read();if(mode==='goal'){value.goalId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';value.turns.forEach(t=>t.goal_id=value.goalId);}else value.role=mode;return value;},append(){appends++;}};
  const s=createOfflineDraftSession('parts',{store}),error=mode==='goal'?/SCOPE_MISMATCH/:/OWNER_REQUIRED/;
  assert.equal(s.view().canEdit,false);assert.throws(()=>s.edit('offering','拒絕'),error);await assert.rejects(()=>s.confirm(),error);await assert.rejects(()=>s.simulateSave(),/CONFIRMATION/);assert.equal(appends,0);
 }
});
test('role or goal change after confirmation denies save, clears receipt and disables subsequent edits',async()=>{
 for(const mode of ['viewer','editor','goal']){
  const base=createMemoryDraftStore('parts');let changed=false,appends=0;
  const s=createOfflineDraftSession('parts',{store:{read(){const value=base.read();if(changed){if(mode==='goal'){value.goalId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';value.turns.forEach(t=>t.goal_id=value.goalId);}else value.role=mode;}return value;},append(){appends++;}}});
  await s.confirm();changed=true;await assert.rejects(()=>s.simulateSave(),mode==='goal'?/SCOPE_MISMATCH/:/OWNER_REQUIRED/);
  assert.equal(s.view().confirmed,false);assert.equal(s.view().canEdit,false);assert.equal(appends,0);assert.equal(base.read().turns.length,1);
 }
});
test('each simulated append reads back an immutable version and invalidates next-field confirmation',async()=>{
 for(const fixture of ['parts','shop']){
  const s=createOfflineDraftSession(fixture),first=s.view().history[0];await s.confirm();await s.simulateSave();
  assert.equal(s.view().confirmed,false);assert.equal(s.view().version,2);assert.equal(s.view().fields[0].key,'audience');
  await assert.rejects(()=>s.simulateSave(),/CONFIRMATION/);await s.confirm();await s.simulateSave();
  assert.equal(s.view().version,3);assert.deepEqual(s.view().history[0],first);assert.equal(s.view().missing.length,4);
  assert.equal(s.view().history.some(t=>t.question_key==='confirm'),false);await assert.rejects(()=>s.confirm(),/CONFIRMABLE/);
 }
});
test('version conflict denies stale save and clears confirmation without a second append',async()=>{
 const store=createMemoryDraftStore('parts'),s=createOfflineDraftSession('parts',{store});await s.confirm();
 store.append({goalId:store.read().goalId,expectedVersion:1,questionKey:'offering',answer:'別處的合成修正'});
 await assert.rejects(()=>s.simulateSave(),/VERSION_DRIFT/);assert.equal(store.read().turns.length,2);assert.equal(s.view().confirmed,false);
});
test('same-version source rewrite and simulated store failure never retain a usable confirmation',async()=>{
 const original=createMemoryDraftStore('parts');let rewrite=false;
 const s=createOfflineDraftSession('parts',{store:{read:()=>{const value=original.read();if(rewrite)value.turns[0].answer_text='來源已重寫';return value;},append:()=>{throw Error('STORE_FAILURE');}}});
 await s.confirm();rewrite=true;await assert.rejects(()=>s.simulateSave(),/UNVERIFIABLE_SOURCE/);assert.equal(s.view().confirmed,false);assert.equal(original.read().turns.length,1);
 const failed=createOfflineDraftSession('parts',{store:{read:original.read,append:()=>{throw Error('STORE_FAILURE');}}});
 await failed.confirm();await assert.rejects(()=>failed.simulateSave(),/STORE_FAILURE/);assert.equal(failed.view().confirmed,false);assert.equal(original.read().turns.length,1);
});
test('edit or cancel during async hashing cannot restore an obsolete confirmation',async()=>{
 const s=createOfflineDraftSession('parts');const waiting=s.confirm();s.edit('audience','合成修正');await assert.rejects(()=>waiting,/DRAFT_CHANGED/);assert.equal(s.view().confirmed,false);
 const next=s.confirm();s.cancel();await assert.rejects(()=>next,/DRAFT_CHANGED/);assert.equal(s.view().phase,'cancelled');
});
test('empty/oversized values and mutated view copies cannot affect the memory store',async()=>{
 const s=createOfflineDraftSession('parts');const copy=s.view();copy.history[0].answer_text='污染';assert.match(s.view().history[0].answer_text,/合成測試/);
 for(const value of [' ','x'.repeat(2001)]){s.edit('offering',value);await assert.rejects(()=>s.confirm(),/INVALID_TEXT/);assert.equal(s.view().confirmed,false);assert.equal(s.view().history.length,1);}
});
