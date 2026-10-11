import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createConsoleTask} from '../../apps/web/growth-console-task.mjs';
const report=JSON.parse(await readFile('apps/web/growth-console-demo.json'));
const url=report.snapshot.original_url;
test('real request events, exact page-only confirmation, drift and revisit do not acquire authority',async()=>{
 const events=[],task=createConsoleTask({load:async()=>report,changed:s=>events.push(s.phase)});
 task.setURL(url);const p=task.start();assert.equal(task.view().phase,'running');await p;
 assert.equal(task.view().phase,'review');for(const k of ['title','meta_description','description'])task.check(k,true);
 await task.confirm();const receipt=task.view().review.receipt;assert.equal(receipt.scope,'page_only');
 task.revisit();assert.deepEqual(task.view().review.receipt,receipt);assert.equal(task.view().returned,true);
 task.edit('description','User changed description');assert.equal(task.view().review.receipt,null);assert.equal(task.view().review.fact_checks.description,false);
 task.setURL('https://example.com/other');await task.confirm();assert.equal(task.view().review.receipt,null);assert.equal(task.view().sourceCurrent,false);
 assert.ok(events.includes('confirming'));assert.ok(events.includes('complete'));
});
test('one request, cancellation and late reply cannot replace current state; disconnect remains unknown',async()=>{
 let release,calls=0;const task=createConsoleTask({load:()=>{calls++;return new Promise(r=>release=r);}});
 task.setURL(url);const p=task.start();await task.start();assert.equal(calls,1);task.cancel();assert.equal(task.view().phase,'unknown');
 release(report);await p;assert.equal(task.view().report,null);assert.equal(task.view().phase,'unknown');
 const q=task.start();task.disconnect();release(report);await q;assert.equal(task.view().phase,'unknown');assert.equal(task.view().report,null);
});
test('mismatched or forged source never adopted, failed reread preserves edits',async()=>{
 let value=report;const task=createConsoleTask({load:async()=>value});task.setURL(url);await task.start();task.edit('title','Preserved edit');
 value=structuredClone(report);value.snapshot.version='0'.repeat(64);await task.start();assert.equal(task.view().phase,'failed');assert.equal(task.view().review.fields.title,'Preserved edit');
 value=report;task.setURL('https://example.com/other');await task.start();assert.equal(task.view().error,'invalid_report');assert.equal(task.view().review.fields.title,'Preserved edit');
});
test('six synthetic states are explicit; reset and new instance do not pretend persistent recovery',async()=>{
 let calls=0;const task=createConsoleTask({load:()=>{calls++;}});
 for(const kind of ['start','running','review','failed','complete','return']){await task.scenario(kind,report);assert.equal(task.view().synthetic,true);await task.start();assert.equal(calls,0);}
 assert.equal(task.view().returned,true);task.reset();assert.equal(task.view().report,null);assert.equal(task.view().synthetic,false);
 assert.equal(createConsoleTask({load:()=>{}}).view().report,null);
});
test('Sites package exact hashes; no W1/R7 config or frozen changes required',async()=>{
 const manifest=JSON.parse(await readFile('delivery/growth-console/SHA256.json'));
 for(const [f,h] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await readFile('delivery/growth-console/dist/'+f)).digest('hex'),h);
 assert.equal(manifest.api_included,false);assert.equal(manifest.route,'/growth-console');
});
test('safe robots reasons preserve input and edits, unknown never becomes denial or success',async()=>{
 const {sourceFailureCode,failureText}=await import('../../apps/web/growth-console-task.mjs');
 for(const reason of ['timeout','dns_failed','tls_failed','http_denied','http_status','unknown','SECRET']){
  let fail=false,calls=0;
  const code=sourceFailureCode({code:'robots_unavailable',diagnostic:{stage:'robots',reason},detail:'SECRET'});
  const task=createConsoleTask({load:async()=>{calls++;if(fail)throw Error(code);return report;}});
  task.setURL(url);await task.start();task.edit('title','Keep edit');fail=true;await task.start();
  assert.equal(task.view().phase,'failed');assert.equal(task.view().url,url);assert.equal(task.view().review.fields.title,'Keep edit');
  assert.equal(task.view().sourceCurrent,false);assert.equal(calls,2);assert.ok(!failureText[code].includes('SECRET'));
  if(reason==='SECRET'||reason==='unknown')assert.equal(code,'robots_unknown');
 }
 assert.equal(sourceFailureCode({code:'robots_unavailable',diagnostic:{stage:'robots',reason:'timeout',http_status:403}}),'robots_http_denied');
 assert.equal(sourceFailureCode({code:'robots_unavailable'}),'robots_unknown');
 assert.equal(sourceFailureCode({code:'robots_unavailable',diagnostic:{stage:'robots',reason:'peer_mismatch'}}),'robots_safety');
});
