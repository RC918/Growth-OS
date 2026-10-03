// Unsaved continuation of one exact stored version, using the existing Review engine.
import {restoreResultReview,reviewFields} from './first-result-review.mjs';
import {canonical} from './first-result-payload.mjs';
const labels={title:'標題',meta_description:'Meta description',description:'產品描述'};
export function savedResultReview({api,version,isCurrent}){
 const root=document.createElement('section');root.className='saved-result-review';
 const start=document.createElement('button');start.type='button';start.textContent='續編此已保存版本（未保存）';start.className='resume-review';
 const status=document.createElement('p');status.className='resume-status';status.setAttribute('role','status');
 const editor=document.createElement('div');editor.className='resume-editor';
 root.append(start,status,editor);
 const session=api.context();let ticket=0,review=null,pending=false,base=null;
 const current=()=>root.isConnected&&isCurrent()&&api.context()===session&&session?.role==='owner';
 const active=operation=>current()&&operation===ticket;
 function clear(){ticket++;review?.invalidate();review=null;pending=false;base=null;editor.replaceChildren();start.hidden=false;start.disabled=false;}
 function cancel(){clear();status.textContent='已取消續編；原已保存版本未變。';}
 async function open(){
  if(!current()||pending)return;
  pending=true;start.disabled=true;const operation=++ticket;status.textContent='正在核對已保存版本…';
  try{
   const row=await api.readReviewBase(version);if(!active(operation))return;
   const next=await restoreResultReview(row.first_result_payload);if(!active(operation)){next.invalidate();return;}
   base=canonical(row);review=next;start.hidden=true;render();
  }catch(error){if(active(operation))status.textContent=`無法續編：${error.message}`;}
  finally{if(active(operation)){pending=false;start.disabled=false;}}
 }
 function render(){
  editor.replaceChildren();const own=review;
  const fields=document.createElement('div');const inputs=new Map(),checks=new Map(),origins=new Map();
  for(const key of reviewFields){
   const label=document.createElement('label');label.textContent=labels[key];
   const input=document.createElement('textarea');input.maxLength=2000;input.value=own.view().fields[key];input.dataset.field=key;input.style.width='100%';input.style.boxSizing='border-box';label.append(input);
   const origin=document.createElement('p');origin.style.overflowWrap='anywhere';
   const checkLabel=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.dataset.check=key;checkLabel.append(check,document.createTextNode('已核對 '+labels[key]+' 目前內容及相關事實'));
   fields.append(label,origin,checkLabel);inputs.set(key,input);checks.set(key,check);origins.set(key,origin);
   input.addEventListener('input',()=>{if(!current()){clear();return;}own.edit(key,input.value);paint();});
   check.addEventListener('change',()=>{if(!current()){clear();return;}own.check(key,check.checked);paint();});
  }
  const confirm=document.createElement('button');confirm.type='button';confirm.className='resume-confirm';confirm.textContent='確認本頁修改（未保存）';
  const cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.className='resume-cancel';cancelButton.textContent='取消續編，返回已保存版本';cancelButton.addEventListener('click',cancel);
  function paint(){
   const view=own.view();
   status.textContent=`基於第 ${version.version_number} 版（${version.id}）續編 · ${view.receipt?'本頁已確認':'待重新確認'} · 未保存 · 未發布。重新整理或離開將失去本次修改。`;
   status.style.overflowWrap='anywhere';
   for(const key of reviewFields){checks.get(key).checked=view.fact_checks[key];origins.get(key).textContent=`原建議：${view.original_suggestions[key]}；${view.edited[key]?'使用者修改，引用僅供原建議對照':'原建議文字'}`;}
   confirm.disabled=pending||!view.canConfirm||!!view.receipt;
  }
  confirm.addEventListener('click',async()=>{
   if(!current()||pending||review!==own)return;
   pending=true;confirm.disabled=true;const operation=++ticket,reviewToken=own.view().token;
   try{
    const row=await api.readReviewBase(version);
    if(!active(operation)||review!==own)return;
    if(canonical(row)!==base)throw Error('已保存來源或內容已變更，請重新讀取');
    if(own.view().token!==reviewToken)throw Error('修改已變更，請重新確認');
    await own.confirm();
    if(!active(operation)||review!==own)return;
   }catch(error){
    if(active(operation)){clear();status.textContent=`續編已失效：${error.message}；原已保存版本未變。`;}
   }finally{if(active(operation)&&review===own){pending=false;paint();}}
  });
  editor.append(fields,confirm,cancelButton);pending=false;paint();
 }
 start.addEventListener('click',()=>void open());
 return root;
}
