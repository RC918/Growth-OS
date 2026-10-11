import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createW1ReviewNavigation} from '../../apps/web/w1-review-navigation.mjs';
test('W1 navigation follows pending/read-only states without executing controls or changing authority',()=>{
 const dom=new JSDOM('<section><p id="draft"></p><button id="refresh">refresh</button><button id="reconcile">reconcile</button><details><summary id="evidence-summary">source</summary></details><button class="publish-preview-read">read</button><div class="publish-preview-body"><details><summary>binding</summary></details><section data-publish-field="description"><h5>description</h5></section></div></section>');
 const doc=dom.window.document,state={current:{draft_id:'draft',review_valid:true},session:{role:'owner'},preview:{ready:false}};let effects=0;
 doc.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>effects++));
 const nav=createW1ReviewNavigation({getState:()=>state,document:doc}),button=doc.getElementById('w1-guidance-next'),reason=doc.getElementById('w1-guidance-reason');
 const go=selector=>{nav.refresh();assert.equal(button.hidden,false);button.click();assert.equal(doc.activeElement,doc.querySelector(selector));assert.equal(effects,0);};
 go('.publish-preview-read');state.preview.ready=true;go('[data-publish-field="description"] h5');
 state.current.source_changed=true;go('.publish-preview-body summary');assert.match(reason.textContent,/舊確認不適用/);
 state.pending={kind:'review'};go('#reconcile');state.busy=true;nav.refresh();assert.equal(button.hidden,true);
 state.busy=false;doc.getElementById('reconcile').disabled=true;nav.refresh();assert.equal(button.hidden,true);state.pending=null;
 state.readFailed=true;go('#refresh');state.readFailed=false;state.preview={failed:true};go('#refresh');
 state.current={draft_id:null};go('#refresh');assert.match(reason.textContent,/不是已保存版本/);
 state.current={draft_id:'draft',review_valid:false};state.preview={};state.session.role='viewer';go('#evidence-summary');
 const before=doc.activeElement;nav.refresh();assert.equal(doc.activeElement,before);
 state.session=null;nav.refresh();assert.equal(doc.getElementById('w1-guidance').hidden,true);
 dom.window.close();
});
test('shipped W1 manifest includes navigation and keeps frozen RC/R7 bytes and closed configuration',async()=>{
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 const manifest=JSON.parse(await readFile('delivery/w1-private/SHA256.json','utf8'));
 assert.deepEqual((await readdir('delivery/w1-private/dist')).sort(),Object.keys(manifest).sort());
 for(const [file,hash] of Object.entries(manifest)){assert.doesNotMatch(file,/fixture|\.test\.|\.e2e\./);assert.equal(sha(await readFile('delivery/w1-private/dist/'+file)),hash);}
 assert.equal(manifest['w1-review-navigation.mjs'],sha(await readFile('apps/web/w1-review-navigation.mjs')));
 for(const [path,hash] of Object.entries(JSON.parse(await readFile('prototype/internal-rc/deploy/hashes.json','utf8'))))assert.equal(sha(await readFile(path)),hash,path);
 for(const [file,hash] of Object.entries(JSON.parse(await readFile('delivery/r7-private/SHA256.json','utf8')).files))assert.equal(sha(await readFile('delivery/r7-private/'+file)),hash,file);
 assert.match(await readFile('delivery/w1-private/dist/w1-workspace-config.mjs','utf8'),/writerEnabled:false/);
});
