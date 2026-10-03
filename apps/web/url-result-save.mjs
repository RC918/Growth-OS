import {createTrialMarker} from './url-result-trial-marker.mjs';
import {contentDigest} from './first-result-review.mjs';
import {validateReport,copyJSON,canonical} from './first-result-payload.mjs';
const identity=p=>({original_url:p.snapshot.original_url,final_url:p.snapshot.final_url,snapshot_id:p.snapshot.id,source_version:p.snapshot.version,source_digest:p.snapshot.content_fingerprint});
const node=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};
// Directly mounted in the existing workspace. Bounded metadata only; no token transfer or auto-POST.
export function createUrlSavePanel({api,root,render,refresh,enabled=false,trial=null}) {
 // Revision trials use only the existing saved-version editor, never first Save/import.
 if(trial?.kind==='revision'){root.hidden=true;return {update(){},refreshing(){},open(){},close(){}};}
 let context=null,data=null,payload=null,intent=null,ticket=0,busy=false,unresolved=false,transfer=null,expectedWindow=window.opener;
 let trialChecked=false,trialAttempted=false,trialSaved=false,trialKnownId=null,trialReadError=false,timer=null;
 const marker=trial?createTrialMarker(trial):null;let markerError=false;
 function syncMarker(){try{const record=marker.read();trialAttempted=trialAttempted||record.attempted;trialKnownId=record.version_id||trialKnownId;}catch(e){markerError=true;throw e;}}
 function rememberTrial(id){trialKnownId=id;trialAttempted=true;try{marker.remember(id);}catch(e){markerError=true;throw e;}}
 const used=new Set();
 const title=node('h2','URL 成果 · 保存為待審草稿'),info=node('p','不需企業資料或核准機會；來源未獨立驗真，本頁確認不是發布授權。');
 const file=node('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','匯入成果與來源 JSON');
 const target=node('select');target.setAttribute('aria-label','保存歸屬');
 const confirm=node('button','確認保存待審草稿');confirm.type='button';confirm.id='save-url-result';
 const reconcile=node('button','只查詢保存結果');reconcile.type='button';reconcile.hidden=true;
 const feedback=node('p');feedback.setAttribute('role','status');feedback.id='url-save-feedback';
 const preview=node('div');preview.id='url-save-preview';root.append(title,info,file,target,confirm,reconcile,feedback,preview);
 function paint(){
  confirm.disabled=!enabled||context?.role!=='owner'||!payload||busy||unresolved||(trial&&(!trialChecked||trialAttempted||trialSaved||trialReadError||markerError||!api.boundSaveAvailable()));
  file.disabled=busy||unresolved||(trial&&(!trialChecked||trialAttempted||trialSaved||trialReadError||markerError));target.disabled=!!trial||busy||unresolved;reconcile.hidden=!(unresolved||(trial&&(markerError||trialReadError||(trialAttempted&&!trialSaved))));reconcile.disabled=busy;
 }
 function invalidate(message){ticket++;payload=null;busy=false;preview.replaceChildren();target.replaceChildren();if(!unresolved)intent=null;feedback.textContent=message+(unresolved?' 原保存結果未知，只可查詢原 request。':'');paint();}
 function chooseTargets(){
  target.replaceChildren();const fresh=node('option','新 URL 待審項目');fresh.value='';target.append(fresh);
  if(trial)return;
  for(const item of data?.opportunities??[])if(item.entry_kind==='url_result' && canonical(item.source_identity)===canonical(identity(payload))){
   const count=Math.max(0,...(data.versions??[]).filter(v=>v.opportunity_id===item.id).map(v=>v.version_number));
   const option=node('option',`追加至既有待審項目 · ${new Date(item.created_at).toLocaleString()} · 第 ${count} 版`);option.value=item.id;target.append(option);
  }
 }
 async function accept(value,receipt=null,own=++ticket){
  if(busy||unresolved||(trial&&(!trialChecked||trialAttempted||trialSaved||trialReadError||markerError)))throw Error('請先核對尚未確定的保存結果');
  payload=null;intent=null;preview.replaceChildren();paint();
  const frozen=copyJSON(value);await validateReport(frozen);
  if(trial&&await contentDigest(canonical(frozen))!=='sha256:'+trial.payload_canonical_sha256)throw Error('只接受已凍結的合成成果');
  if(own!==ticket)return false;
  payload=frozen;transfer=receipt;chooseTargets();
  preview.append(render({id:'尚未保存',version_number:1,title:frozen.preview.fields.title.suggested,draft_body:frozen.preview.fields.description.suggested,
   first_result_payload:frozen,first_result_request_id:'尚未保存',first_result_expected_version:0,first_result_request_digest:'尚未保存'}));
  feedback.textContent=enabled?'請核對工作區、來源與完整成果，再確認保存。':'成果已保留供核對；保存尚未開放。';paint();return true;
 }
 file.addEventListener('change',async()=>{if(busy||unresolved)return;const own=++ticket;payload=null;intent=null;preview.replaceChildren();paint();try{const f=file.files?.[0];if(!f)return;if(f.size>8388608)throw Error('成果檔過大');const text=await f.text();if(own!==ticket)return;await accept(JSON.parse(text),null,own);}catch(e){if(own===ticket){feedback.textContent=e.message;paint();}}});
 target.addEventListener('change',()=>{intent=null;});
 async function finish(row,own){
  if(own!==ticket||api.context()!==context)return;
  if(!row){feedback.textContent='結果仍未知；不會重試保存。請保留此頁，只查詢原 request。';return;}
  if(intent?.returned_version_id && row.id!==intent.returned_version_id)throw new Error('保存讀回不一致');
  if(trial){rememberTrial(row.id);trialSaved=true;}
  unresolved=false;preview.replaceChildren(render(row));payload=null;intent=null;
  feedback.textContent=`已保存第 ${row.version_number} 版 · ${row.id} · 待專用審核 · 未發布`;
  await refresh();
 }
 confirm.addEventListener('click',async()=>{
  if(confirm.disabled||api.context()!==context)return;
  const own=ticket;
  if(!intent){
   const selected=target.value;const item=data.opportunities.find(p=>p.id===selected);
   if(selected && (!item || item.entry_kind!=='url_result'||canonical(item.source_identity)!==canonical(identity(payload)))){feedback.textContent='保存歸屬已變更';return;}
   const versions=data.versions.filter(v=>v.opportunity_id===selected);
   const expected=selected?Math.max(0,...versions.map(v=>v.version_number)):0;
   if(selected&&!expected){feedback.textContent='缺少可核對的版本，請重新整理';return;}
   intent={organization_id:context.organization_id,opportunity_id:trial?.opportunity_id||selected||crypto.randomUUID(),request_id:trial?.request_id||crypto.randomUUID(),expected_version:trial?0:expected,payload:copyJSON(payload),returned_version_id:null};
  }
  const operation=intent,session=context;
  const live=()=>own===ticket&&intent===operation&&context===session&&api.context()===session&&(!trial||api.boundSaveAvailable());
  busy=true;unresolved=false;paint();feedback.textContent='正在驗證目前保存意圖；尚未送出。';
  try{
   const id=await api.saveUrlResult(operation,{isCurrent:live,onDispatch:()=>{if(trial){try{marker.attempt();trialAttempted=true;}catch(e){markerError=true;throw e;}}unresolved=true;feedback.textContent='保存中；未知結果只查詢，不重送。';paint();}});
   // Keep the acknowledged ID even if a refresh/cancel invalidated this render.
   // The same unresolved operation may still be reconciled by explicit GET.
   operation.returned_version_id=id;if(trial)rememberTrial(id);
   if(!live())return;
   await finish(await (trial?api.readBoundUrlResult(operation.returned_version_id):api.reconcileUrlResult(operation,operation.returned_version_id)),own);
  }
  catch(e){if(own===ticket)feedback.textContent=unresolved?`${e.message}；不會重試或更換 request。請只查詢保存結果。`:`${e.message}；保存未送出。`;}

  finally{if(own===ticket){busy=false;paint();}}
 });
 async function probeTrial(){
  if(!trial||!context)return;const own=ticket,session=context;busy=true;trialChecked=false;paint();feedback.textContent='先查詢固定 request；不會自動保存。';
  try{try{syncMarker();}catch{}const row=await api.readBoundUrlResult(trialKnownId);if(own!==ticket||context!==session||api.context()!==session)return;trialChecked=true;trialReadError=false;
   if(markerError)throw Error('驗收防重送標記不可確認；只可查詢，不可保存');
   if(row){rememberTrial(row.id);trialSaved=true;unresolved=false;intent=null;payload=null;preview.replaceChildren(render(row));feedback.textContent=`已保存第 ${row.version_number} 版 · ${row.id} · 唯讀取回 · 未發布`;}
   else{feedback.textContent=trialAttempted?'結果仍未知；只可查詢原 request，不再保存。':'未找到固定版本；可匯入凍結成果後確認首次保存。';}
  }catch(e){if(own===ticket){trialReadError=true;feedback.textContent=e.message+'；只可重新查詢。';}}finally{if(own===ticket){busy=false;paint();}}
 }
 reconcile.addEventListener('click',async()=>{
  if(trial){if(!busy)await probeTrial();return;}
  if(busy||!unresolved||!intent||api.context()!==context)return;const own=ticket;busy=true;paint();
  try{await finish(await api.reconcileUrlResult(intent,intent.returned_version_id),own);}catch(e){if(own===ticket)feedback.textContent=e.message;}finally{if(own===ticket){busy=false;paint();}}
 });
 window.addEventListener('message',async event=>{
  if(event.origin!==location.origin||!expectedWindow||event.source!==expectedWindow)return;
  const m=event.data;
  if(m?.type==='url-result-cancel' && transfer===m.nonce){invalidate('來源頁已變更或取消交接；請重新匯入／交接。已送出的保存需另行唯讀核對。');transfer=null;return;}
  if(m?.type!=='url-result-offer'||typeof m.nonce!=='string'||! /^[0-9a-f-]{36}$/.test(m.nonce)||used.has(m.nonce))return;
  if(busy||unresolved)return;
  used.add(m.nonce);transfer=m.nonce;const own=++ticket;
  try{if(await accept(m.payload,m.nonce,own))event.source.postMessage({type:'url-result-accepted',nonce:m.nonce},location.origin);}catch(e){if(own===ticket)feedback.textContent=e.message;}
 });
 paint();
 return {
  update(next){data=next;},
  refreshing(){ticket++;busy=false;preview.replaceChildren();if(unresolved){feedback.textContent='資料已刷新；原保存結果尚未確定，只可查詢。';}else{payload=null;intent=null;target.replaceChildren();}paint();},
  open(next){expectedWindow=window.opener;const changed=context&&context!==api.context();if(changed)invalidate('工作區已變更，請重新交接成果');context=api.context();data=next;if(payload)chooseTargets();
   if(!payload)feedback.textContent=enabled?'可從原成果頁交接，或匯入完整成果 JSON。':'URL 保存尚未開放；可先匯入核對。';paint();
   if(trial){void probeTrial().then(()=>{if(context&&trialChecked&&!trialSaved&&!trialAttempted)expectedWindow?.postMessage({type:'url-result-ready'},location.origin);});if(!timer)timer=setInterval(paint,500);}
   else expectedWindow?.postMessage({type:'url-result-ready'},location.origin);
  },
  close(){if(timer){clearInterval(timer);timer=null;}trialChecked=false;expectedWindow=null;context=null;data=null;transfer=null;unresolved=false;invalidate('已登出或離開；原成果頁與匯出檔仍可保留成果。');},
 };
}
