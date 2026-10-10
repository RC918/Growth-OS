import {validateR7,R7} from './intro-r7-review.mjs';
export const candidateHash='3913033f19d0b9ccc1f1dac01693363aec56ee29d897d96c66fc7ac9b8c74c04';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const fail=()=>{throw Error('介紹版本或來源核對失敗');};
export async function validateIntroVersion(row,org){
 if(!row||row.kind!=='r7_static_intro'||row.organization_id!==org||!uuid(row.id)||!uuid(row.created_by)||!uuid(row.request_id)||!Number.isSafeInteger(row.version)||row.version<1||row.candidate_hash!==candidateHash||row.source_version!==R7.version||row.source_url!==R7.url||!Number.isFinite(Date.parse(row.created_at)))fail();
 const checked=await validateR7(row.frame);if(checked.candidateHash!==candidateHash)fail();
 if(row.confirmation!==null){const c=row.confirmation;if(!c||c.version_id!==row.id||c.version!==row.version||c.candidate_hash!==candidateHash||c.source_version!==R7.version||!uuid(c.actor_id)||!uuid(c.request_id)||!Number.isFinite(Date.parse(c.confirmed_at)))fail();}
 return structuredClone(row);
}
// Dedicated R7 RPC contract; no product-report coercion, client persistence or auth tokens.
export function createIntroSave({enabled=false,context,actor,request}){
 let pending=null;
 const guard=()=>{const s=context();if(enabled!==true)throw Error('介紹保存尚未啟用');if(!s||s.role!=='owner'||!uuid(s.organization_id)||!uuid(actor()))throw Error('需要已登入的工作區 Owner');return s;};
 function matches(p,row){
  if(!row||row.organization_id!==p.body.p_organization_id||row.candidate_hash!==p.body.p_candidate_hash||row.source_version!==p.body.p_source_version||row.source_url!==R7.url)return false;
  if(p.observed&&canonical(row)!==canonical(p.observed))return false;
  return p.action==='save'?row.version===p.body.p_expected_version+1&&row.request_id===p.body.p_request_id&&row.created_by===p.actor&&row.confirmation===null&&canonical(row.frame)===canonical(p.body.p_frame):canonical({...row,confirmation:null})===canonical({...p.base,confirmation:null})&&row.confirmation?.request_id===p.body.p_request_id&&row.confirmation?.actor_id===p.actor;
 }
 const current=s=>{if(context()!==s)throw Error('工作階段已變更；請重新讀回');};
 async function read(){const s=guard();const q=new URLSearchParams({select:'*',organization_id:'eq.'+s.organization_id,source_version:'eq.'+R7.version,candidate_hash:'eq.'+candidateHash,order:'version.desc',limit:'1'});const rows=await request('/rest/v1/intro_versions?'+q);current(s);if(!Array.isArray(rows)||rows.length>1)fail();const row=rows.length?await validateIntroVersion(rows[0],s.organization_id):null;current(s);return row;}
 async function mutate(action,frame,expected,{isCurrent=()=>true}={}){
 const s=guard(),who=actor();if(pending)throw Error('原操作結果未知；只可重新讀回');
 const frozen=structuredClone(frame),base=structuredClone(expected);
 if(action==='save'){if((await validateR7(frozen)).candidateHash!==candidateHash)fail();}
 if(base)await validateIntroVersion(base,s.organization_id);
 const fresh=await read();current(s);if(canonical(fresh)!==canonical(base))throw Error('版本已改變；請重新讀回及確認');
 if(action==='confirm'&&(!fresh||fresh.confirmation))throw Error('此版本無法再次確認');
 const body={p_organization_id:s.organization_id,p_request_id:crypto.randomUUID(),p_expected_version:fresh?.version||0,p_candidate_hash:candidateHash,p_source_version:R7.version,...action==='save'?{p_frame:frozen}:{p_version_id:fresh.id}};
 current(s);if(isCurrent()!==true)throw Error('保存意圖已失效；未送出');if(pending)throw Error('原操作結果未知；只可重新讀回');pending={session:s,body:structuredClone(body),base:structuredClone(fresh),action,actor:who};
 try{
 const row=await request('/rest/v1/rpc/'+(action==='save'?'save_r7_intro':'confirm_r7_intro'),{method:'POST',body});current(s);
 const valid=await validateIntroVersion(row,s.organization_id);current(s);
 if(!matches(pending,valid))fail();pending.observed=structuredClone(valid);
 const back=await read();if(!matches(pending,back))fail();pending=null;return back;
 }catch{throw Error('保存或確認結果未知；請只讀回，不重送');}
 }
 return {available:()=>enabled===true&&context()?.role==='owner',read,save:(frame,base,options)=>mutate('save',frame,base,options),confirm:(base,options)=>mutate('confirm',null,base,options),
 async reconcile(){const s=guard(),row=await read();if(pending){if(pending.session!==s)throw Error('工作階段已變更；請以新工作階段讀回');if(!matches(pending,row))throw Error('原操作尚未核實；不重送');pending=null;}return row;},
 reset(){pending=null;}};
}
