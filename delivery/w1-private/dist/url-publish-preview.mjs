// A fresh read-only view of a saved version. No checkbox, writer or platform adapter.
export function urlPublishPreview({api,version,isCurrent,latest=false}) {
 const root=document.createElement('section');root.className='url-publish-preview';
 const add=(parent,tag,text,className='')=>{const node=document.createElement(tag);node.textContent=text;node.className=className;parent.append(node);return node;};
 add(root,'h4','發布前版本與差異預覽');
 add(root,'p','查看已保存版本、目標頁及待完成條件。這不會確認內容或發布。');
 const read=add(root,'button','讀取發布前預覽','publish-preview-read');read.type='button';
 const status=add(root,'p','','publish-preview-status');status.setAttribute('role','status');
 const body=add(root,'div','','publish-preview-body');
 const publish=add(root,'button','發布尚未開放','publish-unavailable');publish.type='button';publish.disabled=true;
 const session=api.context();let ticket=0,editing=false,busy=false;
 const current=()=>root.isConnected&&isCurrent()&&api.context()===session;
 const active=n=>current()&&ticket===n&&!editing;
 function paint(){read.disabled=busy||editing||session?.role!=='owner'||!latest;read.setAttribute('aria-busy',String(busy));}
 status.textContent=session?.role!=='owner'?'僅 Owner 可準備發布前預覽。':!latest?'歷史版本不能用作目前發布預覽。':'尚未發布；請讀取目前已保存版本的預覽。';
 read.addEventListener('click',async()=>{
  if(read.disabled||!current())return;const n=++ticket;busy=true;body.replaceChildren();status.textContent='正在重新核對身份、版本、來源及確認紀錄…';paint();
  try{
   const value=await api.previewUrlPublication(version,{isCurrent:()=>active(n)});if(!active(n))return;
   add(body,'p',`已保存第 ${value.binding.version_number} 版`,'publish-version');
   add(body,'p',`候選目標頁：${value.target_url}（不代表站點所有權）`,'publish-target');
   const evidence=add(body,'details','');add(evidence,'summary','版本與來源核對');
   add(evidence,'p',`內容版本：${value.binding.version_id} · 確認：${value.binding.review_id||'無有效確認'}`);
   add(evidence,'p',`本版來源：${value.source_version} · 擷取時間：${value.fetched_at||'未知'}${value.binding.source_digest?' · '+value.binding.source_digest:''}`);
   if(value.current_source_version!==undefined)add(evidence,'p',`目前來源版本：${value.current_source_version} · 答案第 ${value.binding.fact_version} 版`);
   add(body,'p',value.review_status==='exact_version_confirmed'?'此確切版本已有內容確認；不是發布授權。':value.review_status==='unknown'?'原確認結果未知。':'此版本仍待確認；預覽不會建立確認紀錄。','publish-review-state');
   add(body,'p','以下「原文」取自已保存來源快照，不代表網站現在內容。此次預覽只在本頁顯示；續編或重新讀取需重新核對。');
   for(const [key,label]of Object.entries({title:'標題',meta_description:'Meta description',description:'產品描述'})){
    if(!value.fields[key])continue;
    const field=value.fields[key],section=add(body,'section','');section.dataset.publishField=key;
    add(section,'h5',`${label} · ${field.changed?'有差異':'無差異'}`);
    add(section,'p','來源快照原文');add(section,'p',field.before,'publish-before');
    add(section,'p','預計套用的已保存內容');add(section,'p',field.after,'publish-after');
   }
   if(value.previous){const prior=add(body,'section','');prior.className='publish-previous';add(prior,'h5',`與上一保存版比較 · ${value.previous.changed?'有差異':'無差異'}`);add(prior,'p',`以下是第 ${value.previous.version} 版草稿，不代表網站目前內容或已發布內容。`);add(prior,'p',value.previous.body);add(prior,'p','本版內容');add(prior,'p',value.fields.description.after);}
   const reasons=add(body,'ul','','publish-blockers');for(const reason of value.blockers){const li=add(reasons,'li',reason.message);li.dataset.blocker=reason.code;}
   status.textContent='預覽已讀取 · 實際發布仍被阻擋 · 未發布。';
  }catch(error){if(active(n)){body.replaceChildren();status.textContent=`預覽已失效／無法核對：${error.message}。未發布。`;}}
  finally{if(active(n)){busy=false;paint();}}
 });
 paint();return {root,setEditing(value){ticket++;editing=value;busy=false;body.replaceChildren();status.textContent=value?'正在續編；原發布預覽已失效，未發布。':'請重新讀取已保存版本的發布預覽。';paint();}};
}
