import {createResultHandoff} from './first-result-handoff.mjs';
import {createResultReview,reviewFields} from './first-result-review.mjs';
const $=id=>document.getElementById(id),node=(tag,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
let current=null,review=null,epoch=0,controller=null,activeExport=null;
const previewOnly=()=>current?.page_type==='service'||current?.page_type==='software_application';
const handoff=createResultHandoff({button:$('handoff-result'),cancelButton:$('cancel-handoff'),getReview:()=>previewOnly()?null:review,isBusy:()=>!!controller,report:actionReport});
const names={product_name:'產品名稱',title:'Title',meta_description:'Meta description',description:'產品描述',features:'特性',use:'用途',specifications:'规格',price:'價格',certifications:'認證',performance:'效果',comparisons:'比較',guarantees:'保證'};
const errors={page_complexity:"頁面結構超過安全解析上限。網址已保留，請改用較簡單的公開產品頁。",invalid_url:'請提供公開 HTTPS 產品網址。',private_target:'禁止內網、localhost 或非公開 IP。請選公開產品頁。',unsupported_query:'請改用沒有 query 參數的公開產品 canonical 網址。',restricted_content:'頁面需要登入或含密碼表單；請提供不需登入的公開產品頁。',timeout:'讀取超時。網址已保留，可重試或改用另一公開產品頁。',too_large:'頁面超過 1 MB。請使用較小的公開產品頁。',robots_unavailable:'無法核對 robots 規則，已停止讀取；可改用允許讀取的公開頁。',robots_disallowed:'網站不允許此讀取，請選其他公開來源。',not_html:'目前只支援公開 HTML 產品頁，請更換網址。',cross_domain_redirect:'網址轉到不同網域；請核對並直接提交目的站的公開產品網址。',too_many_redirects:'跳轉超過限制，請提供產品頁的最終網址。',dns_failed:'無法解析網域，請檢查拼字或稍後重試。',dns_busy:'解析服務忙碌，請稍後重試。',peer_mismatch:'實際連線與安全驗證位址不同，已停止讀取。',rate_limit:'本小時請求上限已到，請稍後重試。',busy:'目前有讀取正在處理，請稍後重試。',snapshot_capacity:'暫存來源容量已滿，無法保存新成果。若本頁已有成功成果，仍可複製或匯出備份；匯出不會釋放容量。目前沒有自行清理功能。'};
function report(text,error=false){$('source-feedback').textContent=text;$('source-feedback').classList.toggle('error',error);}
function actionReport(text){$('result-feedback').textContent=text;}
function sourceBusy(busy){$('source-submit').setAttribute('aria-busy',String(busy));$('source-submit').textContent=busy?'正在取得成果…':'取得第一份成果';}
function idle(){controller=null;sourceBusy(false);$('source-submit').disabled=false;$('source-cancel').hidden=true;refreshReview();}
function cancel(message){epoch++;review?.invalidate();controller?.abort();idle();$('source-fallback').replaceChildren();report(message);}
function textPack(view){return reviewFields.map(key=>names[key]+':\n'+view.fields[key]).join('\n\n');}
function refreshReview(restore=false){
 handoff.invalidate();
 if(!review)return;const v=review.view();
 const limited=previewOnly();
 for(const id of ['review-confirm','export-result','handoff-result']){$(id).hidden=limited;$(id).disabled=limited;}
 $('result-title').textContent=limited?'服務／工具頁 · 來源對照與草稿預覽':'第一份搜尋內容改善包';
 $('result-scope').hidden=!limited;
 $('result-storage-hint').hidden=limited;
 if(activeExport&&(activeExport.review!==review||activeExport.token!==v.token)){
  activeExport.cancelled=true;$('export-result').disabled=false;actionReport('匯出期間內容或來源已變更，請重新匯出目前版本。');
 }
 $('review-state').textContent=v.receipt?'本頁已確認 · 未保存 · 未發布':'待確認 · 未保存 · 未發布';
 $('review-status').textContent=(v.pending?'正在綁定目前版本…':v.valid?'內容版本 '+v.revision+'；'+(v.receipt?'已確認目前內容與事實核對狀態。':'修改或來源變更後需重新確認。'):'三欄各需 1–2000 字；目前版本尚不能確認。')+' 僅本頁記憶體，重新整理會失去 Review。';
 $('review-confirm').setAttribute('aria-busy',String(v.pending));$('review-confirm').textContent=v.pending?'正在確認目前版本…':'確認目前版本';
 $('review-confirm').disabled=limited||!!controller||v.pending||!v.canConfirm||!!v.receipt;
 if(limited){$('review-state').textContent='僅草稿預覽 · 未保存 · 未發布';$('review-status').textContent='頁型：'+(current.page_type==='service'?'服務':'軟體工具')+'；來源文字不等於已驗證事實，文字差異不等於改善。';}
 for(const key of reviewFields){
  const input=$('review-'+key),check=$('review-check-'+key);if(!input)continue;
  const invalid=!v.fields[key].trim()||v.fields[key].length>2000;input.setAttribute('aria-invalid',String(invalid));$('review-error-'+key).textContent=invalid?names[key]+'需填寫 1–2000 字，不能只有空白。':'';
  if(restore)input.value=v.fields[key];input.disabled=!!controller;check.checked=v.fact_checks[key];check.disabled=!!controller;
  $('review-origin-'+key).textContent=v.edited[key]?'使用者修改；下列來源僅供對照，不代表支持新增文字。':'來源摘錄建議；仍需核對內容與原站事實。';
  if(limited){check.disabled=true;check.parentElement.hidden=true;const changed=v.fields[key]!==current.preview.fields[key].original;
   $('review-origin-'+key).textContent=v.edited[key]?(changed?'使用者修改；未核實、未證明改善，引用僅供對照。':'目前與原文相同；未產生改善。'):(changed?'來源整理；有文字差異，未證明改善。':'保留原文；未產生改善。');}
 }
}
function render(r){
 $('source-fallback').replaceChildren();
 if(!r.preview){
  if(r.page_type==='not_supported_service'){$('source-fallback').append(node('h2','無法可靠辨識單一服務／工具'),node('p',r.missing.join(' ')));report('本次未產生新草稿；網址與最後成功成果保留。');return;}
  const box=$('source-fallback');box.append(node('h2',r.page_type==='product'?'還缺必要的公開描述':'請選擇要改善的產品頁'));
  box.append(node('p',r.page_type==='product'?'已找到產品名稱，但無法將公開描述明確歸屬於此產品，或存在多份矛盾描述。請提供具明確產品名稱與描述的產品頁；不會借用配送或其他商品文字。':'尚不能可靠辨識單一產品。只在這個缺口請你選擇產品；以下候選尚未驗證。'));
  for(const candidate of r.inferences.filter(v=>v.url)){const b=node('button','使用候選：'+candidate.label);b.type='button';b.addEventListener('click',()=>{$('source-url').value=candidate.url;$('source-form').requestSubmit();});box.append(b,node('p',candidate.url));}
  report('本次未產生新成果；網址保留，請選產品候選或改用公開產品頁。');return;
 }
 const next=createResultReview(r);review?.invalidate();review=next;current=r;$('copy-fallback').hidden=true;actionReport('');
 $('retained-source').textContent='最後成功成果來源：'+r.snapshot.final_url+' · 版本 '+r.snapshot.version+'。新輸入、失敗或取消不會替換此成果；重新整理頁面將失去本頁保留內容，請匯出備份。';
 $('result-section').hidden=false;const fields=$('result-fields');fields.replaceChildren();
 for(const [key,f] of Object.entries(r.preview.fields)){
  const card=node('article');card.className='field';card.append(node('h3',names[key]));const compare=node('div');compare.className='comparison';
  const original=node('div');original.append(node('strong','原文'));const p=node('p',f.original||'來源未提供');p.className='copy-text';original.append(p);
  const suggested=node('div'),label=node('label','建議／目前編輯：'+names[key]);label.htmlFor='review-'+key;
  const input=node('textarea');input.id=label.htmlFor;input.value=f.suggested;input.maxLength=2000;input.className='copy-text review-input';input.setAttribute('aria-describedby','review-origin-'+key+' review-error-'+key);
  input.addEventListener('input',()=>{review.edit(key,input.value);$('copy-fallback').hidden=true;actionReport('');refreshReview();});
  const origin=node('p');origin.id='review-origin-'+key;const error=node('p');error.id='review-error-'+key;error.className='field-error';
  const checkLabel=node('label');checkLabel.className='review-check';const check=node('input');check.type='checkbox';check.id='review-check-'+key;
  check.addEventListener('change',()=>{review.check(key,check.checked);refreshReview();});checkLabel.append(check,node('span','已核對 '+names[key]+' 目前內容及相關事實'));
  suggested.append(label,input,error,origin,checkLabel);compare.append(original,suggested);card.append(compare,node('p','原建議理由：'+f.reason),node('p','原建議來源支持（修改後僅供對照）：'+f.citations.join('、')));fields.append(card);
 }
 refreshReview();
 $('result-missing').replaceChildren(...r.preview.pending_confirmation.map(v=>node('li',names[v]?names[v]+'：未抽取／未獨立核實，不加入額外宣稱。':v)));
 const s=r.snapshot;$('source-summary').replaceChildren(...['original_url','final_url','fetched_at','content_fingerprint'].map(k=>node('p',k+': '+s[k])));
 $('source-facts').replaceChildren(node('h3','Fact／Inference／Unknown'),node('p','Fact = 原站可觀察陳述；不是獨立驗證的真實性。'));
 for(const [key,f] of Object.entries(r.facts)){const values=Array.isArray(f)?f:[f];for(const item of values.filter(Boolean))$('source-facts').append(node('p','fact · '+(key==='entity_name'?'服務／工具名稱':names[key]||key)+': '+item.value));}
 for(const item of r.inferences)$('source-facts').append(node('p','inference · '+item.value+' — '+item.basis));
 $('source-facts').append(node('p','unknown · '+r.missing.map(k=>names[k]||k).join('、')));
 $('source-citations').replaceChildren(...s.citations.map(c=>{const a=node('article');a.append(node('strong',c.id+' · '+c.locator),node('p','「'+c.quote+'」'),node('p',c.url+' · '+c.source_version));return a;}));
 report(previewOnly()?'服務／工具草稿已備妥；請比較來源，保留原文的欄位未產生改善。':'第一份文本已備妥，請檢查來源及待確認資訊；尚未發布。');
}
$('source-form').addEventListener('submit',async event=>{
 event.preventDefault();if(controller)return;review?.invalidate();controller=new AbortController();refreshReview();const own=controller,ticket=++epoch;$('source-fallback').replaceChildren();$('source-submit').disabled=true;sourceBusy(true);$('source-url').removeAttribute('aria-invalid');$('source-cancel').hidden=false;report('正在安全讀取公開頁與整理來源…');
 const timeout=setTimeout(()=>own.abort(),40000);
 try{const response=await fetch('/api/service-source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:$('source-url').value}),signal:own.signal});
  let r;try{r=await response.json();}catch{throw Error('backend_unavailable');}
  if(!response.ok)throw Error(r.code||'processing_failed');if(ticket===epoch)render(r);
 }catch(e){if(ticket===epoch){if(['invalid_url','private_target','unsupported_query'].includes(e.message))$('source-url').setAttribute('aria-invalid','true');report(errors[e.message]||(e.name==='AbortError'?errors.timeout:'未收到完整成果。網址已保留；請重試或更換公開產品頁。'),true);}}
 finally{clearTimeout(timeout);if(ticket===epoch){idle();$('source-feedback').focus();}}
});
$('source-url').addEventListener('input',()=>{$('source-url').removeAttribute('aria-invalid');cancel('網址已修改；請重新取得成果。'+(current?'最後成功成果仍保留於下方。':''));});
$('source-cancel').addEventListener('click',()=>{cancel('已取消等待；網址已保留。'+(current?'最後成功成果仍保留於下方。':'')+'已送出的讀取可能仍會完成，但不會替換本頁成果。');$('source-feedback').focus();});
$('review-confirm').addEventListener('click',async()=>{
 if(!review||controller||previewOnly())return;const own=review,ticket=own.view().token;
 try{const task=own.confirm();refreshReview();const finished=await task;if(review===own&&own.view().token===finished.token)actionReport('本頁已確認目前版本；未保存、未發布，也不是發布授權。');}
 catch(e){if(review===own&&own.view().token===ticket)actionReport(e.message==='STALE_REVIEW'?'內容或來源已變更，舊確認已失效。':'目前版本無法確認，請核對內容與勾選狀態。');}
 finally{if(review===own)refreshReview();}
});
$('review-cancel').addEventListener('click',()=>{if(!review)return;review.cancel();$('copy-fallback').hidden=true;actionReport('已還原此來源的原建議；先前確認已失效。');refreshReview(true);});
$('copy-result').addEventListener('click',async()=>{
 if(!review)return;const own=review,view=own.view(),text=textPack(view);
 const same=()=>review===own&&own.view().token===view.token;
 try{await navigator.clipboard.writeText(text);if(same())actionReport('已複製目前可見版本；未保存、未發布。');}
 catch{if(same()){const area=$('copy-fallback');area.hidden=false;area.value=text;area.focus();area.select();actionReport('瀏覽器未允許自動複製，請使用 Ctrl／⌘+C 複製已選取文本。');}}
});
$('export-result').addEventListener('click',async()=>{
 if(!review||previewOnly()||(activeExport&&!activeExport.cancelled))return;const own=review,ticket=own.view().token,operation={review:own,token:ticket};activeExport=operation;$('export-result').disabled=true;
 try{
  const result=await own.export();if(review!==own||own.view().token!==ticket)return;
  const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='growth-os-first-result-'+result.snapshot.version.slice(0,12)+'-r'+result.review.revision+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  actionReport('已啟動目前可見版本與來源的匯出；匯出不釋放容量、不代表保存或發布。');
 }catch(e){if(review===own&&activeExport===operation)actionReport('匯出期間內容或來源已變更，請重新匯出目前版本。');}
 finally{if(activeExport===operation){activeExport=null;$('export-result').disabled=false;}}
});
