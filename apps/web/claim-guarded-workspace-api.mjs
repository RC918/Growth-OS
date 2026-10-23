// Client integration only. This is not server-side bypass resistance or Auth/RLS proof.
import {createWorkspaceApi as createBaseApi,contentVersionKind} from './workspace-api.mjs';
import {copyJSON,canonical} from './first-result-payload.mjs';
import {assertSavedClaims} from './saved-claim-context.mjs';
export {contentVersionKind};

export function createWorkspaceApi(options){
 const base=createBaseApi(options);
 let busy=false,pending=null;
 const api={...base};
 async function guarded(kind,input,opts,run){
  if(busy||pending)throw Error('已有操作等待核對；只可讀取原 request，不會重送');
  const session=base.context(),candidate=copyJSON(input);
  if(!session||session.role!=='owner')throw Error('只有目前工作區擁有者可以執行此操作');
  const live=()=>base.context()===session&&typeof opts?.isCurrent==='function'&&opts.isCurrent()===true;
  if(!live())throw Error('操作或工作階段已失效');
  busy=true;
  try{
   const payload=kind==='review'?candidate.first_result_payload:kind==='revision'?candidate.request?.payload:candidate.payload;
   await assertSavedClaims(payload);
   if(!live())throw Error('內容或工作階段已變更；未送出');
   return await run(candidate,{...opts,isCurrent:live,onDispatch:()=>{
    if(!live())throw Error('操作已取消或工作階段已變更；未送出');
    pending={kind,candidate};
    opts?.onDispatch?.();
   }});
  }finally{busy=false;}
 }
 api.saveUrlResult=(input,opts)=>guarded('save',input,opts,(v,o)=>base.saveUrlResult(v,o));
 api.saveUrlRevision=(input,opts)=>guarded('revision',input,opts,(v,o)=>base.saveUrlRevision(v,o));
 api.confirmUrlReview=(version,checks,opts)=>{
  const captured=copyJSON(checks);
  return guarded('review',version,opts,(v,o)=>base.confirmUrlReview(v,captured,o));
 };
 // Resolve only after the original API validates an exact readback. All recovery
 // stays GET-only. Logout and errors deliberately do not clear an unknown write.
 api.reconcileUrlResult=async(input,...args)=>{
  const row=await base.reconcileUrlResult(input,...args);
  const request=v=>Object.fromEntries(['organization_id','opportunity_id','request_id','expected_version','payload'].map(k=>[k,v[k]]));
  if(row&&pending?.kind==='save'&&canonical(request(input))===canonical(request(pending.candidate)))pending=null;
  return row;
 };
 api.recoverUrlRevision=async(...args)=>{
  const row=await base.recoverUrlRevision(...args);
  if(row&&pending?.kind==='revision'&&row.first_result_request_id===pending.candidate.request.request_id)pending=null;
  return row;
 };
 api.readUrlReview=async(version,...args)=>{
  const row=await base.readUrlReview(version,...args);
  if(row&&pending?.kind==='review'&&canonical(version)===canonical(pending.candidate))pending=null;
  return row;
 };
 return api;
}
