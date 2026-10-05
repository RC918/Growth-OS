import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createResultReview,contentDigest,reviewFields} from '../../apps/web/first-result-review.mjs';
const source=()=>({snapshot:{id:'snapshot-a',version:'source-hash',original_url:'https://example.com/old',final_url:'https://example.com/product',content_fingerprint:'sha256:source-hash',citations:[{id:'s1',quote:'Synthetic source'}]},facts:{name:'Synthetic'},missing:['price'],preview:{source_snapshot_id:'snapshot-a',source_version:'source-hash',fields:Object.fromEntries(reviewFields.map(k=>[k,{original:'Source '+k,suggested:'Suggested '+k,citations:['s1']}]))}});
function checked(s){for(const k of reviewFields)s.check(k,true);}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('edits retain source facts, originals and citations; export digest is distinct from source hash',async()=>{
 const raw=source(),s=createResultReview(raw);raw.snapshot.version='tampered';s.edit('title','User text');checked(s);await s.confirm();const r=await s.export();
 assert.equal(r.preview.fields.title.suggested,'User text');assert.equal(r.preview.fields.title.original,'Source title');assert.deepEqual(r.preview.fields.title.citations,['s1']);assert.equal(r.preview.fields.title.citation_role,'reference_only_for_user_edit');
 assert.equal(r.snapshot.version,'source-hash');assert.deepEqual(r.facts,source().facts);assert.deepEqual(r.missing,['price']);assert.equal(r.review.original_suggestions.title,'Suggested title');
 const {binding,revision,fields}=s.view();assert.equal(r.review.content_digest,await contentDigest(JSON.stringify({schema_version:1,...binding,revision,fields})));
 assert.equal(r.review.confirmation.content_digest,r.review.content_digest);assert.deepEqual(r.review.confirmation.fact_checks,r.review.fact_checks);assert.equal(r.review.persisted,false);assert.equal(r.preview.published,false);
 r.review.confirmation.revision=99;assert.notEqual(s.view().receipt.revision,99);
});
test('only current text is checked; edits/check changes/cancel revoke confirmation without changing source',async()=>{
 const s=createResultReview(source());await assert.rejects(s.confirm(),/FACT_CHECK/);checked(s);await s.confirm();const first=s.view().receipt;
 s.edit('description','New text');assert.equal(s.view().receipt,null);assert.equal(s.view().fact_checks.description,false);await assert.rejects(s.confirm(),/FACT_CHECK/);
 s.check('description',true);await s.confirm();assert.notEqual(s.view().receipt.content_digest,first.content_digest);
 s.check('title',false);assert.equal(s.view().receipt,null);s.cancel();assert.equal(s.view().fields.description,'Suggested description');assert.equal(s.view().receipt,null);assert.ok(Object.values(s.view().fact_checks).every(v=>!v));
 checked(s);s.edit('title',' ');checked(s);await assert.rejects(s.confirm(),/INVALID_REVIEW_TEXT/);s.edit('title','x'.repeat(2001));checked(s);await assert.rejects(s.confirm(),/INVALID_REVIEW_TEXT/);
});
test('duplicate confirmation shares one digest; edit/cancel/context invalidation cannot resurrect it',async()=>{
 for(const change of [s=>s.edit('title','New'),s=>s.cancel(),s=>s.invalidate(),s=>s.check('title',false)]){
  const d=deferred();let calls=0;const s=createResultReview(source(),{digest:()=>{calls++;return d.promise;}});checked(s);const a=s.confirm(),b=s.confirm();assert.equal(a,b);await Promise.resolve();assert.equal(calls,1);change(s);d.resolve('old-digest');await assert.rejects(a,/STALE/);assert.equal(s.view().receipt,null);
 }
});
test('older digest cannot overwrite newer confirmation in either completion order',async()=>{
 for(const oldFirst of [true,false]){
  const old=deferred(),next=deferred();let calls=0;const s=createResultReview(source(),{digest:()=>++calls===1?old.promise:next.promise});checked(s);const a=s.confirm();const rejected=assert.rejects(a,/STALE/);await Promise.resolve();s.edit('title','New');checked(s);const b=s.confirm();await Promise.resolve();
  if(oldFirst){old.resolve('old');await rejected;}next.resolve('new');await b;if(!oldFirst){old.resolve('old');await rejected;}assert.equal(s.view().receipt.content_digest,'new');
 }
});
test('export refuses async drift; fresh sources never inherit local confirmation',async()=>{
 const d=deferred(),s=createResultReview(source(),{digest:()=>d.promise});const pending=s.export();s.edit('title','Changed');d.resolve('obsolete');await assert.rejects(pending,/STALE/);
 const a=createResultReview(source());checked(a);await a.confirm();for(const key of ['id','version','final_url']){const raw=source();raw.snapshot[key]+='-new';raw.preview.source_snapshot_id=raw.snapshot.id;raw.preview.source_version=raw.snapshot.version;const b=createResultReview(raw);assert.equal(b.view().receipt,null);assert.notDeepEqual(a.view().binding,b.view().binding);}
 assert.throws(()=>createResultReview({...source(),preview:{...source().preview,source_version:'foreign'}}),/INVALID_REVIEW_SOURCE/);
});
test('failed digest does not create a confirmation; retry and readonly views remain safe',async()=>{
 let calls=0;const s=createResultReview(source(),{digest:async text=>{if(++calls===1)throw Error('digest unavailable');return contentDigest(text);}});checked(s);
 const v=s.view();v.fact_checks.title=false;v.fields.title='Injected';await assert.rejects(s.confirm(),/unavailable/);assert.equal(s.view().receipt,null);assert.equal(s.view().pending,false);
 await s.confirm();assert.equal(s.view().receipt.scope,'page_only');assert.equal(s.view().fields.title,'Suggested title');
 const first=s.view().receipt;await s.confirm();assert.equal(calls,2);assert.deepEqual(s.view().receipt,first);
});
