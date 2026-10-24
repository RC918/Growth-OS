import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
import {deriveExperience,experienceFiles} from './derive.mjs';
const source=name=>readFile('apps/web/'+name,'utf8');
test('derived fields retain edits, checks and accessibility bindings while adding evidence and differences',async t=>{
 const original=await source('growth-console.mjs'),derived=deriveExperience('growth-console.mjs',original),differences=await readFile(new URL('differences.mjs',import.meta.url),'utf8');
 const fields=['title','meta_description','description'],report={preview:{fields:Object.fromEntries(fields.map(key=>[key,{original:'原文 '+key,reason:'來源理由',citations:['c1']}]))}},view={fields:Object.fromEntries(fields.map(key=>[key,'編輯 '+key]))};
 const observed=[];
 for(const [text,enhanced]of [[original,false],[derived,true]]){
  const dom=new JSDOM('<div id="result-fields"></div><pre id="claim-report"></pre>',{runScripts:'outside-only'}),w=dom.window; t.after(()=>w.close());w.events=[];
  const renderer=text.slice(text.indexOf('function fields('),text.indexOf('function claimDetails('));
  w.eval("const reviewFields=['title','meta_description','description'];const names={title:'頁面標題',meta_description:'搜尋摘要',description:'產品描述'};const $=id=>document.getElementById(id),make=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};let renderedClaims=null;const task={edit:(...args)=>window.events.push(['edit',...args]),check:(...args)=>window.events.push(['check',...args])};"+renderer+(enhanced?differences:'')+';window.draw=fields;'+(enhanced?'window.diff=updateFieldDifferences;':''));
  w.draw(report,view);if(enhanced)w.diff(view,report);
  const controls=[];for(const key of fields){const input=w.document.getElementById('field-'+key),check=w.document.getElementById('check-'+key);controls.push({id:input.id,value:input.value,maxLength:input.maxLength,describedby:input.getAttribute('aria-describedby'),label:w.document.querySelector('label[for="'+input.id+'"]').textContent});input.value='再次編輯 '+key;input.dispatchEvent(new w.Event('input'));check.checked=true;check.dispatchEvent(new w.Event('change'));}
  observed.push({controls,events:JSON.parse(JSON.stringify(w.events))});
  assert.equal(w.document.querySelectorAll('.field-evidence > summary').length,enhanced?3:0);assert.equal(w.document.querySelectorAll('[data-diff-field] ins').length,enhanced?3:0);
 }
 assert.deepEqual(observed[1],observed[0],'Derivation must preserve field behavior and bindings');
 const css=await source('growth-console.css'),out=deriveExperience('growth-console.css',css);
 assert.ok(out.startsWith(css+'\n'));assert.match(css,/@container result-card/);assert.match(css,/@container assistant-card/);assert.match(out,/@container next-step/);assert.match(out,/@container workspace-shell/);
});
test('presentation hooks reject drift and duplicate sources',async()=>{
 for(const name of experienceFiles){if(name.endsWith('.css'))continue;const text=await source(name);assert.throws(()=>deriveExperience(name,''));assert.throws(()=>deriveExperience(name,text+text));}
});
test('workspace retains all existing IDs exactly once, source capabilities and guarded actions',async()=>{
 const original=new JSDOM(await source('workspace.html')),derived=new JSDOM(deriveExperience('workspace.html',await source('workspace.html')));
 for(const el of original.window.document.querySelectorAll('[id]'))assert.equal(derived.window.document.querySelectorAll('[id="'+el.id+'"]').length,1,el.id);
 const doc=derived.window.document;assert.equal(doc.querySelector('#url-result-panel').closest('details'),null);assert.ok(doc.querySelector('#profile-form'));
 assert.equal(doc.querySelectorAll('#ux-guide-action').length,1);assert.equal(doc.querySelector('#workspace').hidden,true);
 assert.equal(doc.querySelector('meta[http-equiv="Content-Security-Policy"]').content,original.window.document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
});
test('guide follows role, actionable Save and unknown-result recovery without any dispatch',async()=>{
 const dom=new JSDOM(deriveExperience('workspace.html',await source('workspace.html')),{runScripts:'outside-only',url:'https://test.invalid/workspace.html'}),w=dom.window,doc=w.document;
 doc.querySelector('#url-result-panel').innerHTML='<button id="save-url-result" disabled>保存</button><button id="read" hidden>只查詢保存結果</button>';
 w.eval((await readFile(new URL('workspace-guide.mjs',import.meta.url),'utf8'))+';window.experience=mountWorkspaceExperience();');
 const label=()=>doc.querySelector('#ux-guide-state').textContent;
 assert.match(label(),/登入後/);w.experience.update({role:'owner',versions:[]});assert.match(label(),/尚無已保存/);
 doc.querySelector('#save-url-result').disabled=false;await new Promise(resolve=>w.setTimeout(resolve,0));assert.match(label(),/再確認保存/);
 const save=doc.querySelector('#save-url-result');save.scrollIntoView=()=>{};
 doc.querySelector('#ux-guide-action').click();assert.equal(doc.activeElement,save);assert.equal(save.hasAttribute('tabindex'),false);
 save.disabled=true;save.setAttribute('aria-busy','true');await new Promise(resolve=>w.setTimeout(resolve,0));assert.match(label(),/等待伺服器讀回/);
 save.setAttribute('aria-busy','false');w.experience.update({role:'owner',versions:[{}]});assert.match(label(),/已保存版本/);
 doc.querySelector('#read').hidden=false;await new Promise(resolve=>w.setTimeout(resolve,0));assert.match(label(),/不要再次保存/);
 w.experience.update({role:'viewer',versions:[{}]});assert.match(label(),/不能編輯或核准/);
 w.experience.update(null);assert.match(label(),/登入後/);dom.window.close();
});
test('character differences preserve Unicode and treat submitted markup as plain text',async()=>{
 const dom=new JSDOM('<div data-diff-field="description"></div>',{runScripts:'outside-only'}),w=dom.window,doc=w.document;
 w.eval("const reviewFields=['description'];const make=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};"+(await readFile(new URL('differences.mjs',import.meta.url),'utf8'))+';window.diff=updateFieldDifferences;');
 const before='茶🍵產品',after='茶🌿<img src=x onerror=alert(1)>產品';w.diff({fields:{description:after}},{preview:{fields:{description:{original:before}}}});
 assert.equal(doc.querySelector('del').textContent,'🍵');assert.equal(doc.querySelector('ins').textContent,'🌿<img src=x onerror=alert(1)>');assert.equal(doc.querySelector('img'),null);
 const text=doc.querySelector('.difference-text');assert.equal(text.textContent,'茶🍵🌿<img src=x onerror=alert(1)>產品');
 w.diff({fields:{description:before}},{preview:{fields:{description:{original:before}}}});assert.equal(doc.querySelector('del'),null);assert.match(doc.body.textContent,/與來源原文相同/);dom.window.close();
});
