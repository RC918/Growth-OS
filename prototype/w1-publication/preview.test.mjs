import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixture,id,fragment} from './fixture.mjs';
test('confirmed W1 v2 binds fact/draft/exact Review, source quote and previous draft; publication stays blocked',async()=>{
 const f=await createFixture().open(),before=JSON.stringify(f.data),p=await f.run();
 assert.equal(p.binding.version_id,id(52));assert.equal(p.binding.fact_id,id(42));assert.equal(p.binding.review_id,id(62));assert.equal(p.binding.version_number,2);
 assert.equal(p.fields.description.after,f.data.row.body);assert.equal(p.fields.description.before,f.data.row.fact_source_quote);assert.equal(p.previous.body,f.data.history[0].body);assert.equal(p.previous.changed,true);
 assert.equal(p.review_status,'exact_version_confirmed');assert.equal(p.fetched_at,null);assert.equal(p.published,false);assert.equal(p.can_publish,false);
 for(const code of ['SYNTHETIC_ONLY','TARGET_UNVERIFIED','PLATFORM_UNSELECTED','SITE_UNAUTHORIZED','PUBLICATION_CONFIRMATION_REQUIRED','LIVE_BASELINE_UNKNOWN','PUBLISH_TIME_UNKNOWN'])assert.ok(p.blockers.some(b=>b.code===code));
 assert.equal(JSON.stringify(f.data),before);assert.ok(f.calls.every(c=>c.method==='GET'));assert.ok(Object.isFrozen(p.fields.description));
 for(const c of f.calls.filter(c=>['/rest/v1/w1_state','/rest/v1/w1_drafts','/rest/v1/w1_reviews'].includes(c.path)))assert.equal(new URLSearchParams(c.query).get('organization_id'),'eq.'+id(1));
});
test('unconfirmed, source changed and conflict display specific blockers, never inherit old approval',async()=>{
 for(const [mode,code] of [['unconfirmed','REVIEW_REQUIRED'],['source-changed','SOURCE_CHANGED'],['conflict','FACT_CONFLICT']]){const f=await createFixture(mode).open(),p=await f.run();assert.equal(p.review_status,'review_required');assert.equal(p.binding.review_id,null);assert.equal(p.can_publish,false);assert.ok(p.blockers.some(b=>b.code===code));}
});
test('wrong org/product/market/channel/history dependency/old Review and read failure fail closed',async()=>{
 for(const change of [f=>f.data.row.organization_id=id(90),f=>f.data.row.id=id(90),f=>f.data.row.fact_market='OTHER',f=>f.data.row.fact_channel='other',f=>f.data.history[1].fact_id=id(90),f=>f.data.history[1].source_version=9,f=>f.data.history[0].product_id=id(90),f=>f.data.review.id=id(61),f=>f.data.review.draft_id=id(51),f=>f.data.review.organization_id=id(90),f=>f.data.fail=true]){const f=await createFixture().open();change(f);await assert.rejects(f.run());assert.ok(f.calls.every(c=>c.method==='GET'));}
});
test('viewer/revoked membership and a historical captured version cannot prepare a preview',async()=>{
 const viewer=createFixture();viewer.data.members[0].role='viewer';await viewer.open();const n=viewer.calls.length;await assert.rejects(viewer.run());assert.equal(viewer.calls.length,n);
 const f=await createFixture().open(),version=structuredClone(f.data.row);version.draft_id=id(51);await assert.rejects(f.api.previewUrlPublication(version,{isCurrent:()=>true}));f.data.members[0].role='viewer';await assert.rejects(f.run());
});
test('answer/source/review changes during GETs, cancellation, logout and replacement session reject stale output',async()=>{
 for(const mode of ['answer','source','review','cancel','logout','replace']){
  const f=await createFixture().open();let current=true,changed=false;
  f.data.onRead=async u=>{if(changed||!u.pathname.endsWith('/w1_drafts'))return;changed=true;if(mode==='answer')f.data.row.answer='yes';if(mode==='source')f.data.row.source_version=2;if(mode==='review')f.data.row.review_id=id(90);if(mode==='cancel')current=false;if(['logout','replace'].includes(mode)){f.api.clear();if(mode==='replace')await f.api.authenticate(fragment);}};
  await assert.rejects(f.run({isCurrent:()=>current}));assert.ok(changed);assert.ok(f.calls.every(c=>c.method==='GET'));
 }
});
