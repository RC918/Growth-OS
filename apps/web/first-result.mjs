const $=id=>document.getElementById(id),node=(tag,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
let current=null,epoch=0,controller=null;
const names={product_name:'產品名稱',title:'Title',meta_description:'Meta description',description:'產品描述',features:'特性',use:'用途',specifications:'规格',price:'價格',certifications:'認證',performance:'效果',comparisons:'比較',guarantees:'保證'};
const errors={page_complexity:"頁面結構超過安全解析上限。網址已保留，請改用較簡單的公開產品頁。",invalid_url:'請提供公開 HTTPS 產品網址。',private_target:'禁止內網、localhost 或非公開 IP。請選公開產品頁。',unsupported_query:'請改用沒有 query 參數的公開產品 canonical 網址。',restricted_content:'頁面需要登入或含密碼表單；請提供不需登入的公開產品頁。',timeout:'讀取超時。網址已保留，可重試或改用另一公開產品頁。',too_large:'頁面超過 1 MB。請使用較小的公開產品頁。',robots_unavailable:'無法核對 robots 規則，已停止讀取；可改用允許讀取的公開頁。',robots_disallowed:'網站不允許此讀取，請選其他公開來源。',not_html:'目前只支援公開 HTML 產品頁，請更換網址。',cross_domain_redirect:'網址轉到不同網域；請核對並直接提交目的站的公開產品網址。',too_many_redirects:'跳轉超過限制，請提供產品頁的最終網址。',dns_failed:'無法解析網域，請檢查拼字或稍後重試。',dns_busy:'解析服務忙碌，請稍後重試。',peer_mismatch:'實際連線與安全驗證位址不同，已停止讀取。',rate_limit:'本小時請求上限已到，請稍後重試。',busy:'目前有讀取正在處理，請稍後重試。',snapshot_capacity:'暫存來源容量已滿；請先匯出既有成果。'};
function report(text,error=false){$('source-feedback').textContent=text;$('source-feedback').classList.toggle('error',error);}
function clear(){current=null;$('result-section').hidden=true;$('source-fallback').replaceChildren();$('copy-fallback').hidden=true;}
function textPack(r){return Object.entries(r.preview.fields).map(([key,f])=>names[key]+':\n'+f.suggested).join('\n\n');}
function render(r){
 current=r;$('source-fallback').replaceChildren();
 if(!r.preview){
  const box=$('source-fallback');box.append(node('h2',r.page_type==='product'?'還缺必要的公開描述':'請選擇要改善的產品頁'));
  box.append(node('p',r.page_type==='product'?'已找到產品名稱，但沒有可支持的描述。請提供有公開描述的產品網址；不會產出占位文本。':'尚不能可靠辨識單一產品。只在這個缺口請你選擇產品；以下候選尚未驗證。'));
  for(const candidate of r.inferences.filter(v=>v.url)){const b=node('button','使用候選：'+candidate.label);b.type='button';b.addEventListener('click',()=>{$('source-url').value=candidate.url;$('source-form').requestSubmit();});box.append(b,node('p',candidate.url));}
  report('尚未產生成果；網址保留，請選產品候選或改用公開產品頁。');return;
 }
 $('result-section').hidden=false;const fields=$('result-fields');fields.replaceChildren();
 for(const [key,f] of Object.entries(r.preview.fields)){const card=node('article');card.className='field';card.append(node('h3',names[key]));const compare=node('div');compare.className='comparison';
  for(const [label,text] of [['原文',f.original||'來源未提供'],['建議',f.suggested]]){const col=node('div');col.append(node('strong',label));const p=node('p',text);p.className='copy-text';col.append(p);compare.append(col);}card.append(compare,node('p',f.reason),node('p','來源支持：'+f.citations.join('、')));fields.append(card);}
 $('result-missing').replaceChildren(...r.preview.pending_confirmation.map(v=>node('li',names[v]?names[v]+'：未抽取／未獨立核實，不加入額外宣稱。':v)));
 const s=r.snapshot;$('source-summary').replaceChildren(...['original_url','final_url','fetched_at','content_fingerprint'].map(k=>node('p',k+': '+s[k])));
 $('source-facts').replaceChildren(node('h3','Fact／Inference／Unknown'),node('p','Fact = 原站可觀察陳述；不是獨立驗證的真實性。'));
 for(const [key,f] of Object.entries(r.facts)){const values=Array.isArray(f)?f:[f];for(const item of values.filter(Boolean))$('source-facts').append(node('p','fact · '+(names[key]||key)+': '+item.value));}
 for(const item of r.inferences)$('source-facts').append(node('p','inference · '+item.value+' — '+item.basis));
 $('source-facts').append(node('p','unknown · '+r.missing.map(k=>names[k]||k).join('、')));
 $('source-citations').replaceChildren(...s.citations.map(c=>{const a=node('article');a.append(node('strong',c.id+' · '+c.locator),node('p','「'+c.quote+'」'),node('p',c.url+' · '+c.source_version));return a;}));
 report('第一份文本已備妥，請檢查來源及待確認資訊；尚未發布。');
}
$('source-form').addEventListener('submit',async event=>{
 event.preventDefault();controller?.abort();controller=new AbortController();const own=controller,ticket=++epoch;clear();$('source-submit').disabled=true;report('正在安全讀取公開頁與整理來源…');
 const timeout=setTimeout(()=>own.abort(),40000);
 try{const response=await fetch('/api/product-source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:$('source-url').value}),signal:own.signal});
  let r;try{r=await response.json();}catch{throw Error('backend_unavailable');}
  if(!response.ok)throw Error(r.code||'processing_failed');if(ticket===epoch)render(r);
 }catch(e){if(ticket===epoch)report(errors[e.message]||(e.name==='AbortError'?errors.timeout:'未收到完整成果。網址已保留；請重試或更換公開產品頁。'),true);}
 finally{clearTimeout(timeout);if(ticket===epoch){$('source-submit').disabled=false;$('source-feedback').focus();}}
});
$('source-url').addEventListener('input',()=>{epoch++;controller?.abort();controller=null;clear();$('source-submit').disabled=false;report('網址已修改；請重新取得成果。');});
$('copy-result').addEventListener('click',async()=>{
 if(!current?.preview)return;const ticket=epoch,text=textPack(current);
 try{await navigator.clipboard.writeText(text);if(ticket===epoch)report('已複製文本；請在套用前確認原站事實，尚未發布。');}
 catch{if(ticket===epoch){const area=$('copy-fallback');area.hidden=false;area.value=text;area.focus();area.select();report('瀏覽器未允許自動複製，請使用 Ctrl／⌘+C 複製已選取文本。');}}
});
$('export-result').addEventListener('click',()=>{
 if(!current?.preview)return;const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='growth-os-first-result-'+current.snapshot.version.slice(0,12)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);report('已匯出成果與可追溯來源；匯出不代表發布。');
});
