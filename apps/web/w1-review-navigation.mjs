// Presentation only over the existing W1 readback and preview. No API or receipt.
export function createW1ReviewNavigation({getState,document:doc=document}){
 const root=doc.createElement('section');root.id='w1-guidance';root.setAttribute('aria-labelledby','w1-guidance-heading');
 const heading=doc.createElement('h3');heading.id='w1-guidance-heading';heading.textContent='現在可以先看哪裡';
 const reason=doc.createElement('p');reason.id='w1-guidance-reason';reason.setAttribute('role','status');reason.setAttribute('aria-live','polite');reason.setAttribute('aria-atomic','true');
 const button=doc.createElement('button');button.id='w1-guidance-next';button.type='button';button.setAttribute('aria-describedby',reason.id);
 root.append(heading,reason,button);doc.getElementById('draft').before(root);
 const write=(el,text)=>{if(el.textContent!==text)el.textContent=text;};
 function next(){
  const {current,busy,pending,session,preview,readFailed}=getState();
  if(!session||!current)return {reason:'登入並讀取工作區後，這裡會指出可查看的內容。',hidden:true};
  if(busy||preview?.busy)return {reason:'正在讀取核對結果；請稍候，不會自動保存或確認。'};
  if(pending)return {reason:'原操作結果仍待核對；先查看原操作結果，不會重送。',label:'前往核對原操作結果',target:'#reconcile'};
  if(!current.draft_id)return {reason:'目前沒有已保存草稿可供核稿；下方初步文字不是已保存版本。本引導不建立或修改草稿。',label:'前往讀取最新版本',target:'#refresh'};
  if(readFailed)return {reason:'最新版本未能完整讀回；保留已顯示內容，請先重新讀取，不沿用舊預覽。',label:'前往讀取最新版本',target:'#refresh'};
  if(preview?.editing)return {reason:'目前操作尚未結束；暫停唯讀核稿引導，不採用舊預覽。'};
  if(preview?.failed)return {reason:'預覽未能核對目前版本；先讀取最新版本，再查看內容。',label:'前往讀取最新版本',target:'#refresh'};
  const issue=current.is_conflict?'商家答案與來源有衝突，既有確認不能代用。':current.source_changed?'來源已變更，舊確認不適用。':current.review_valid?'此確切版本已有內容確認；不代表發布授權。':'此確切版本尚無有效確認；查看預覽不會補做確認。';
  if(session.role!=='owner')return {reason:issue+' 此身分可查看已讀回的來源與版本，不能讀取 Owner 發布前預覽。',label:'前往來源與版本',target:'#evidence-summary'};
  if(!preview?.ready)return {reason:issue+' 先讀取已保存草稿、來源及差異；本區只引導查看。',label:'前往讀取核稿預覽',target:'.publish-preview-read'};
  const problem=current.is_conflict||current.source_changed;
  return {reason:issue+' '+(problem?'先查看本版來源與版本依據。':'可對照來源與本版描述，並查看下方上一版差異。')+' 目前仍未發布，本引導不修改或確認內容。',label:problem?'前往來源與版本':'前往對照已保存描述',target:problem?'.publish-preview-body details summary':'[data-publish-field="description"] h5'};
 }
 function refresh(){
  const n=next(),target=n.target&&doc.querySelector(n.target);root.hidden=!!n.hidden;write(reason,n.reason);write(button,n.label||'請稍候');
  const available=target&&!target.disabled&&!target.closest('[hidden]')&&target.isConnected;
  button.hidden=!available;button.disabled=!available;return available?target:null;
 }
 button.addEventListener('click',()=>{const target=refresh();if(!target||button.hidden||root.hidden)return;if(target.tagName==='H5')target.tabIndex=-1;target.focus();});
 refresh();return {refresh};
}
