import test from 'node:test';
import assert from 'node:assert/strict';
import {handoffSourceFixture} from './handoff-source-fixture.mjs';
import {createResultReview} from '../../apps/web/first-result-review.mjs';
import {validateReport} from '../../apps/web/first-result-payload.mjs';
import {assertSavedClaims} from '../../apps/web/saved-claim-context.mjs';
import {evaluateConsoleClaims} from '../../apps/web/console-claim-review.mjs';
const confirm=async report=>{const review=createResultReview(report);for(const k of ['title','meta_description','description'])review.check(k,true);await review.confirm();return review.export();};
for(const [title,url]of [['ISO-HANDOFF-001','https://example.invalid/iso'],['NATIVE-HANDOFF-001','https://example.invalid/native']]){
 test(title+' retains full producer citations and accepts the confirmed source-bound payload',async()=>{
  const report=handoffSourceFixture(title,url);
  assert.equal(report.snapshot.original_url,url);assert.equal(report.extraction.method,'explicit_product_microdata');
  const payload=await confirm(report),before=JSON.stringify(payload);await validateReport(payload);
  assert.equal((await assertSavedClaims(payload)).mapping_status,'PROVEN_EXTRACTIVE_CONTEXT');assert.equal(JSON.stringify(payload),before);
 });
}
test('legacy-shaped title-only citation is schema-valid but rejected before bridge save',async()=>{
 const report=handoffSourceFixture('ISO-HANDOFF-001','https://example.invalid/iso');
 // Reproduce the original fixture defect: a meta fact cites only the product
 // title, rather than the literal full meta quotation.
 report.facts.meta_description.citations=[...report.facts.product_name.citations];
 const payload=await confirm(report);await validateReport(payload);
 const fields=Object.fromEntries(Object.entries(report.preview.fields).map(([k,v])=>[k,v.suggested]));
 assert.deepEqual(evaluateConsoleClaims({report,fields}).problems,['引用未保留完整事實原文：/facts/meta_description']);
 await assert.rejects(assertSavedClaims(payload),/宣稱檢查/);
});
test('invented producer suggestions and contradictory saved edits remain refused',async()=>{
 const report=handoffSourceFixture('ISO-HANDOFF-001','https://example.invalid/iso');
 const unbound=structuredClone(report);unbound.preview.fields.description.suggested='候選 description';
 await assert.rejects(assertSavedClaims(await confirm(unbound)),/宣稱檢查/);
 const review=createResultReview(report);review.edit('description','Not made of steel.');for(const k of ['title','meta_description','description'])review.check(k,true);await review.confirm();
 await assert.rejects(assertSavedClaims(await review.export()),/宣稱檢查/);
});
