import test from 'node:test';
import assert from 'node:assert/strict';
import {preview, compare} from '../../apps/web/search-baseline.mjs';
const meta = {origin:'https://shop.example',type:'web',start:'2026-09-01',end:'2026-09-03',exported:'2026-09-07T09:00:00+08:00'};
const full='date,clicks,impressions\n2026-09-01,2,10\n2026-09-02,0,0\n2026-09-03,1,10';
test('missing dates stay unknown; explicit zeros count toward coverage',()=>{
 const partial=preview('date,clicks,impressions\n2026-09-01,2,10\n2026-09-03,0,0',meta);
 assert.deepEqual(partial.missing,['2026-09-02']); assert.equal(partial.complete,false); assert.equal(partial.ctr,.2);
 assert.equal(preview(full,meta).complete,true);
});
test('rejects invalid dates, duplicate days, missing counts, unsafe numbers and native table columns',()=>{
 for(const text of ['date,clicks,impressions\n2026-09-01,,10','date,clicks,impressions\n2026-09-01,2,10\n2026-09-01,2,10','date,clicks,impressions\n2026-09-01,9007199254740992,10','date,clicks,impressions,query\n2026-09-01,2,10,foo']) assert.throws(()=>preview(text,meta));
 assert.throws(()=>preview(full,{...meta,start:'2026-02-30'}));
 assert.throws(()=>preview(full,{...meta,origin:'https://shop.example/private'}));
 assert.throws(()=>preview(full,{...meta,exported:'2026-09-07T09:00:00'}));
});
test('comparison requires complete, equal, compatible and nonoverlapping periods',()=>{
 const a=preview(full,meta), b=preview(full.replaceAll('09-01','09-04').replaceAll('09-02','09-05').replaceAll('09-03','09-06'),{...meta,start:'2026-09-04',end:'2026-09-06'});
 assert.deepEqual(compare(a,b),{clickDifference:0,impressionDifference:0,interpretation:'observed_difference_not_causal_lift'});
 for(const bad of [{...b,complete:false},{...b,origin:'https://other.example'},{...b,type:'image'},{...b,days:4},{...b,start:'2026-09-03'}]) assert.throws(()=>compare(a,bad));
});

import {loadSnapshot,saveSnapshot} from '../../apps/web/baseline-snapshot.mjs';
test('saved baselines round trip through validation with missing days preserved',()=>{
 const a=preview('date,clicks,impressions\n2026-09-01,2,10',meta);
 const loaded=loadSnapshot(saveSnapshot(a,null,{a:true,b:false}));
 assert.deepEqual(loaded.a.result,a); assert.equal(loaded.b,null); assert.equal(loaded.a.sample,true);
});
test('reload refuses derived totals, invalid rows, unknown versions and oversized files',()=>{
 const text=saveSnapshot(preview(full,meta),null,{a:false});
 const derived=JSON.parse(text); derived.a.clicks=999;
 assert.throws(()=>loadSnapshot(JSON.stringify(derived)),/欄位/);
 const bad=JSON.parse(text); bad.a.rows[0].clicks=-1; assert.throws(()=>loadSnapshot(JSON.stringify(bad)),/無效/);
 const version=JSON.parse(text); version.version=2; assert.throws(()=>loadSnapshot(JSON.stringify(version)),/版本/);
 assert.throws(()=>loadSnapshot('x'.repeat(1000001)),/1 MB/);
 const changed=JSON.parse(text); changed.a.rows[0].clicks=3;
 assert.equal(loadSnapshot(JSON.stringify(changed)).a.result.clicks,4); // Recompute; file contents are not authenticated.
});
