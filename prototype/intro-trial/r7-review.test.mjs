import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {digest} from '../../apps/web/intro-candidate.mjs';
import {R7,validateR7,createR7Review} from '../../apps/web/intro-r7-review.mjs';
const frame=JSON.parse(await readFile(new URL('../../apps/web/intro-r7.json',import.meta.url),'utf8'));
test('actual R7 log artifact retains approved bytes, live receipt and source binding',async()=>{
 const item=await validateR7(frame);assert.equal(await digest(frame.payload),R7.frame);assert.equal(item.candidateHash,await digest(frame.payload.candidate));
 assert.equal(item.candidate.receipt.mode,'live');assert.equal(item.candidate.receipt.request_id,'req_d9279209436948a787e1dd39633064bd');assert.equal(item.candidate.source.version,R7.version);
 assert.equal(item.candidate.output.candidate,'輸入您的網站與品牌名稱。我們會檢查您的品牌識別，向 AI 引擎提出三個真實買家問題，並顯示應先修正的項目。');
});
test('changed source/content/run/citation cannot reuse approval even with recomputed frame hash',async()=>{
 for(const mutate of [f=>f.payload.candidate.source.url='https://example.com/wrong',f=>f.payload.candidate.output.candidate+='改動',f=>f.payload.run_id='37956562518',f=>f.payload.candidate.output.citations[0].quote='UNSUPPORTED']){
  const bad=structuredClone(frame);mutate(bad);bad.sha256=await digest(bad.payload);await assert.rejects(validateR7(bad),/R7_EVIDENCE_MISMATCH/);
 }
});
test('confirmation binds exact candidate hash and is only an in-memory page receipt',async()=>{
 const s=createR7Review();assert.throws(()=>s.confirm());await s.load(frame);assert.throws(()=>s.confirm());s.check(true);const r=s.confirm().receipt;
 assert.equal(r.candidate_hash,await digest(frame.payload.candidate));assert.equal(r.source_version,R7.version);assert.equal(r.run_id,R7.run);assert.equal(r.scope,'page_only');assert.equal(r.persisted,false);assert.equal(r.published,false);assert.equal(r.measured,false);
 const copy=s.view();copy.item.candidate.output.candidate='MUTATED';assert.notEqual(s.view().item.candidate.output.candidate,'MUTATED');
});
test('source changes invalidate confirmation; returning to source requires fresh check',async()=>{
 const s=createR7Review();await s.load(frame);s.check(true);s.confirm();s.sourceChanged('https://example.com/other');assert.equal(s.view().receipt,null);assert.equal(s.view().canConfirm,false);s.check(true);assert.throws(()=>s.confirm());s.sourceChanged(R7.url);assert.equal(s.view().checked,false);assert.throws(()=>s.confirm());
});
test('changed/reloaded result drops old receipt; a new page never restores confirmation',async()=>{
 const s=createR7Review();await s.load(frame);s.check(true);s.confirm();await s.load(frame);assert.equal(s.view().receipt,null);assert.equal(s.view().checked,false);
 s.check(true);s.confirm();const bad=structuredClone(frame);bad.payload.candidate.source.version='0'.repeat(64);await assert.rejects(s.load(bad));assert.equal(s.view().item,null);assert.equal(s.view().receipt,null);
 const fresh=createR7Review();await fresh.load(frame);assert.equal(fresh.view().receipt,null);
});
test('late validation cannot restore a result after source invalidation',async()=>{
 const s=createR7Review(),pending=s.load(frame);s.sourceChanged('https://example.com/changed');await assert.rejects(pending,/STALE_R7/);assert.equal(s.view().item,null);
});
