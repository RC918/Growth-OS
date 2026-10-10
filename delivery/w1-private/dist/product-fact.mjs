import {hostedFetch,boot,workspace} from './w1-workspace-boot.mjs';
let token=null,rows=[],current=null,pending=null,busy=false,epoch=0;
const $=id=>document.getElementById(id),copy=x=>JSON.parse(JSON.stringify(x));
async function api(path,{method='GET',body}={}){
 const r=await hostedFetch(path,{method,redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000),headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok){const e=Error(r.status===401?'登入已失效，請重新登入':r.status===403?'此身分沒有操作權限':r.status===409?'版本已變更，請讀取最新版本':'操作未完成，請核對目前狀態');e.status=r.status;throw e;}
 return r.json();
}
const feedback=text=>{$('feedback').textContent=text;};
function lock(){$('skip').hidden=current?.answer!=='unknown';for(const id of ['save','skip','review','correct','refresh','product','answer','review-check'])$(id).disabled=busy||!!pending||(['save','skip','correct'].includes(id)&&!workspace.canWrite('answer')||id==='review'&&!workspace.canWrite('review'));$('reconcile').hidden=!pending;$('reconcile').disabled=busy;for(const id of ['save','skip','review'])$(id).setAttribute('aria-busy',String(busy));}
function render(){
 current=rows.find(x=>x.id===$('product').value);if(!current)return;
 $('product-name').textContent=current.name;$('scope').textContent=`市場：${current.market} · 渠道：${current.channel} · 僅此產品`;
 $('draft').textContent=current.body||`${current.name}：戶外適用性未知，初步候選未加入戶外使用宣稱。`;
 $('state').textContent=`答案第 ${current.fact_version} 版 · 草稿第 ${current.draft_version||0} 版 · ${current.review_valid?'此確切版已確認':'待確認（舊確認不適用）'} · 未發布`+(current.is_conflict?' · 網站觀察與商家答案衝突，禁止確認；已保留商家答案。':current.source_changed?' · 來源已變更，須重新核對。':'');
 $('evidence').textContent=JSON.stringify({source:{url:current.source_url,quote:current.source_quote,version:current.source_version,observed_outdoor:current.observed_outdoor},answer:{value:current.answer,version:current.fact_version,kind:current.source_kind,confirmed_at:current.confirmed_at,source_version:current.fact_source_version,source_quote:current.fact_source_quote,source_url:current.fact_source_url,market:current.fact_market,channel:current.fact_channel},scope:{organization:current.organization_id,product:current.id,market:current.market,channel:current.channel},draft:current.draft_id},null,2);
 $('answer').value=current.answer==='unknown'?'':current.answer;$('answer').removeAttribute('aria-invalid');
 $('answer-form').hidden=current.answer!=='unknown';$('correct').hidden=current.answer==='unknown'||!workspace.canWrite('answer');
 $('review-check').checked=false;$('review-panel').hidden=!current.draft_id||current.review_valid||current.is_conflict||current.source_changed||!workspace.canWrite('review');lock();
}
async function read(){const own=epoch;const next=await api('state');if(own!==epoch)return;rows=next;const selected=pending?.body.p_product||$('product').value;$('product').replaceChildren(...rows.map(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=x.name+' / '+x.market;return o;}));if(rows.some(x=>x.id===selected))$('product').value=selected;render();await history();}
async function history(){if(!current)return;const id=current.id,own=epoch;const versions=await api('history?product='+encodeURIComponent(id));if(own!==epoch||current?.id!==id)return;$('history').replaceChildren(...versions.map(x=>{const p=document.createElement('p');p.textContent=`保留草稿第 ${x.version} 版：${x.body}`;return p;}));}
function clear(){epoch++;token=null;rows=[];current=null;busy=false;$('result').hidden=true;$('logout').hidden=true;$('login').hidden=true;$('email-form').hidden=false;$('actor').disabled=!!pending;$('auth-status').textContent=pending?'已登出；原操作待核對。請以原身分重新登入，只核對原 request，不會重送。':'已登出，請以全新登入讀回保存結果。';$('evidence').textContent='';$('history').replaceChildren();feedback('');}
$('login').onclick=async()=>{const own=++epoch;$('login').disabled=true;try{const s=await api('login',{method:'POST',body:{actor:$('actor').value}});if(own!==epoch)return;token=s.access_token;await api('user');await read();$('result').hidden=false;$('logout').hidden=false;$('email-form').hidden=true;$('login').hidden=true;$('actor').disabled=true;$('auth-status').textContent='已驗證既有 Auth 與工作區資格；寫入仍受伺服器窗口限制。';if(pending){feedback('原操作仍待核對；請只核對原操作結果，不會重送。');lock();}}catch(e){clear();$('auth-status').textContent=e.message;}finally{$('login').disabled=false;}};
$('logout').onclick=async()=>{try{await api('logout',{method:'POST',body:{}});}finally{clear();}};
window.addEventListener('pagehide',clear);
$('product').onchange=()=>{feedback('');render();history().catch(e=>feedback(e.message));};
$('correct').onclick=()=>{$('answer-form').hidden=false;$('answer').focus();};
$('refresh').onclick=()=>read().catch(e=>feedback(e.message));
async function finish(){
 const op=pending,own=epoch;if(!op)return;
 const receipt=await api('receipt?request='+op.body.p_request);if(own!==epoch||pending!==op)return;
 if(!receipt||receipt.request_id!==op.body.p_request||receipt.organization_id!==op.body.p_org||receipt.input?.kind!==op.kind||receipt.input.product!==op.body.p_product)throw Error('原操作尚未查得；保持待核對，不會重送。');
 if(op.kind==='answer'&&(receipt.input.expected!==op.body.p_expected||receipt.input.source!==op.body.p_source||receipt.input.value!==op.body.p_value))throw Error('操作回條不一致');
 if(op.kind==='review'&&receipt.input.draft!==op.body.p_draft)throw Error('確認回條不一致');
 if(receipt.result?.request_id!==op.body.p_request||op.ack&&JSON.stringify(receipt.result,Object.keys(receipt.result).sort())!==JSON.stringify(op.ack,Object.keys(op.ack).sort()))throw Error('保存回條與原操作回覆不一致，保持待核對。');
 await read();if(own!==epoch||pending!==op)return;
 // Historical receipt must never label a newer draft as confirmed.
 const matches=op.kind==='answer'?current?.fact_id===receipt.result.fact_id&&current?.draft_id===receipt.result.draft_id&&current?.fact_version===op.body.p_expected+1&&current?.answer===op.body.p_value:current?.draft_id===receipt.result.draft_id&&current?.review_valid;
 pending=null;feedback(!matches?'原操作已完成；目前已有較新版本或來源變動，請核對最新狀態。':op.kind==='answer'?`已保存答案並建立第 ${receipt.result.version} 版草稿。${op.body.p_value==='unknown'?'答案仍未知，已避開戶外宣稱。':'只更新此產品與市場的戶外描述；舊確認已失效。商家確認不等於外部驗證。'}`:'此確切版內容已確認，尚未發布。');lock();
}
async function mutate(kind,value){if(busy||pending||!current)return;const own=epoch;const body={p_org:current.organization_id,p_product:current.id,p_request:crypto.randomUUID(),...(kind==='answer'?{p_expected:current.fact_version,p_source:current.source_version,p_value:value}:{p_draft:current.draft_id})};pending={kind,body:copy(body)};busy=true;lock();feedback('正在保存並核對…');let phase='post';const op=pending;try{const ack=await api(kind,{method:'POST',body});op.ack=copy(ack);phase='readback';if(own!==epoch)return;await finish();}catch(e){if(own===epoch){if(phase==='post'&&[400,401,403,409].includes(e.status)){pending=null;feedback(e.message+'；此操作已拒絕，輸入保留。讀取最新版本後再核對。');}else feedback(e.message+'；結果待核對，只查原操作，不會重送。');}}finally{if(own===epoch){busy=false;lock();}}}
$('answer-form').onsubmit=e=>{e.preventDefault();if(!$('answer').value){$('answer').setAttribute('aria-invalid','true');feedback('請選擇支援／不支援，或使用稍後回答。');$('answer').focus();return;}mutate('answer',$('answer').value);};
$('skip').onclick=()=>mutate('answer','unknown');
$('review').onclick=()=>{if(!$('review-check').checked){feedback('請先核對並勾選目前確切版本。');$('review-check').focus();return;}mutate('review');};
$('reconcile').onclick=async()=>{busy=true;lock();try{await finish();}catch(e){feedback(e.message);}finally{busy=false;lock();}};

function repaintWritePolicy(){if(!current)return;$('correct').hidden=current.answer==='unknown'||!workspace.canWrite('answer');$('review-panel').hidden=!current.draft_id||current.review_valid||current.is_conflict||current.source_changed||!workspace.canWrite('review');lock();}
export function startWorkspace(){return boot({repaint:repaintWritePolicy}).catch(error=>{workspace.clear();throw error;});}
