// Exact stored-version authority is read from content_reviews, never a page receipt.
export function urlResultReview({api,version,isCurrent,latest=false}) {
 const root=document.createElement('section');root.className='url-review';
 const heading=document.createElement('h4');heading.textContent='確認這份已保存成果';
 const note=document.createElement('p');note.textContent='請對照上方原文、目前修改與來源。來源宣稱未經系統獨立驗真；確認僅適用這個已保存版本，不是發布授權。';
 const status=document.createElement('p');status.className='url-review-status';status.setAttribute('role','status');status.style.overflowWrap='anywhere';
 const fields=document.createElement('div'),checks=new Map();
 for(const [key,label]of Object.entries({title:'已核對標題原文、修改及相關事實',meta_description:'已核對 Meta description 原文、修改及相關事實',description:'已核對描述原文、修改及相關事實',source:'已核對這個版本的來源頁、快照與引用',blocking_facts_clear:'本版文案涉及的必要事實已確認，沒有尚未解決的阻斷缺口'})){
  const line=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.reviewCheck=key;line.append(input,document.createTextNode(label));fields.append(line,document.createElement('br'));checks.set(key,input);
 }
 const unknown=document.createElement('p');unknown.textContent='待確認項目仍保留於上方「未知與待確認」。若影響本版文案正確性，請先續編修正，勿勾選最後一項。';
 const confirm=document.createElement('button');confirm.type='button';confirm.className='url-review-confirm';confirm.textContent='確認這個已保存版本';
 const cancel=document.createElement('button');cancel.type='button';cancel.className='url-review-cancel';cancel.textContent='取消本次核對';
 const read=document.createElement('button');read.type='button';read.className='url-review-read';read.textContent='只讀取此版本確認結果';
 root.append(heading,note,unknown,fields,confirm,cancel,read,status);
 const session=api.context(),owner=session?.role==='owner';let ticket=0,busy=false,busyAction='',editing=false,attempted=false,review=null,blocked=true,feedback='正在讀取此版本確認狀態…';
 const current=()=>root.isConnected&&isCurrent()&&api.context()===session;
 const active=n=>current()&&ticket===n;
 const clearChecks=()=>{for(const input of checks.values())input.checked=false;};
 function paint(){
  confirm.setAttribute('aria-busy',String(busy&&busyAction==='confirm'));confirm.textContent=busy&&busyAction==='confirm'?'正在確認這個版本…':'確認這個已保存版本';
  read.setAttribute('aria-busy',String(busy&&busyAction==='read'));read.textContent=busy&&busyAction==='read'?'正在讀取確認結果…':'只讀取此版本確認結果';
  fields.hidden=confirm.hidden=cancel.hidden=!owner||!latest;
  const locked=busy||editing||attempted||!!review||blocked||!api.urlReviewCanConfirm(version);
  for(const input of checks.values())input.disabled=locked;
  confirm.disabled=locked||![...checks.values()].every(input=>input.checked);cancel.disabled=!!review||(busy&&!attempted);read.disabled=busy;
  status.textContent=editing?'正在續編；修改尚未保存／未確認／未發布。舊確認僅適用原已保存版本。':feedback;
 }
 for(const input of checks.values())input.addEventListener('change',paint);
 async function readback(n){
  const result=await api.readUrlReview(version,{isCurrent:()=>active(n)});if(!active(n))return;
  review=result;blocked=false;
  feedback=result?`${result.is_latest_version?'此已保存版本已確認':'歷史版本已確認，不能套用至新版'} · 第 ${version.version_number} 版 · ${version.id} · 確認 ${result.id} · 未發布`:attempted?'結果仍未知；只查詢原 request，不會重送。':'此已保存版本待確認 · 未發布。';
 }
 async function probe(){
  if(!current()||busy)return;busy=true;busyAction='read';feedback='正在讀取此版本確認狀態；不會重送確認。';const n=++ticket;paint();
  try{const op=api.reviewRecovery();attempted=op?.base_version_id===version.id;await readback(n);}
  catch(error){if(active(n)){blocked=true;feedback=`未能確認：${error.message}；成果保留，可只讀查詢。`;}}
  finally{if(active(n)){busy=false;paint();}}
 }
 confirm.addEventListener('click',async()=>{
  if(confirm.disabled||!current())return;busy=true;busyAction='confirm';feedback='正在核對並確認這個已保存版本…';const n=++ticket;paint();
  try{
   await api.confirmUrlReview(version,Object.fromEntries([...checks].map(([key,input])=>[key,input.checked])),{isCurrent:()=>active(n)&&!editing,onDispatch:()=>{attempted=true;feedback='確認結果待讀回；只查詢原 request，不重送。';paint();}});
   if(active(n))await readback(n);
  }catch(error){if(active(n)){blocked=true;feedback=`${error.message}；${attempted?'結果未確認，只查詢原 request，不重送':'未送出確認'}。成果保留。`;}}
  finally{if(active(n)){busy=false;paint();}}
 });
 cancel.addEventListener('click',()=>{ticket++;busy=false;clearChecks();feedback=attempted?'已停止等待；可能已確認，只查詢原 request，不重送。':'已取消核對；已保存成果未變，未發布。';paint();});
 read.addEventListener('click',()=>void probe());
 paint();queueMicrotask(()=>void probe());
 return {root,setEditing(value){editing=value;clearChecks();paint();}};
}
