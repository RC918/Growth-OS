import {sourceFromReport,validateArtifact,difference} from './intro-candidate.mjs';
export function createIntroPanel({root,getReport,getReview}){
 const $=id=>root.querySelector('#'+id),el=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};
 let epoch=0,loaded=null,eligible=false;
 const status=text=>{$('intro-status').textContent=text;};
 function clear(message='尚未載入改寫候選；本頁不會呼叫模型。'){
  epoch++;loaded=null;$('intro-apply').disabled=true;$('intro-output').replaceChildren();$('intro-file').value='';status(message);
 }
 function sourceChanged(ready=false){
  eligible=ready&&getReport()?.page_type==='static_subpage';clear(ready?undefined:'來源已變更；舊候選失效，需先取得來源成果。');
  root.hidden=!eligible;$('intro-file').disabled=!eligible;
 }
 $('intro-file').addEventListener('change',async()=>{
  const file=$('intro-file').files[0];if(!file||!eligible)return;
  clear();const ticket=epoch,report=getReport(),review=getReview(),token=review.view().token;
  try{
   if(file.size>32768)throw Error('TOO_LARGE');
   const source=sourceFromReport(report),result=await validateArtifact(JSON.parse(await file.text()),source);
   if(ticket!==epoch||report!==getReport()||review!==getReview()||token!==review.view().token)return;
   loaded={...result,report,review,token,before:source.fields.intro_description};
   const before=source.fields.intro_description,after=result.output.candidate,delta=difference(before,after),box=$('intro-output');
   const label=result.mode==='synthetic'?'離線測試候選（未呼叫模型）':'候選附模型回條；本頁未獨立核對其真實性';
   box.append(el('p',label),el('h4','介紹原文'),el('p',before),el('h4','改寫候選'),el('p',after));
   const changes=el('p');changes.setAttribute('aria-label','文字差異');
   changes.append(el('span',delta.prefix),el('del',delta.removed),el('ins',delta.added),el('span',delta.suffix));box.append(changes);
   box.append(el('p',result.changed?'有文字差異；內容改善仍待審閱，未驗證排名或流量效果。':'與原文相同；未產生改善。'),el('p','修改理由：'+result.output.reason));
   for(const ref of result.output.citations)box.append(el('p',ref.field+'：「'+ref.quote+'」'));
   box.append(el('p','引文存在不代表支持改寫中的每項宣稱；採用前請核對。'));
   $('intro-apply').disabled=review.view().fields.description!==before;
   status($('intro-apply').disabled?'介紹已有編輯；候選不會覆蓋。可先複製或還原原草稿再載入。':'候選已載入，可審閱後套用到介紹草稿；未保存、未發布。');
  }catch{if(ticket===epoch){loaded=null;$('intro-apply').disabled=true;status('候選無法核對此來源、引用或回條；原草稿保留。');}}
 });
 $('intro-apply').addEventListener('click',()=>{
  if(!loaded||!eligible||loaded.report!==getReport()||loaded.review!==getReview()||loaded.token!==getReview().view().token||getReview().view().fields.description!==loaded.before){clear('內容已變更；請重新核對候選。');return;}
  const candidate=loaded.output.candidate;getReview().edit('description',candidate);clear('已套用到介紹草稿；未獨立核實、未保存、未發布。');
  root.dispatchEvent(new CustomEvent('intro-applied',{detail:{candidate}}));
 });
 return {sourceChanged,draftChanged(){clear('草稿已變更；舊候選不會覆蓋目前文字。');}};
}
