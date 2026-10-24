// Selected UIUX from 7567444, adapted to A. No Auth, RPC or source-byte changes.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const asset=name=>readFileSync(new URL(name,import.meta.url),'utf8');
export const experienceFiles=new Set(['growth-console.mjs','growth-console.css','workspace.html','workspace.mjs','workspace.css','typed-draft.mjs']);
export function deriveExperience(name,source){
 let text=source;
 const replace=(from,to)=>{assert.equal(text.split(from).length,2,'Missing or ambiguous experience anchor: '+name);text=text.replace(from,to);};
 if(name==='growth-console.css'||name==='workspace.css'){
  assert.ok(!text.includes('/* Selected UIUX */'),'Experience already derived');
  text+='\n'+asset('experience.css');
 }
 if(name==='growth-console.mjs'){
  replace("article.append(compare,make('p','原建議理由：'+f.reason),make('p','來源依據：'+f.citations.join('、')),claims);",
   "const evidence=make('details');evidence.className='field-evidence';evidence.append(make('summary','查看本欄來源與檢查'),make('p','原建議理由：'+f.reason),make('p','來源依據：'+f.citations.join('、')),claims);const delta=make('div');delta.className='field-difference';delta.dataset.diffField=key;article.append(compare,delta,evidence);");
  replace(' if(v){\n  for(const key of reviewFields)',' if(v){\n  updateFieldDifferences(v,r);\n  for(const key of reviewFields)');
  replace('const reflow=()=>{const occupied=', 'const assistantLayout=createAssistantLayout();\nconst reflow=()=>{assistantLayout.refresh();const occupied=');
  replace("layoutObserver.observe($('task-card'));window.addEventListener", "layoutObserver.observe($('task-card'));for(const id of ['guide-heading','guide-owner','guide-reason','guide-action'])layoutObserver.observe($(id));window.addEventListener");
  text+='\n'+asset('differences.mjs');
  text+='\n'+asset('assistant-layout.mjs');
 }
 if(name==='workspace.html')replace('    <section id="workspace" hidden>',
  '<aside class="ux-guide panel" aria-labelledby="ux-guide-title"><h2 id="ux-guide-title">你的下一步</h2><p id="ux-guide-state" role="status" aria-live="polite">登入後，接續你的成果。</p><a id="ux-guide-action" href="#login-form">前往登入</a><p>本頁確認、工作區核准與發布授權是不同步驟。</p></aside>\n    <section id="workspace" hidden>');
 if(name==='workspace.mjs'){
  replace('let state = null;','const experience=mountWorkspaceExperience();\nlet state = null;');
  replace('  state = next;','  state = next;\n  experience.update(next);');
  replace('  state = null;','  state = null;\n  experience.update(null);');
  text+='\n'+asset('workspace-guide.mjs');
 }
 if(name==='typed-draft.mjs')replace("    add(panel, 'h5', label);",
  "    add(panel, 'h5', label);\n    const original=add(panel,'section','', 'ux-saved-original');original.dataset.field=key;add(original,'strong','來源原文');add(original,'p',typeof field?.original==='string'?field.original:'來源未提供');\n    add(panel,'p',field?.original===field?.suggested?'與來源原文相同':'目前版本與來源原文不同；請核對下方內容','ux-change-label');");
 return text;
}
