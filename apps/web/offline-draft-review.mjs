import {createOfflineDraftSession} from './offline-draft-session.mjs';
const $=id=>document.getElementById(id);
const node=(tag,text='',className='')=>{const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;};
let session=createOfflineDraftSession('parts'),generation=0,busy=false;
const errors={CONFIRMATION_REQUIRED:'請先確認目前草稿。',INVALID_TEXT:'請填寫 1 到 2000 字的內容。',UNVERIFIABLE_SOURCE:'來源已變動，請重新檢查來源與草稿。',VERSION_DRIFT:'模擬來源版本已變動，舊確認失效；請查看最新紀錄後重新確認。',DRAFT_CHANGED:'草稿已修改，請重新確認。'};
function report(text,error=false){$('draft-feedback').textContent=text;$('draft-feedback').classList.toggle('error',error);}
function button(text,style,action){const el=node('button',text,style);el.type='button';el.disabled=busy;el.addEventListener('click',action);return el;}
function render(){
 const view=session.view(),root=$('draft-review');root.replaceChildren();$('draft-fixture').disabled=busy;
 $('draft-source-text').textContent=view.history[0].answer_text;
 const phase=node('p',view.phase==='confirmed'?'本次草稿已確認 · 僅可模擬保存':view.phase==='cancelled'?'本次草稿已取消 · 沒有新增模擬紀錄':view.phase==='complete'?'兩項已模擬保存 · 資料仍未收集完整':'草稿待確認 · 尚未保存','pill');phase.id='draft-phase';root.append(phase);
 if(view.phase!=='cancelled')for(const field of view.fields){
  const card=node('section','','draft-source');const label=node('label',field.label);label.htmlFor='draft-'+field.key;
  const input=node('textarea');input.id='draft-'+field.key;input.value=field.value;input.maxLength=2000;input.disabled=busy;input.setAttribute('aria-describedby','source-'+field.key);
  input.addEventListener('input',()=>{session.edit(field.key,input.value);phase.textContent='草稿已修改 · 需要重新確認';$('draft-confirmed-state').textContent='修改後需要重新確認，舊確認已失效。';$('draft-save').disabled=true;origin.textContent='這項內容由你修改，來源保留供對照。';report('修改尚未保存；請重新確認目前草稿。');});
  const source=node('p',`來源版本 ${field.sourceVersion}：「${field.quote}」`,'hint');source.id='source-'+field.key;
  const origin=node('p',field.edited?'這項內容由你修改，來源保留供對照。':'手寫合成提議 · 尚未驗證推斷','hint');card.append(label,input,source,origin);root.append(card);
 }
 const state=node('p',view.confirmed?'確認綁定目前內容與來源版本；修改或保存後會失效。':'每次修改、取消或版本改變後，都需要重新確認。','hint');state.id='draft-confirmed-state';root.append(state);
 if(view.phase==='cancelled')root.append(button('重新查看草稿','secondary',()=>{session.reopen();render();report('請重新檢查與確認；取消前的確認不能沿用。');root.querySelector('textarea')?.focus();}));
 else if(view.phase!=='complete'){
  const actions=node('div','','actions');actions.append(button('確認目前草稿','secondary',()=>void run(()=>session.confirm(),'本次草稿已確認；尚未模擬保存。')));
  const save=button('模擬保存下一項','primary',()=>void run(()=>session.simulateSave(),'已追加並讀回本頁模擬版本；下一項需重新確認。'));save.id='draft-save';save.disabled=busy||!view.confirmed;actions.append(save);
  actions.append(button('取消本次草稿','quiet',()=>{session.cancel();render();report('已取消本次草稿，既有模擬紀錄保留。');$('draft-feedback').focus();}));root.append(actions);
 }
 root.append(node('p','仍待補充：'+view.missing.join('、')+'。尚未建立成長計畫或取得真實成長數據。','hint'));
 const history=$('draft-history');history.replaceChildren();for(const turn of view.history){const row=node('article','','observation-version');row.append(node('h3',`版本 ${turn.version_number} · ${turn.question_key==='goal'?'原始來源':turn.question_text}`),node('p',turn.answer_text,'draft-body'));history.append(row);}
}
async function run(operation,success){
 if(busy)return;const ticket=generation;busy=true;render();
 try{await operation();if(ticket===generation)report(success);}catch(error){if(ticket===generation)report(errors[error.message]||'模擬操作未完成，請重新檢查草稿；沒有遠端寫入。',true);}
 finally{if(ticket===generation){busy=false;render();$('draft-feedback').focus();}}
}
$('draft-fixture').addEventListener('change',()=>{generation++;busy=false;session=createOfflineDraftSession($('draft-fixture').value);render();report('已切換合成案例，本頁模擬紀錄已重設；沒有遠端資料變更。');});
render();report('先檢查來源與提議；確認不代表保存或發布。');
