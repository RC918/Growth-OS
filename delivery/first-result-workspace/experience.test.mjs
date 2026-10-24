import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
import {deriveExperience,experienceFiles} from './derive.mjs';
import {createAssistantLayout} from './assistant-layout.mjs';
const source=name=>readFile('apps/web/'+name,'utf8');
test('assistant relaxes overflowing content, stays stable, and resets on actual viewport/font change',()=>{
 const classes=new Set(),rail={classList:{add:n=>classes.add(n),remove:n=>classes.delete(n)}},guide={scrollHeight:350,hidden:false},task={scrollHeight:120};
 const doc={documentElement:{},querySelector:()=>rail,getElementById:id=>id==='guidance'?guide:task};
 let rem=16;const view={innerWidth:1280,innerHeight:900,getComputedStyle:n=>n===doc.documentElement?{fontSize:String(rem)}:{paddingTop:'16',paddingBottom:'16',rowGap:'16'}};
 const layout=createAssistantLayout({document:doc,view});layout.refresh();assert.equal(classes.size,0);
 guide.scrollHeight=1000;layout.refresh();assert.equal(classes.has('assistant-natural'),true);
 guide.scrollHeight=100;layout.refresh();assert.equal(classes.has('assistant-natural'),true);
 view.innerHeight=1000;layout.refresh();assert.equal(classes.size,0);
 guide.scrollHeight=800;rem=32;layout.refresh();assert.equal(classes.has('assistant-natural'),true);
 view.innerWidth=390;layout.refresh();assert.equal(classes.size,0);
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
