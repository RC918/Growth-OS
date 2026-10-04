// Unsaved continuation of one exact stored version, using the existing Review engine.
import {restoreResultReview,reviewFields} from './first-result-review.mjs';
import {typedDraft} from './typed-draft.mjs';
import {canonical} from './first-result-payload.mjs';
const labels={title:'標題',meta_description:'Meta description',description:'產品描述'};
export function savedResultReview({api,version,isCurrent,enabled=false,onEditingChange=()=>{}}){
 const root=document.createElement('section');root.className='saved-result-review';
 const start=document.createElement('button');start.type='button';start.textContent='續編此已保存版本（未保存）';start.className='resume-review';
 const status=document.createElement('p');status.className='resume-status';status.setAttribute('role','status');
 const editor=document.createElement('div');editor.className='resume-editor';
 root.append(start,status,editor);
 const session=api.context();let ticket=0,review=null,pending=false,base=null;
 const current=()=>root.isConnected&&isCurrent()&&api.context()===session&&session?.role==='owner';
 const active=operation=>current()&&operation===ticket;
 function clear(){ticket++;review?.invalidate();review=null;pending=false;base=null;editor.replaceChildren();start.hidden=false;start.disabled=false;}
 function cancel(){clear();onEditingChange(false);status.textContent='已取消續編；原已保存版本未變。';}
 async function open(){
  if(!current()||pending)return;
  onEditingChange(true);pending=true;start.disabled=true;const operation=++ticket;status.textContent='正在核對已保存版本…';
  try{
   const unresolved=api.revisionRecovery();if(unresolved&&!unresolved.resolved)throw Error('有未決續編；請先在恢復面板只查詢原 request');
   const row=await api.readReviewBase(version);if(!active(operation))return;
   const next=await restoreResultReview(row.first_result_payload);if(!active(operation)){next.invalidate();return;}
   base=canonical(row);review=next;start.hidden=true;render();
  }catch(error){if(active(operation)){onEditingChange(false);status.textContent=`無法續編：${error.message}`;}}
  finally{if(active(operation)){pending=false;start.disabled=false;}}
 }
 function render(){
  editor.replaceChildren();const own=review;let prepared=null,attempted=false,knownId=null,blocked=false,feedback='',saved=null;
  const intentView=document.createElement('details');intentView.className='resume-intent';intentView.hidden=true;
  const fields=document.createElement('div');const inputs=new Map(),checks=new Map(),origins=new Map();
  for(const key of reviewFields){
   const label=document.createElement('label');label.textContent=labels[key];
   const input=document.createElement('textarea');input.maxLength=2000;input.value=own.view().fields[key];input.dataset.field=key;input.style.width='100%';input.style.boxSizing='border-box';label.append(input);
   const origin=document.createElement('p');origin.style.overflowWrap='anywhere';
   const checkLabel=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.dataset.check=key;checkLabel.append(check,document.createTextNode('已核對 '+labels[key]+' 目前內容及相關事實'));
   fields.append(label,origin,checkLabel);inputs.set(key,input);checks.set(key,check);origins.set(key,origin);
   input.addEventListener('input',()=>{if(!current()){clear();return;}if(attempted||blocked)return;own.edit(key,input.value);invalidateIntent();paint();});
   check.addEventListener('change',()=>{if(!current()){clear();return;}if(attempted||blocked)return;own.check(key,check.checked);invalidateIntent();paint();});
  }
  const confirm=document.createElement('button');confirm.type='button';confirm.className='resume-confirm';confirm.textContent='確認本頁修改（未保存）';
  const prepare=document.createElement('button');prepare.type='button';prepare.className='resume-prepare';prepare.textContent='準備新版本保存意圖（不送出）';
  function invalidateIntent(){prepared=null;intentView.replaceChildren();intentView.hidden=true;}
  const cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.className='resume-cancel';cancelButton.textContent='取消續編，返回已保存版本';cancelButton.addEventListener('click',()=>{
   if(!attempted){cancel();return;}
   ticket++;pending=false;blocked=true;own.invalidate();feedback='已停止等待；可能已保存，只可查詢原 request，不會重送。';paint();
  });
  const save=document.createElement('button');save.type='button';save.className='resume-save';save.textContent=enabled?'保存為新版本':'新版本保存尚未開放';
  const reconcile=document.createElement('button');reconcile.type='button';reconcile.className='resume-reconcile';reconcile.textContent='只查詢這次保存結果';
  const result=document.createElement('div');result.className='resume-saved-result';
  function paint(){
   const view=own.view();
   status.textContent=`基於第 ${version.version_number} 版（${version.id}）續編 · ${view.receipt?'本頁已確認':'待重新確認'} · 未保存 · 未發布。重新整理或離開將失去本次修改。`;
   if(feedback)status.textContent=feedback;
   status.style.overflowWrap='anywhere';
   for(const key of reviewFields){checks.get(key).checked=view.fact_checks[key];origins.get(key).textContent=`原建議：${view.original_suggestions[key]}；${view.edited[key]?'使用者修改，引用僅供原建議對照':'原建議文字'}`;}
   confirm.disabled=blocked||attempted||pending||!view.canConfirm||!!view.receipt;
   prepare.disabled=blocked||attempted||pending||!view.receipt||!!prepared;
   save.disabled=!enabled||blocked||attempted||pending||!prepared;
   reconcile.hidden=!attempted||!!saved;reconcile.disabled=pending;
   for(const input of inputs.values())input.readOnly=attempted||blocked;
   for(const check of checks.values())check.disabled=attempted||blocked;
   cancelButton.disabled=!!saved;
  }
  confirm.addEventListener('click',async()=>{
   if(!current()||pending||blocked||attempted||review!==own)return;
   pending=true;confirm.disabled=true;const operation=++ticket,reviewToken=own.view().token;
   try{
    const row=await api.readReviewBase(version);
    if(!active(operation)||review!==own)return;
    if(canonical(row)!==base)throw Error('已保存來源或內容已變更，請重新讀取');
    if(own.view().token!==reviewToken)throw Error('修改已變更，請重新確認');
    await own.confirm();
    if(!active(operation)||review!==own)return;
   }catch(error){
    if(active(operation)){blocked=true;own.invalidate();invalidateIntent();feedback=`續編已失效：${error.message}；修改保留於本頁，不會覆蓋新基準。`;}
   }finally{if(active(operation)&&review===own){pending=false;paint();}}
  });
  prepare.addEventListener('click',async()=>{
   if(!current()||pending||blocked||attempted||!own.view().receipt||prepared)return;
   pending=true;paint();const operation=++ticket,reviewToken=own.view().token;
   const live=()=>active(operation)&&review===own&&own.view().token===reviewToken;
   try{
    const exported=await own.export();if(!live())return;
    const intent=await api.prepareUrlRevisionIntent(JSON.parse(base),exported,{isCurrent:live});
    if(!live())return;
    prepared=intent;
    const summary=document.createElement('summary');summary.textContent=`第 ${intent.request.expected_version+1} 版保存意圖已備妥 · 尚未送出／未保存／未發布`;
    const detail=document.createElement('pre');detail.className='resume-intent-json';detail.style.whiteSpace='pre-wrap';detail.style.overflowWrap='anywhere';detail.textContent=JSON.stringify(intent,null,2);
    intentView.replaceChildren(summary,detail);intentView.hidden=false;
   }catch(error){if(active(operation)){blocked=true;own.invalidate();invalidateIntent();feedback=`保存意圖未建立：${error.message}；修改保留於本頁。`;}}
   finally{if(active(operation)&&review===own){pending=false;paint();}}
  });
  async function readback(operation){
   const row=await api.recoverUrlRevision({isCurrent:()=>active(operation)&&review===own});
   if(!active(operation)||review!==own)return;
   if(!row){feedback='結果仍未知；只查詢原 request，不重送保存。';return;}
   saved=row;knownId=row.id;blocked=true;window.dispatchEvent(new Event('url-revision-pending'));feedback=`已保存第 ${row.version_number} 版 · ${row.id} · 精確讀回 · 未發布；原版本仍保留於上方。`;
   result.replaceChildren(typedDraft(row));
  }
  save.addEventListener('click',async()=>{
   if(save.disabled||!current()||!prepared)return;
   pending=true;feedback='重新核對保存基準中…';paint();const operation=++ticket,reviewToken=own.view().token;
   const live=()=>active(operation)&&review===own&&own.view().token===reviewToken;
   try{
    knownId=await api.saveUrlRevision(prepared,{isCurrent:live,onDispatch:()=>{attempted=true;window.dispatchEvent(new Event('url-revision-pending'));feedback='保存中；未知結果只查詢，不重送。';paint();}});
    if(!live())return;await readback(operation);
   }catch(error){if(active(operation)){blocked=true;own.invalidate();if(!attempted)invalidateIntent();feedback=attempted?`${error.message}；結果未確認，只查詢原 request，不重送。`:`${error.message}；未送出，修改保留於本頁，不會覆蓋新基準。`;}}
   finally{if(active(operation)){pending=false;paint();}}
  });
  reconcile.addEventListener('click',async()=>{
   if(!current()||pending||!attempted||saved)return;
   pending=true;paint();const operation=++ticket;
   try{await readback(operation);}catch(error){if(active(operation))feedback=`${error.message}；只查詢原 request，不重送。`;}
   finally{if(active(operation)){pending=false;paint();}}
  });
  editor.append(fields,confirm,prepare,save,reconcile,cancelButton,intentView,result);pending=false;paint();
 }
 start.addEventListener('click',()=>void open());
 return root;
}


