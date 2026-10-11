import {createConsoleTask,failureText} from './growth-console-task.mjs';
import {reviewFields} from './first-result-review.mjs';
const $=id=>document.getElementById(id),make=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};
const names={title:'頁面標題',meta_description:'搜尋摘要',description:'產品描述'};
let viewName='overview',rendered=null,guideTarget=null,demo=null,sceneTicket=0;
const task=createConsoleTask({load:async(url,signal)=>{
 const response=await fetch('/api/product-source',{method:'POST',credentials:'omit',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal});
 let data;try{data=await response.json();}catch{throw Error('backend_unavailable');}
 if(!response.ok)throw Error([404,405].includes(response.status)?'backend_unavailable':data.code||'backend_unavailable');return data;
},changed:render});
const setText=(el,text)=>{if(el.textContent!==text)el.textContent=text;};
function selected(){const s=task.view();
 for(const [name,id] of [['overview','overview-panel'],['result','result-panel'],['sources','sources-panel'],['measure','measure-panel']])$(id).hidden=viewName!==name||(name!=='measure'&&!s.report);
 $('input-panel').hidden=!['overview'].includes(viewName);
 document.querySelectorAll('[data-view]').forEach(b=>{if(b.dataset.view===viewName)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
}
function select(name){viewName=name;selected();}
function sourceCards(r){
 const facts=$('source-facts');facts.replaceChildren();
 for(const [key,value] of Object.entries(r.facts))for(const f of (Array.isArray(value)?value:[value]).filter(Boolean))facts.append(make('p','網站取得 · '+(names[key]||key)+'：'+f.value));
 for(const f of r.inferences)facts.append(make('p','推論 · '+f.value+'；依據：'+f.basis));
 facts.append(make('p','未知 · '+r.missing.join('、')));
 const cite=$('citations');cite.replaceChildren(make('p','來源：'+r.snapshot.final_url),make('p','取得時間：'+r.snapshot.fetched_at));
 for(const c of r.snapshot.citations)cite.append(make('p',c.id+' · '+c.locator+' · 「'+c.quote+'」'));
}
function fields(r,v){
 const box=$('result-fields');box.replaceChildren();
 for(const key of reviewFields){
  const f=r.preview.fields[key],article=make('article');article.className='field';article.append(make('h3',names[key]));
  const compare=make('div');compare.className='comparison';const original=make('div'),edit=make('div');
  original.append(make('strong','原文'));const text=make('p',f.original||'來源未提供');text.className='original';original.append(text);
  const label=make('label','建議／目前編輯');label.htmlFor='field-'+key;const input=make('textarea');input.id=label.htmlFor;input.value=v.fields[key];input.maxLength=2000;input.setAttribute('aria-describedby','field-note-'+key+' field-error-'+key);
  input.addEventListener('input',()=>task.edit(key,input.value));
  const note=make('p');note.id='field-note-'+key;const error=make('p');error.id='field-error-'+key;error.className='field-error';
  const checkLabel=make('label');checkLabel.className='fact-check';const check=make('input');check.type='checkbox';check.id='check-'+key;check.addEventListener('change',()=>task.check(key,check.checked));
  checkLabel.append(check,make('span','已核對'+names[key]+'的內容與相關事實'));
  edit.append(label,input,note,error,checkLabel);compare.append(original,edit);article.append(compare,make('p','原建議理由：'+f.reason),make('p','來源依據：'+f.citations.join('、')));box.append(article);
 }
}
function guidance(s){const v=s.review;
 if(s.phase==='running')return {owner:s.synthetic?'合成場景，沒有真任務':'系統正在處理本頁請求',reason:s.synthetic?'這是執行狀態示範；按下按鈕才切至合成成果。':'正在等待安全來源服務回覆；沒有可計數的總量，不顯示百分比。',...(s.synthetic?{label:'查看合成成果',action:'demo-review'}:{})};
 if(s.phase==='confirming')return {owner:'本頁正在核對版本',reason:'正在綁定目前內容與來源；不會保存或發布。'};
 if(['failed','unknown'].includes(s.phase))return {owner:'需要核對讀取狀態',reason:(failureText[s.error]||'已停止等待；執行端是否停止未知，晚回覆不會覆蓋成果。')+' 可核對網址；不自動重送。',label:'查看保留的網址',target:'source-url',view:'overview'};
 if(!v)return {owner:'由你選擇來源',reason:'貼上一個公開產品頁。已有資料先讀取，不先填完整問卷。',label:'前往網址欄位',target:'source-url',view:'overview'};
 if(!s.sourceCurrent)return {owner:'需要你核對來源',reason:'網址已修改或本次讀取未完成，保留舊成果但不能以新網址確認舊版。',label:'前往核對網址',target:'source-url',view:'overview'};
 const invalid=reviewFields.find(k=>!v.fields[k].trim()||v.fields[k].length>2000);
 if(invalid)return {owner:'需要你修正一欄',reason:names[invalid]+'需有1–2000字，否則無法綁定有效版本。其他編輯保留。',label:'查看'+names[invalid],target:'field-'+invalid,view:'result'};
 const next=reviewFields.find(k=>v.edited[k]&&!v.fact_checks[k])||reviewFields.find(k=>!v.fact_checks[k]);
 if(next)return {owner:'需要你核對一項內容',reason:'先核對'+names[next]+'涉及的事實。'+(v.edited[next]?'你已修改文字，原來源不會自動支持新增宣稱。':'只需確認成果實際用到的資訊。')+' 可稍後處理，內容保留在本頁且不會發布。',label:'查看並核對'+names[next],target:'check-'+next,view:'result'};
 if(!v.receipt)return {owner:'由你確認版本',reason:'三欄均已自行核對；下一步只確認本頁確切版本，不保存、不發布。',label:'前往版本確認',target:'review-confirm',view:'result'};
 return {owner:'本頁內容確認已完成',reason:'已取得來源並確認本頁版本；尚未保存、未取得工作區核准、未發布。搜尋效果未知。',label:'查看目前成果',target:'result-heading',view:'result'};
}
function render(s){
 const v=s.review,r=s.report;
 $('mode-banner').classList.toggle('synthetic',s.synthetic);
 setText($('mode-banner'),s.synthetic?'合成互動原型 · 非真網址成果 · 無真背景任務／保存／發布':'真網址模式 · 來源摘錄，不呼叫模型 · 尚未保存或發布');
 try{setText($('site-name'),s.url?new URL(s.url).hostname:'尚未選擇來源');}catch{setText($('site-name'),'待核對網址');}
 $('source-submit').disabled=s.busy||s.synthetic;$('source-submit').setAttribute('aria-busy',String(s.busy));setText($('source-submit'),s.busy?'正在讀取來源…':'讀取公開來源');$('source-cancel').hidden=!s.busy;
 const message=['failed','unknown'].includes(s.phase)?failureText[s.error]||'已停止等待，來源服務結果未知；保留網址與先前成果。':s.phase==='running'?'正在等待來源回覆；離開本頁不保證工作繼續。':s.report?'來源成果已取得；工作區保存尚未開放。':'';
 setText($('source-feedback'),message);
 if(r&&r!==rendered){fields(r,v);sourceCards(r);rendered=r;if(!s.returned)viewName='result';}
 if(!r){rendered=null;$('result-fields').replaceChildren();}
 if(v){
  for(const key of reviewFields){const input=$('field-'+key),invalid=!v.fields[key].trim()||v.fields[key].length>2000;input.disabled=s.busy;input.setAttribute('aria-invalid',String(invalid));$('check-'+key).checked=v.fact_checks[key];$('check-'+key).disabled=s.busy||!s.sourceCurrent;
   setText($('field-note-'+key),v.edited[key]?'使用者修改；來源僅供對照，新增文字未核實。':'來源摘錄建議；仍需核對原站陳述。');setText($('field-error-'+key),invalid?'請填寫1–2000字，不能只有空白。':'');}
  setText($('review-state'),v.receipt?'本頁已確認 · 未保存 · 未發布':'待確認 · 未保存 · 未發布');
  setText($('result-binding'),(s.sourceCurrent?'成果來源：':'保留的舊成果來源（不屬於新輸入）：')+r.snapshot.final_url+' · 本頁第 '+v.revision+' 版');
  setText($('version-detail'),'來源版本：'+v.binding.source_version+'；內容版本：'+v.revision+'；確認範圍：僅本頁。');
  setText($('review-feedback'),v.pending?'正在核對確切版本…':v.receipt?'已完成本頁版本確認。重新整理會失去本頁編輯與確認。':s.sourceCurrent?'修改後舊確認失效；可稍後處理，未保存內容只在本頁。':'來源已變動或未讀完；舊成果保留，請先核對網址並重新讀取。');
  $('review-confirm').disabled=s.busy||v.pending||!v.canConfirm||!!v.receipt||!s.sourceCurrent;$('review-confirm').setAttribute('aria-busy',String(v.pending));
  setText($('summary-done'),v.receipt?'已取得來源，完成本頁第 '+v.revision+' 版確認；未保存。':'已取得有來源文本，本頁編輯仍待確認。');setText($('summary-decision'),v.receipt?'沒有新的內容決策；保存與發布尚未開放。':'接續核對目前版本；不重問已在本頁核對且未變更的欄位。');
 }
 const g=guidance(s);guideTarget=g;setText($('guide-owner'),g.owner);setText($('guide-reason'),g.reason);setText($('guide-action'),g.label||'請稍候');$('guide-action').hidden=!g.label;
 document.querySelectorAll('[data-stage]').forEach(el=>{const active=el.dataset.stage===(s.phase==='running'?'source':r?'review':'source');if(active)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
 const phases={start:'尚未開始',running:'正在讀取來源',review:'需要你確認',confirming:'正在核對本頁版本',failed:'讀取未完成',unknown:'結果未知／已停止等待',complete:'本頁確認完成'};
 setText($('task-phase'),(s.synthetic?'原型示範 · ':'')+(phases[s.phase]||'狀態未知'));
 setText($('task-operation'),s.taskId?'本頁請求來源：'+s.url+(r?'；最後成功成果：'+r.snapshot.final_url:''):'尚無執行中的作業。');
 setText($('task-updated'),s.updated?'最後事件：'+new Date(s.updated).toLocaleString('zh-TW',{hour12:false}):'尚無更新時間');setText($('task-id'),s.taskId||'尚無作業');
 if(s.returned)viewName='overview';selected();
}
$('source-form').addEventListener('submit',e=>{e.preventDefault();task.start();});
$('source-url').addEventListener('input',()=>task.setURL($('source-url').value));$('source-cancel').onclick=()=>task.cancel();
$('review-confirm').onclick=()=>task.confirm();$('later').onclick=()=>{task.revisit();$('return-result').focus();};$('return-result').onclick=()=>{select('result');$('result-heading').focus();};
$('guide-action').onclick=()=>{const g=guideTarget;if(g.action==='demo-review'){showScenario('review');return;}if(g.view)select(g.view);$(g.target)?.focus();};
function guide(open,returnFocus=false){if(open){$('site-nav').classList.remove('open');$('nav-toggle').setAttribute('aria-expanded','false');}$('guidance').hidden=!open;$('guide-toggle').setAttribute('aria-expanded',String(open));if(returnFocus)$('guide-toggle').focus();else if(open)$('guide-heading').focus();}
$('guide-toggle').onclick=()=>guide($('guidance').hidden);$('guide-close').onclick=()=>guide(false,true);
$('nav-toggle').onclick=()=>{const open=$('site-nav').classList.toggle('open');$('nav-toggle').setAttribute('aria-expanded',String(open));if(open&&innerWidth<768)guide(false);};
$('task-toggle').onclick=()=>{const open=$('task-details').hidden;$('task-details').hidden=!open;$('task-toggle').setAttribute('aria-expanded',String(open));setText($('task-toggle'),open?'最小化':'展開');};
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{select(b.dataset.view);$('site-nav').classList.remove('open');$('nav-toggle').setAttribute('aria-expanded','false');if(b.dataset.view==='overview')task.revisit();$('main').focus();};
async function showScenario(kind){const ticket=++sceneTicket;try{demo??=await fetch(new URL('./growth-console-demo.json',import.meta.url),{credentials:'omit'}).then(r=>r.json());if(ticket!==sceneTicket)return;await task.scenario(kind,demo);if(ticket!==sceneTicket)return;$('source-url').value=task.view().url;select(kind==='return'?'overview':['review','complete'].includes(kind)?'result':'overview');$('main').scrollTop=0;window.scrollTo(0,0);}catch{setText($('source-feedback'),'原型素材未能載入，沒有執行真網址工作。');}}
for(const b of document.querySelectorAll('[data-scenario]'))b.onclick=()=>showScenario(b.dataset.scenario);
$('exit-prototype').onclick=()=>{sceneTicket++;task.reset();$('source-url').value='';select('overview');$('source-url').focus();};
window.addEventListener('offline',()=>task.disconnect());
window.addEventListener('pagehide',()=>task.cancel());
window.addEventListener('beforeunload',e=>{if(task.view().report){e.preventDefault();e.returnValue='';}});
if(innerWidth<768)guide(false);$('task-details').hidden=true;$('task-toggle').setAttribute('aria-expanded','false');setText($('task-toggle'),'展開');
render(task.view());

// When enlarged text or the software keyboard consumes the viewport, use document
// flow instead of allowing fixed grid rows to squeeze/cover the main controls.
const reflow=()=>{const occupied=document.querySelector('.topbar').getBoundingClientRect().height+$('task-card').getBoundingClientRect().height;document.body.classList.toggle('flow-layout',innerWidth<768&&occupied>innerHeight*.55);};
const layoutObserver=new ResizeObserver(reflow);layoutObserver.observe(document.querySelector('.topbar'));layoutObserver.observe($('task-card'));window.addEventListener('resize',reflow);reflow();
