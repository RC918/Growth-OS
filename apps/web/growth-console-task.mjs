// One browser-owned URL request and the existing page-only Review, never a scheduler.
import {createResultReview,reviewFields} from './first-result-review.mjs';
import {validateReport,freeze} from './first-result-payload.mjs';
import {evaluateConsoleClaims} from './console-claim-review.mjs';
export const failureText={invalid_url:'請使用公開 HTTPS 產品頁網址。',private_target:'此網址不符合公開來源安全規則。',unsupported_query:'請改用沒有參數的公開產品網址。',restricted_content:'來源需要登入，請選不需登入的公開產品頁。',robots_disallowed:'來源不允許此讀取，請選其他公開產品頁。',robots_unavailable:'無法核對來源的讀取規則，已停止。',timeout:'來源讀取逾時，網址與先前成果仍保留。',not_html:'目前僅支援公開 HTML 產品頁。',too_large:'來源超過讀取上限，請選較小的產品頁。',rate_limit:'目前讀取次數已達上限，請稍後再試。',unsupported:'尚無可可靠歸屬的單一產品描述；請改用明確的產品頁。',backend_unavailable:'這個入口尚未連接可用的來源服務；網址與先前成果仍保留。',invalid_report:'來源與成果版本未通過核對，沒有採用這份回應。',network:'連線中斷或未收到完整結果；目前結果未知，未自動重送。'};
export function createConsoleTask({load,claimCheck=evaluateConsoleClaims,now=()=>new Date().toISOString(),id=()=>crypto.randomUUID(),changed=()=>{}}){
 let generation=0,controller=null,review=null,report=null;
 let claimEpoch=0,claimReview={status:'STALE',result:null};
 let state={phase:'start',taskId:null,url:'',updated:null,error:null,synthetic:false,returned:false,sourceCurrent:false};
 const emit=()=>{changed(view());};
 function view(){return {...state,busy:!!controller,report,review:review?.view()||null,claimReview:structuredClone(claimReview)};}
 function event(phase,extra={}){state={...state,...extra,phase,updated:now()};emit();}
 function invalidateClaims(){claimEpoch++;claimReview={status:'STALE',result:null};}
 function invalidate(){generation++;controller?.abort();controller=null;review?.invalidate();invalidateClaims();}
 async function checkClaims(){
  if(!review||controller||!state.sourceCurrent)return;
  invalidateClaims();review.invalidate();const epoch=claimEpoch,ticket=generation,own=review,source=report,snapshot=own.view();
  claimReview={status:'CHECKING',result:null};event('review',{returned:false});
  const current=()=>epoch===claimEpoch&&ticket===generation&&review===own&&report===source&&own.view().revision===snapshot.revision&&state.sourceCurrent;
  let checked=false;
  try{
   const result=await Promise.resolve().then(()=>claimCheck({report:structuredClone(source),fields:snapshot.fields}));
   if(current()){claimReview={status:'CHECKED',revision:snapshot.revision,result:structuredClone(result)};checked=true;}
  }catch{if(current())claimReview={status:'ERROR',result:null};}
  if(current())emit();
  // A caller that resumes later must recheck this captured scope, not borrow
  // whatever global review/check happens to be current after its await.
  return checked?current:null;
 }
 function cancelClaimCheck(){if(claimReview.status!=='CHECKING')return;invalidateClaims();review?.invalidate();event('review');}
 function setURL(url){invalidate();state={...state,url,sourceCurrent:false,returned:false,error:null,phase:report?'review':'start',updated:now()};emit();}
 async function accept(value,ticket){
  if(!value?.preview)throw Error('unsupported');
  let candidate;try{candidate=createResultReview(value);await validateReport(await candidate.export());}catch{throw Error('invalid_report');}
  if(ticket!==generation)return false;
  review?.invalidate();invalidateClaims();review=candidate;report=freeze(structuredClone(value));return true;
 }
 async function start(){
  if(controller||state.synthetic)return;
  invalidate();const ticket=generation,own=new AbortController();controller=own;
  event('running',{taskId:id(),error:null,returned:false,sourceCurrent:false});
  const timeout=setTimeout(()=>own.abort(),40000);
  try{const requested=state.url;const value=await load(requested,own.signal);if(value?.snapshot?.original_url!==new URL(requested.trim()).href)throw Error('invalid_report');if(await accept(value,ticket)){controller=null;event('review',{sourceCurrent:true});await checkClaims();}}
  catch(error){if(ticket===generation){controller=null;event(error.name==='AbortError'?'unknown':'failed',{error:error.name==='AbortError'?'timeout':Object.hasOwn(failureText,error.message)?error.message:'network'});}}
  finally{clearTimeout(timeout);if(ticket===generation)controller=null;}
 }
 function cancel(){if(!controller)return;invalidate();event('unknown',{error:null,sourceCurrent:false});}
 function edit(key,value){if(!review||controller)return;review.edit(key,value);invalidateClaims();event('review',{returned:false});void checkClaims();}
 function check(key,value){if(!review||controller||!state.sourceCurrent)return;review.check(key,value);event('review',{returned:false});}
 async function confirm(){
  if(!review||controller||!state.sourceCurrent||review.view().pending||review.view().receipt
    ||claimReview.status!=='CHECKED'||claimReview.revision!==review.view().revision
    ||!['PASS','PASS_WITH_REVIEW'].includes(claimReview.result?.decision))return;
  const own=review,ticket=generation,token=own.view().token;
  const pending=own.confirm();event('confirming');
  try{const v=await pending;if(ticket===generation&&review===own&&own.view().token===v.token)event('complete',{error:null});}
  catch{if(ticket===generation&&review===own&&own.view().token===token)event('review',{error:'invalid_report'});}
 }
 function revisit(){event(state.phase,{returned:true});}
 function disconnect(){if(controller){invalidate();event('unknown',{error:'network',sourceCurrent:false});}}
 async function scenario(kind,value){
  invalidate();review=null;report=null;const ticket=generation;
  state={phase:'start',taskId:'prototype-'+kind,url:'https://example.com/products/bolt',updated:now(),error:null,synthetic:true,returned:kind==='return',sourceCurrent:false};
  if(['review','complete','return','failed'].includes(kind)){
   if(!await accept(value,ticket))return;
   state.sourceCurrent=true;
   const own=review,revision=own.view().revision,checkCurrent=await checkClaims();
   const current=()=>ticket===generation&&review===own&&own.view().revision===revision&&checkCurrent?.();
   if(!current())return;
   if(kind==='complete'||kind==='return'){
    for(const key of reviewFields)own.check(key,true);
    await confirm();
    if(!current())return;
   }
  }
  if(ticket!==generation)return;
  event(kind==='return'?'complete':kind,kind==='failed'?{error:'network',sourceCurrent:false}:kind==='return'?{returned:true}:{});
 }
 function reset(){invalidate();review=null;report=null;state={phase:'start',taskId:null,url:'',updated:null,error:null,synthetic:false,returned:false,sourceCurrent:false};emit();}
 async function exportHandoff(){
  const own=review,ticket=generation,epoch=claimEpoch,snapshot=own?.view();
  const current=()=>ticket===generation&&review===own&&claimEpoch===epoch&&own.view().token===snapshot.token&&state.sourceCurrent&&!state.synthetic&&!controller&&claimReview.status==='CHECKED'&&claimReview.revision===snapshot.revision&&['PASS','PASS_WITH_REVIEW'].includes(claimReview.result?.decision)&&!!snapshot.receipt;
  if(!own||!current())throw Error('請先完成目前來源與內容的本頁確認');
  const payload=await own.export();
  if(!current())throw Error('成果已變更；請重新核對後交接');
  return payload;
 }
 // Stable facade for the existing same-origin, nonce/window-bound handoff.
 const handoffReview={view:()=>({token:generation+':'+claimEpoch+':'+(review?.view().token??'none')}),export:exportHandoff};
 function getHandoffReview(){const s=view();return !s.synthetic&&s.sourceCurrent&&s.review?.receipt&&s.claimReview.status==='CHECKED'&&['PASS','PASS_WITH_REVIEW'].includes(s.claimReview.result?.decision)?handoffReview:null;}
 return {view,setURL,start,cancel,edit,check,checkClaims,cancelClaimCheck,confirm,revisit,disconnect,scenario,reset,exportHandoff,getHandoffReview};
}
