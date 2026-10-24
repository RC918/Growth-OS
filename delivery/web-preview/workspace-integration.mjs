// Build-time UI integration only. Frozen sources, Auth and RPC stay unchanged.
import assert from 'node:assert/strict';
export function deriveWorkspace(name,text){
 const replace=(from,to)=>{assert.equal(text.split(from).length,2,'Missing or ambiguous workspace UI hook: '+name);text=text.replace(from,to);};
 if(name==='workspace.html'){
  assert.ok(!text.includes('./product-workspace.css'),'Workspace UI already derived');
  replace('</head>','<link rel="stylesheet" href="./product-workspace.css">\n</head>');
 }
 if(name==='url-result-save.mjs'){
  replace("import {createTrialMarker}","import {focusHandoffResult} from './handoff-focus.mjs';\nimport {createTrialMarker}");
  replace("feedback.textContent=enabled?'請核對工作區、來源與完整成果，再確認保存。':'成果已保留供核對；保存尚未開放。';paint();return true;",
   "feedback.textContent=enabled?'成果已帶入；請核對工作區、來源與完整成果，再確認保存。':'成果已保留供核對；保存尚未開放。';paint();"+
   "focusHandoffResult({document,root,title});return true;");
 }
 return text;
}
