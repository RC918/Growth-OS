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
 const version=JSON.parse(text); version.version=99; assert.throws(()=>loadSnapshot(JSON.stringify(version)),/版本/);
 assert.throws(()=>loadSnapshot('x'.repeat(1000001)),/1 MB/);
 const changed=JSON.parse(text); changed.a.rows[0].clicks=3;
 assert.equal(loadSnapshot(JSON.stringify(changed)).a.result.clicks,4); // Recompute; file contents are not authenticated.
});

import {growthReport} from '../../apps/web/baseline-report.mjs';
test('report separates observations, inference, unknowns and next steps without trusting totals',()=>{
 const a=preview(full,meta),b=preview(full.replaceAll('09-01','09-04').replaceAll('09-02','09-05').replaceAll('09-03','09-06'),{...meta,start:'2026-09-04',end:'2026-09-06'});
 const report=growthReport({...a,clicks:999},b,{a:true,b:true});
 assert.deepEqual(report.sections.map(x=>x[0]),['觀測','合理推論','未知','建議動作']);
 assert.match(report.markdown,/含合成範例/); assert.match(report.markdown,/觀察到點擊 3/);
 assert.doesNotMatch(report.markdown,/999/); assert.match(report.markdown,/點擊差額 0/); assert.match(report.markdown,/無法將差異歸因/);
});
test('single or incomplete periods report limitations and never manufacture a difference',()=>{
 const a=preview('date,clicks,impressions\n2026-09-01,0,0',meta);
 const single=growthReport(a,null,{a:false}); assert.match(single.markdown,/沒有後續比較期間/); assert.match(single.markdown,/無法計算/);
 const b=preview(full.replaceAll('09-01','09-04').replaceAll('09-02','09-05').replaceAll('09-03','09-06'),{...meta,start:'2026-09-04',end:'2026-09-06'});
 const partial=growthReport(a,b,{a:false,b:false}); assert.match(partial.markdown,/本次未產生期間差額/); assert.doesNotMatch(partial.markdown,/點擊差額/); assert.match(partial.markdown,/2026-09-02/);
});

import {validateActions} from '../../apps/web/baseline-actions.mjs';
const action={date:'2026-09-04',path:'/product-comparison',note:'更新商品比較內容'};
test('action records reject impossible dates, unsafe paths, duplicate records and oversized lists',()=>{
 assert.deepEqual(validateActions([{...action,note:' 更新商品比較內容 '}]),[action]);
 for(const invalid of [{...action,date:'2026-02-30'},...['https://other.example/p','//other.example','/../private','/%2e%2e/private','/%2fother','/page?key=secret','/page%0a'].map(path=>({...action,path})),{...action,note:''},{...action,extra:true}]) assert.throws(()=>validateActions([invalid]));
 assert.throws(()=>validateActions([action,action]),/已存在/);
 assert.throws(()=>validateActions(Array(21).fill(action)),/20/);
});
test('snapshot v2 preserves actions while legacy v1 loads without records',()=>{
 const current=saveSnapshot(preview(full,meta),null,{a:true},[action]);
 assert.deepEqual(loadSnapshot(current).actions,[action]);
 const legacy=JSON.parse(current); legacy.version=1; delete legacy.actions;
 assert.deepEqual(loadSnapshot(JSON.stringify(legacy)).actions,[]);
 const bad=JSON.parse(current); bad.actions[0].path='/../private'; assert.throws(()=>loadSnapshot(JSON.stringify(bad)));
});
test('reports classify self-declared actions without turning them into verified publication or causation',()=>{
 const a=preview(full,meta), b=preview(full.replaceAll('09-01','09-04').replaceAll('09-02','09-05').replaceAll('09-03','09-06'),{...meta,start:'2026-09-04',end:'2026-09-06'});
 const report=growthReport(a,b,{a:false,b:false},[action,{...action,date:'2026-09-01',note:'[link](https://example.com)'},{...action,date:'2026-09-10'}]);
 const observations=report.sections[0][1].join(' ');
 for(const interval of ['基線期間','後續期間','觀察期間之外']) assert.ok(observations.includes(interval));
 assert.match(observations,/提供者聲明的發布紀錄 3 筆/);
 assert.match(report.markdown,/尚未核對頁面/); assert.match(report.markdown,/無法將差異歸因/);
 assert.ok(report.markdown.includes('\\[link\\]\\(https://example.com\\)'));
});
test('summary prioritizes missing data before comparison and never labels sample differences as growth',()=>{
 const a=preview(full,meta), partial=preview('date,clicks,impressions\n2026-09-01,0,0',meta);
 const b=preview(full.replaceAll('09-01','09-04').replaceAll('09-02','09-05').replaceAll('09-03','09-06'),{...meta,start:'2026-09-04',end:'2026-09-06'});
 assert.equal(growthReport(partial,null,{a:false}).summary.label,'先補齊基線資料');
 assert.equal(growthReport(a,null,{a:false}).summary.label,'已有基線，尚不能比較');
 assert.equal(growthReport(a,preview('date,clicks,impressions\n2026-09-04,0,0',{...meta,start:'2026-09-04',end:'2026-09-06'}),{a:false}).summary.label,'先補齊後續資料');
 const mismatch=growthReport(a,{...b,origin:'https://other.example'},{a:false,b:false});
 assert.equal(mismatch.summary.label,'先修正比較條件'); assert.match(mismatch.summary.detail,/來源/);
 assert.equal(growthReport(a,a,{a:false,b:false}).summary.label,'先修正比較條件');
 const compatible=growthReport(a,b,{a:true,b:true});
 assert.equal(compatible.summary.label,'可比較觀察值，不能歸因');
 assert.match(compatible.summary.provenance,/不是真實成長證據/);
 assert.match(compatible.markdown,/## 先看這裡/); assert.match(compatible.markdown,/優先下一步/);
 const actual=growthReport(a,b,{a:false,b:false}); assert.match(actual.summary.provenance,/尚未向 Google 核實/);
 assert.doesNotMatch(actual.summary.label,/成功|有效|已成長/);
});
