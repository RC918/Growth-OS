// Reads existing role and controls; never dispatches, saves or approves.
function mountWorkspaceExperience(){
 const label=document.getElementById('ux-guide-state'),link=document.getElementById('ux-guide-action');let data=null;
 const panel=document.getElementById('url-result-panel');
 const paint=()=>{
  let text='登入後，接續你的成果。',target='#login-form',action='前往登入';
  if(data){
   if(data.role!=='owner'){text='你目前有檢視權限。可查看已保存版本，不能編輯或核准。';target='#opportunities';action='查看已保存成果';}
   else{
    const save=document.getElementById('save-url-result');
    const read=[...panel.querySelectorAll(':scope > button')].find(n=>n.id!=='save-url-result'&&!n.hidden);
    if(read){text='先核對原保存結果。請使用「只查詢保存結果」，不要再次保存。';target='#url-result-panel';action='前往核對保存結果';}
    else if(save&&!save.disabled){text='成果已帶入。核對工作區、來源與內容，再確認保存待審草稿。';target='#save-url-result';action='前往確認保存';}
    else if(save?.getAttribute('aria-busy')==='true'){text='正在核對保存結果。請等待伺服器讀回，不要再次保存。';target='#url-result-panel';action='查看保存狀態';}
    else if(data.versions?.length){text='已保存版本可接續閱讀。展開完整內容與來源，查看本版核准狀態；尚未發布。';target='#opportunities';action='查看已保存成果';}
    else{text='尚無已保存成果。從產品網址取得內容、確認版本，再帶入此工作區保存。';target='./growth-console.html';action='從網址開始';}
   }
  }
  if(label.textContent!==text)label.textContent=text;
  link.setAttribute('href',target);link.textContent=action;
 };
 link.addEventListener('click',event=>{
  const href=link.getAttribute('href');if(!href.startsWith('#'))return;
  const node=document.querySelector(href);if(!node)return;
  event.preventDefault();if(!node.matches('a[href],button,input,select,textarea,summary,[tabindex]'))node.setAttribute('tabindex','-1');
  node.focus();node.scrollIntoView({block:'center',behavior:'instant'});
 });
 new MutationObserver(paint).observe(panel,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','disabled','aria-busy']});
 paint();return {update(next){data=next;paint();}};
}
