// Only the exact saved payload is delivered; editor state is never an input.
export function savedDeliveryText(value){
 const lines=[`已保存${value.version.position==='historical'?'歷史':'讀取時最新'}版本 · 第 ${value.version.number} 版 · ${value.version.id}`,`工作區：${value.version.organization_id}`,`候選目標頁：${value.source.candidate_url}`,`來源摘要：${value.source.source_digest}`,`內容摘要：${value.content_digest}`,`完整成果摘要：${value.version.payload_digest}`,value.notice];
 for(const [key,label]of Object.entries({title:'Title',meta_description:'Meta description',description:'產品描述'}))lines.push(`${label}:\n${value.fields[key]}`);
 return lines.join('\n\n');
}
export function savedResultDelivery({api,version,isCurrent,latest=false}){
 const root=document.createElement('section');root.className='saved-result-delivery';
 const add=(tag,text,cls='')=>{const node=document.createElement(tag);node.textContent=text;node.className=cls;root.append(node);return node;};
 add('h4',`交付此已保存${latest?'':'歷史'}版本`);
 add('p',`第 ${version.version_number} 版 · ${version.id}。只輸出已保存內容，不包含未保存修改；未發布，複製／下載不是版本確認或發布授權。`);
 const copy=add('button','複製此版本三欄成果','saved-copy'),download=add('button','下載此版本成果 JSON','saved-download');copy.type=download.type='button';
 const status=add('p','','saved-delivery-status');status.setAttribute('role','status');
 let fallback=null;
 const session=api.context();let ticket=0,editing=false,busy=false;
 const current=()=>root.isConnected&&isCurrent()&&api.context()===session;
 const active=n=>current()&&!editing&&ticket===n;
 const clear=()=>{if(fallback){fallback.value='';fallback.remove();fallback=null;}};
 const paint=()=>{copy.disabled=download.disabled=busy||editing;};
 async function deliver(kind){
  if(busy||editing||!current())return;busy=true;const n=++ticket;clear();status.textContent='正在重新核對此已保存版本與來源…';paint();
  try{
   const value=await api.readSavedUrlDelivery(version,{latest,isCurrent:()=>active(n)});if(!active(n))return;
   if(kind==='copy'){
    const text=savedDeliveryText(value);if(!active(n))return;
    try{await navigator.clipboard.writeText(text);if(active(n))status.textContent='已複製此已保存版本三欄成果及來源識別；未發布。';}
    catch{if(active(n)){fallback=add('textarea','','saved-copy-fallback');fallback.readOnly=true;fallback.setAttribute('aria-label','此已保存版本的待複製文本');fallback.style.width='100%';fallback.style.boxSizing='border-box';fallback.value=text;fallback.focus();fallback.select();status.textContent='瀏覽器未允許自動複製，請使用 Ctrl／⌘+C 複製已選取文本；未發布。';}}
   }else{
    const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    try{if(!active(n))return;a.href=url;a.download=`growth-os-saved-${value.version.id}.json`;document.body.append(a);a.click();status.textContent='已啟動此已保存版本成果與來源的下載；未發布。';}
    finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
   }
  }catch(error){if(active(n)){clear();status.textContent=`未輸出：${error.message}；請重新讀取已保存版本。`;}}
  finally{if(active(n)){busy=false;paint();}}
 }
 copy.addEventListener('click',()=>void deliver('copy'));download.addEventListener('click',()=>void deliver('download'));
 return {root,setEditing(value){ticket++;editing=value;busy=false;clear();status.textContent=value?'正在續編；已保存版本輸出暫停，未保存修改不會混入。':'已返回保存版本；輸出時會重新核對。';paint();}};
}