// Same-tab recovery shares the API's single metadata marker; it never dispatches.
export function createRevisionRecovery({api,root}){
 const title=document.createElement('h2');title.textContent='續編保存結果恢復';
 const status=document.createElement('p');status.setAttribute('role','status');status.className='revision-recovery-status';
 const button=document.createElement('button');button.type='button';button.textContent='只查詢原續編保存結果';button.className='revision-recovery-read';
 const result=document.createElement('div');result.className='revision-recovery-result';root.append(title,status,button,result);root.hidden=true;
 let ticket=0,session=null,pending=false;
 const current=operation=>operation===ticket&&session&&api.context()===session&&root.isConnected;
 async function read(){
  if(pending||!session)return;pending=true;button.disabled=true;const operation=++ticket;status.textContent='正在查詢原 request，不會送出保存…';
  try{
   const row=await api.recoverUrlRevision({isCurrent:()=>current(operation)});if(!current(operation))return;
   if(!row){status.textContent='結果仍未知；只可查詢原 request，不重送。此分頁未儲存修改文案，只有已落庫版本可恢復。';return;}
   result.replaceChildren(typedDraft(row));status.textContent=`已恢復第 ${row.version_number} 版 · ${row.id} · 精確讀回 · 未發布`;button.hidden=true;
  }catch(error){if(current(operation))status.textContent=`恢復未完成：${error.message}；不會重送保存。`;}
  finally{if(current(operation)){pending=false;button.disabled=false;}}
 }
 button.addEventListener('click',()=>void read());
 return {
  close(){ticket++;session=null;pending=false;root.hidden=true;result.replaceChildren();status.textContent='';},
  open({probe=true}={}){
   ticket++;session=api.context();pending=false;result.replaceChildren();button.hidden=false;button.disabled=false;root.hidden=true;
   try{
    const op=api.revisionRecovery();if(!op||op.resolved)return;
    root.hidden=false;status.textContent='此分頁有未決續編；只可查詢原 request，不會自動重送。';
    if(!session||session.role!=='owner'||session.organization_id!==op.organization_id){button.disabled=true;status.textContent='此分頁有不同身份／工作區的未決續編；禁止保存。';return;}
    if(probe)void read();
   }catch(error){root.hidden=false;button.disabled=true;status.textContent=error.message;}
  },
 };
}
