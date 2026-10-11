import {createR7WorkspaceApi} from './r7-workspace-api.mjs';
import {prepareW1Publication} from './w1-publication-preview.mjs';
const PILOT='https://wqepyttadrcnphtyjpjy.supabase.co';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const failure=(status,message)=>Object.assign(Error(message),{status});
// Native Auth and existing DB membership are authoritative. Never accept a role/actor from the UI.
export function createW1Api(config={}, {fetchImpl=fetch,now=Date.now}={}){
 let token=null,member=null,deadline=0,generation=0,sent=false,windowState=null,statusEpoch=0;
 const valid=config.accessEnabled===true&&config.origin===PILOT&&config.key?.startsWith('sb_publishable_')&&uuid(config.productId)&&/^https:\/\/[^/?#]+$/.test(config.redirectOrigin||'');
 const auth=valid?createR7WorkspaceApi({origin:PILOT,key:config.key,redirectOrigin:config.redirectOrigin,fetchImpl:(url,options)=>fetchImpl(url,{...options,redirect:'error',credentials:'omit'}),introSaveEnabled:false,introReadEnabled:false}):null;
 function clear(){generation++;statusEpoch++;windowState=null;token=null;member=null;deadline=0;auth?.signOut();}
 function requireSession(){if(!valid||!token||!member||now()>=deadline){clear();throw failure(401,'登入已失效，請重新登入');}}
 async function remote(path,{method='GET',body,anonymous=false}={}){
  if(!valid)throw failure(403,'工作區尚未開放');if(!anonymous)requireSession();const ticket=generation;
  const response=await fetchImpl(PILOT+path,{method,redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{apikey:config.key,...(!anonymous?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  if(ticket!==generation)throw failure(401,'登入工作階段已變更');
  if(!response.ok)throw failure(response.status,response.status===403?'此身分或目前寫入窗口沒有操作權限':response.status===401?'登入已失效，請重新登入':response.status===409?'版本已變更，請讀取最新版本':'操作未完成，請核對目前狀態');
  return response.status===204?null:response.json();
 }
 // writerEnabled is a fixed UI capability/kill switch, never authorization.
 // Only a fresh native status GET can make controls available; mutations still use the original DB gate.
 function canWrite(kind){if(config.writerEnabled!==true||member?.role!=='owner'||!token||now()>=deadline||!windowState||now()>=windowState.validUntil)return false;return kind==='answer'?windowState.answer_allowed&&windowState.answers_remaining>0:kind==='review'?windowState.review_allowed&&windowState.reviews_remaining>0:canWrite('answer')||canWrite('review');}
 async function refreshWriteStatus(){
  requireSession();const ticket=++statusEpoch,started=now();windowState=null;
  try{const s=await remote('/rest/v1/rpc/w1_writer_status?'+new URLSearchParams({p_product:config.productId}));
   if(ticket!==statusEpoch)throw failure(403,'寫入狀態已變更，請重新核對');
   if(!s||!Number.isFinite(s.server_time_ms)||typeof s.answer_allowed!=='boolean'||typeof s.review_allowed!=='boolean'||![s.answers_remaining,s.reviews_remaining].every(n=>Number.isInteger(n)&&n>=0&&n<=2))throw failure(403,'寫入狀態無效');
   const active=s.answer_allowed||s.review_allowed;
   if(active&&(s.product_id!==config.productId||!Number.isFinite(s.expires_at_ms)||s.expires_at_ms<=s.server_time_ms||s.expires_at_ms-s.server_time_ms>3600000||s.answer_allowed!==(s.answers_remaining>0)||s.review_allowed!==(s.reviews_remaining>0)))throw failure(403,'寫入狀態不符合此產品');
   windowState={...s,validUntil:active?Math.min(deadline,started+s.expires_at_ms-s.server_time_ms):started};
   return {answerAllowed:canWrite('answer'),reviewAllowed:canWrite('review')};
  }catch(e){if(ticket===statusEpoch)windowState=null;throw e;}
 }
 const api={available:()=>valid,context:()=>member,canWrite,refreshWriteStatus,clear,
  previewUrlPublication(version,{isCurrent}={}){return prepareW1Publication({version,isCurrent,context:()=>member,
   validate:async()=>{requireSession();if(member.role!=='owner')throw failure(403,'僅 Owner 可準備發布預覽');const user=await remote('/auth/v1/user');if(!uuid(user?.id))throw failure(403,'身份未核實');const members=await remote('/rest/v1/r7_members?'+new URLSearchParams({select:'organization_id,role',user_id:'eq.'+user.id,limit:'2'}));if(!Array.isArray(members)||members.length!==1||members[0].organization_id!==member?.organization_id||members[0].role!=='owner')throw failure(403,'工作區資格已變更');},
   readState:async()=>(await api.request('state'))[0],readHistory:()=>api.request('history?product='+config.productId),
   readReviews:s=>remote('/rest/v1/w1_reviews?'+new URLSearchParams({select:'id,organization_id,draft_id,actor',organization_id:'eq.'+member.organization_id,draft_id:'eq.'+s.draft_id,id:'eq.'+s.review_id,limit:'2'}))});},
  async authenticate(fragment){
   clear();if(!valid)throw failure(403,'工作區尚未開放');const ticket=generation,p=new URLSearchParams(fragment.replace(/^#/,''));
   const ttl=Number(p.get('expires_in'));if(!Number.isFinite(ttl)||ttl<=0||ttl>86400)throw failure(401,'登入連結無效');
   try{const verified=await auth.completeMagicLink(fragment);if(ticket!==generation)throw failure(401,'登入工作階段已變更');member=Object.freeze({...verified});token=p.get('access_token');deadline=now()+Math.min(ttl,3600)*1000;return member;}catch(e){if(ticket===generation)clear();throw e;}
  },
  async requestMagicLink(email){if(!valid||sent)throw failure(403,'目前不可寄送登入連結');if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254)throw failure(400,'請輸入有效電子郵件');sent=true;return remote('/auth/v1/otp?redirect_to='+encodeURIComponent(config.redirectOrigin+'/w1-workspace'),{method:'POST',anonymous:true,body:{email,create_user:false}});},
  async request(path,{method='GET',body}={}){
   requireSession();
   if(path==='login'&&method==='POST')return {access_token:'verified-session'}; // UI compatibility marker, never a JWT.
   if(path==='user'&&method==='GET')return {...member};
   if(path==='logout'&&method==='POST'){clear();return null;} // Memory-only sign-out, same existing R7 behavior.
   const scope={organization_id:'eq.'+member.organization_id};
   if(path==='state'&&method==='GET'){
    const rows=await remote('/rest/v1/w1_state?'+new URLSearchParams({select:'*',...scope,id:'eq.'+config.productId,limit:'2'}));
    if(!Array.isArray(rows)||rows.length!==1||rows[0].id!==config.productId||rows[0].organization_id!==member.organization_id)throw failure(403,'此工作區沒有已授權產品');return rows;
   }
   const h=/^history\?product=([0-9a-f-]+)$/i.exec(path),r=/^receipt\?request=([0-9a-f-]+)$/i.exec(path);
   if(h&&method==='GET'&&h[1]===config.productId)return remote('/rest/v1/w1_drafts?'+new URLSearchParams({select:'*',...scope,product_id:'eq.'+config.productId,order:'version.desc'}));
   if(r&&method==='GET'&&uuid(r[1])){const rows=await remote('/rest/v1/w1_requests?'+new URLSearchParams({select:'*',...scope,request_id:'eq.'+r[1],limit:'2'}));if(!Array.isArray(rows)||rows.length>1)throw failure(500,'回條不一致');return rows[0]||null;}
   if(['answer','review'].includes(path)&&method==='POST'){
    if(config.writerEnabled!==true||member.role!=='owner'||body?.p_org!==member.organization_id||body?.p_product!==config.productId||!uuid(body?.p_request))throw failure(403,'此身分或產品未開放寫入');
    const keys=path==='answer'?['p_org','p_product','p_request','p_expected','p_source','p_value']:['p_org','p_product','p_request','p_draft'];
    if(Object.keys(body).sort().join()!==keys.sort().join())throw failure(400,'操作欄位不正確');
    // Read-only precheck cannot consume an operation. If it fails, no mutation POST has been sent.
    try{await refreshWriteStatus();}catch{throw failure(403,'無法核對寫入窗口；未送出保存或確認');}
    if(!canWrite(path))throw failure(403,'目前窗口未開放此操作；未送出保存或確認');
    const ack=await remote('/rest/v1/rpc/'+(path==='answer'?'w1_change':'w1_review'),{method:'POST',body});
    if(windowState)windowState[path==='answer'?'answers_remaining':'reviews_remaining']--;
    return ack;
   }
   throw failure(403,'未開放的工作區操作');
  }
 };return api;
}
