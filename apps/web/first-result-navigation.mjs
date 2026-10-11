// Read-only navigation over the existing Review view. No receipt, edits or network.
export function createReviewNavigation({getView,isBusy,document:doc=document}) {
 const reason=doc.getElementById('review-next-reason'),button=doc.getElementById('review-next');
 const fields=[['title','Title'],['meta_description','Meta description'],['description','產品描述']];
 const write=(el,text)=>{if(el.textContent!==text)el.textContent=text;};
 function next(){
  const v=getView();
  if(!v)return {reason:'取得成果後，這裡會指出下一個核稿步驟。'};
  if(isBusy())return {reason:'正在取得來源；暫停核稿導航，保留原有編輯。'};
  if(v.pending)return {reason:'正在確認目前版本；完成後再繼續。'};
  const invalid=fields.find(([k])=>!v.fields[k].trim()||v.fields[k].length>2000);
  if(invalid){const [k,label]=invalid;return {reason:`先修正 ${label}：需填寫 1–2000 字，不能只有空白。`,label:`前往修正 ${label}`,target:'review-'+k};}
  const unchecked=fields.find(([k])=>v.edited[k]&&!v.fact_checks[k])||fields.find(([k])=>!v.fact_checks[k]);
  if(unchecked){const [k,label]=unchecked;return {reason:v.edited[k]?`先核對已修改的 ${label}：來源僅供對照，不代表支持新增文字。未核對不等於內容錯誤。`:`下一步核對 ${label} 的目前內容及相關事實；無關的未知資訊不必補填。`,label:`前往核對 ${label}`,target:'review-check-'+k};}
  if(!v.receipt)return {reason:'三欄均已核對；請自行確認目前版本。本頁確認不是保存或發布授權。',label:'前往確認目前版本',target:'review-confirm'};
  return {reason:'目前版本已在本頁確認；可複製文本或使用旁邊的匯出。兩者都不代表保存或發布。',label:'前往複製／匯出',target:'copy-result'};
 }
 function refresh(){
  const n=next(),target=n.target&&doc.getElementById(n.target);
  write(reason,n.reason);write(button,n.label||'請稍候');button.disabled=!target||target.disabled||!!target.closest('[hidden]');button.hidden=!n.target;
  return target;
 }
 button.addEventListener('click',()=>{const target=refresh();if(!button.disabled&&!button.hidden)target.focus();});
 refresh();return {refresh};
}
