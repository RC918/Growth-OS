import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deriveWorkspace} from './workspace-integration.mjs';
import {focusHandoffResult} from '../../apps/web/handoff-focus.mjs';
test('confirmed handoff offers a keyboard destination after login without stealing an active edit',()=>{
 let focused=0;const body={},root={isConnected:true,hidden:false},title={isConnected:true,focus(){focused++;}},document={body,activeElement:body};
 assert.equal(focusHandoffResult({document,root,title}),true);assert.equal(title.tabIndex,-1);
 document.activeElement={closest:()=>null};assert.equal(focusHandoffResult({document,root,title}),false);
 document.activeElement={closest:s=>s==='#sign-in'?{}:null};assert.equal(focusHandoffResult({document,root,title}),true);
 root.hidden=true;assert.equal(focusHandoffResult({document,root,title}),false);root.hidden=false;root.isConnected=false;
 assert.equal(focusHandoffResult({document,root,title}),false);assert.equal(focused,2);
});
test('workspace UI derives once, preserves save dispatch and rejects missing/duplicate anchors',async()=>{
 for(const name of ['workspace.html','url-result-save.mjs']){
  const source=await readFile('apps/web/'+name,'utf8'),output=deriveWorkspace(name,source);
  assert.notEqual(output,source);assert.throws(()=>deriveWorkspace(name,''));assert.throws(()=>deriveWorkspace(name,source+source));assert.throws(()=>deriveWorkspace(name,output));
  if(name.endsWith('.mjs')){
   assert.match(output,/await api.saveUrlResult\(operation,/);assert.match(output,/await validateReport\(frozen\)/);
   assert.match(output,/focusHandoffResult\(\{document,root,title\}\)/);
  }else assert.match(output,/product-workspace.css/);
 }
});
