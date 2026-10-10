import {digest,validateArtifact} from './intro-candidate.mjs';

// Read-only copy of the completed R7 public log, never a new generation request.
export const R7=Object.freeze({run:'37967220375',frame:'d14cf60a8c34cd648d95e8ed3f34bd3254e8a8def098cfebca9c67fcd60258cd',result:'fb92927b097885479f2e1c711f17de287753a6f90a33cd55a284e6a17b1b72ff',workflow:'0d6a4d231f823ba8602cecdac8018153324eaa43',source:'a20776cdfdb399a5e0b9c4d5a48021155f7b657d',url:'https://growthos.genman.work/ai-citation-check',version:'7061a900b6aad2703ff9f7ce46a44cfa95f6be3ed0370bd686f1d32f32a6713d',generated:'2026-10-09T17:35:33Z',reviewer:'01a121bc-499a-74d4-a4c2-c72fb192201f'});
const fail=()=>{throw Error('R7_EVIDENCE_MISMATCH');};
export async function validateR7(frame){
 if(!frame||Object.keys(frame).sort().join('|')!=='payload|sha256'||frame.sha256!==R7.frame||await digest(frame.payload)!==R7.frame)fail();
 const p=frame.payload,s=p.candidate?.source;
 if(p.trial!=='INTRO-GHA-01-R7'||p.run_id!==R7.run||p.workflow_sha!==R7.workflow||p.source_sha!==R7.source||p.result_sha256!==R7.result||s?.url!==R7.url||s.version!==R7.version)fail();
 await validateArtifact(p.candidate,s);
 return {candidate:structuredClone(p.candidate),candidateHash:await digest(p.candidate)};
}
// Confirmation exists in this page's memory only. A source/load change invalidates it.
export function createR7Review(){
 let epoch=0,item=null,checked=false,receipt=null,sourceMatches=true;
 const invalidate=()=>{epoch++;checked=false;receipt=null;};
 return {
  async load(frame){invalidate();item=null;const ticket=epoch;const next=await validateR7(frame);if(ticket!==epoch)throw Error('STALE_R7');item=next;return this.view();},
  sourceChanged(url){invalidate();sourceMatches=url===''||url===R7.url;return this.view();},
  check(value){invalidate();checked=value===true&&!!item&&sourceMatches;return this.view();},
  confirm(){if(!item||!sourceMatches||!checked)throw Error('R7_CONFIRMATION_REQUIRED');receipt={scope:'page_only',persisted:false,published:false,measured:false,run_id:R7.run,source_url:R7.url,source_version:R7.version,candidate_hash:item.candidateHash};return this.view();},
  view(){return structuredClone({item,checked,receipt,sourceMatches,canConfirm:!!item&&sourceMatches&&checked&&!receipt});},
 };
}

export async function mountR7Review(root,sourceInput){
 const $=id=>root.querySelector('#'+id),el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;},state=createR7Review();
 const status=$('r7-status'),check=$('r7-check'),confirm=$('r7-confirm'),copy=$('r7-copy'),fallback=$('r7-copy-fallback');
 let copying=false;
 function paint(){
  const v=state.view();check.disabled=!v.item||!v.sourceMatches;check.checked=v.checked;confirm.disabled=!v.canConfirm;copy.disabled=!v.item||!v.sourceMatches||copying;
  root.dataset.confirmed=String(!!v.receipt);
  confirm.textContent=v.receipt?'已在本頁確認':'僅在本頁確認這份候選';
  if(!v.item)return;
  status.textContent=!v.sourceMatches?'網址已變更，R7 頁內確認已失效。這份候選只適用上方固定來源；清空網址或填回原來源後需重新核對。':v.receipt?'本頁已確認這份 R7 候選；重新整理或離開即失效。未跨 session 保存、未發布、未量測。':'待您核對這份 R7 候選；頁內確認不會保存或發布。';
 }
 const sourceChanged=()=>{state.sourceChanged(sourceInput.value);fallback.hidden=true;paint();};
 sourceInput.addEventListener('input',sourceChanged);
 sourceInput.form?.addEventListener('submit',sourceChanged);
 // Back/forward cache must not resurrect a confirmation after leaving the page.
 window.addEventListener('pagehide',sourceChanged);
 window.addEventListener('pageshow',event=>{if(event.persisted)sourceChanged();});
 check.addEventListener('change',()=>{state.check(check.checked);paint();});
 confirm.addEventListener('click',()=>{if(confirm.disabled)return;try{state.confirm();paint();}catch{status.textContent='來源或候選無法確認，請重新核對。';}});
 copy.addEventListener('click',async()=>{
  if(copy.disabled)return;const before=state.view(),text=before.item.candidate.output.candidate;let message='';copying=true;copy.setAttribute('aria-busy','true');copy.textContent='正在複製…';paint();
  try{await navigator.clipboard.writeText(text);if(state.view().sourceMatches)message='已複製這份 R7 繁中候選；未保存、未發布、未量測。';}
  catch{if(state.view().sourceMatches){fallback.value=text;fallback.hidden=false;fallback.focus();fallback.select();message='瀏覽器未允許自動複製，請複製下方已選取的候選文字。';}}
  finally{copying=false;copy.setAttribute('aria-busy','false');copy.textContent='複製 R7 繁中候選';paint();if(message&&state.view().sourceMatches)status.textContent=message;}
 });
 try{
  const response=await fetch(new URL('./intro-r7.json',import.meta.url),{credentials:'same-origin',redirect:'error',cache:'no-store'});
  if(!response.ok)fail();const text=await response.text();if(new TextEncoder().encode(text).length>32768)fail();
  await state.load(JSON.parse(text));state.sourceChanged(sourceInput.value);
  const {candidate,candidateHash}=state.view().item,s=candidate.source,o=candidate.output;
  $('r7-original').textContent=s.fields.intro_description;$('r7-candidate').textContent=o.candidate;$('r7-reason').textContent=o.reason;
  $('r7-url').textContent=s.url;$('r7-url').href=s.url;
  $('r7-citations').replaceChildren(...o.citations.map(c=>el('p',c.field+'：「'+c.quote+'」')));
  $('r7-evidence').replaceChildren(...['來源版本：'+s.version,'候選版本 SHA256：'+candidateHash,'Run：'+R7.run,'執行 main：'+R7.workflow,'來源程式：'+R7.source,'模型：'+candidate.receipt.model,'模型 request：'+candidate.receipt.request_id,'正式 log frame：'+R7.frame,'原結果：'+R7.result,'Reviewer：'+R7.reviewer].map(t=>el('p',t)));
  $('r7-content').hidden=false;paint();
 }catch{status.textContent='R7 成果無法核對固定來源、版本或雜湊，已停止展示與確認；不會重新生成。';status.classList.add('error');$('r7-content').hidden=true;paint();}
 return state;
}
