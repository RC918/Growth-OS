// Only fixed acceptance metadata in this same-origin tab. Never payload or auth data.
import {canonical} from './first-result-payload.mjs';
export const trialMarkerKey='growth-os:url-bound-attempt:v1';
export function createTrialMarker(trial,storage=()=>window.sessionStorage){
 const scope={organization_id:trial.organization_id,opportunity_id:trial.opportunity_id,request_id:trial.request_id,expires_at:trial.expires_at,workspace_url:trial.workspace_url,request_digest:trial.request_digest};
 let failed=false,initialized=false,last=null;
 const fail=()=>{failed=true;throw Error('驗收防重送標記不可確認；只可查詢，不可保存');};
 function check(value){
  if(!value||canonical(Object.keys(value).sort())!==canonical(['attempted','scope','version_id'].sort())||canonical(value.scope)!==canonical(scope)||typeof value.attempted!=='boolean'||!(value.version_id===null||typeof value.version_id==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.version_id))||(!value.attempted&&value.version_id!==null))fail();
  if(last?.attempted&&!value.attempted||last?.version_id&&last.version_id!==value.version_id)fail();
  return value;
 }
 function write(value){
  try{const store=storage(),text=JSON.stringify(value);store.setItem(trialMarkerKey,text);if(store.getItem(trialMarkerKey)!==text)fail();last=value;initialized=true;return value;}catch{fail();}
 }
 function read(){
  if(failed)fail();
  try{const raw=storage().getItem(trialMarkerKey);if(raw===null){if(initialized)fail();return write({scope,attempted:false,version_id:null});}last=check(JSON.parse(raw));initialized=true;return last;}catch{fail();}
 }
 return {
  read,
  attempt(){const current=read();if(current.attempted)fail();return write({...current,attempted:true});},
  remember(id){const current=read();if(current.version_id&&current.version_id!==id)fail();return write(check({...current,attempted:true,version_id:id}));},
 };
}

// One unresolved revision in the existing same-origin/tab sessionStorage backend.
// Separate key; the reviewed fixed-trial marker above is unchanged.
export const revisionMarkerKey='growth-os:url-revision-attempt:v1';
export function createRevisionMarker(storage=()=>globalThis.sessionStorage){
 let failed=false,initialized=false,last=null;
 const fail=()=>{failed=true;throw Error('續編防重送標記不可確認；禁止保存');};
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
 const digest=v=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
 const keys=['actor_id','organization_id','opportunity_id','base_version_id','base_request_digest','base_payload_digest','request_id','expected_version','source_digest','content_digest','payload_digest','intent_digest','known_id','resolved'];
 function check(value){
  if(!value||canonical(Object.keys(value).sort())!==canonical(['operation','schema_version'])||value.schema_version!==1)fail();
  const op=value.operation;
  if(op!==null){
   if(!op||canonical(Object.keys(op).sort())!==canonical(keys.toSorted())||!['actor_id','organization_id','opportunity_id','base_version_id','request_id'].every(k=>uuid(op[k]))||!['base_payload_digest','source_digest','content_digest','payload_digest','intent_digest'].every(k=>digest(op[k]))||!/^pg-jsonb-sha256:[a-f0-9]{64}$/.test(op.base_request_digest)||!Number.isSafeInteger(op.expected_version)||op.expected_version<1||op.expected_version>2147483646||!(op.known_id===null||uuid(op.known_id))||typeof op.resolved!=='boolean'||op.resolved&&!op.known_id)fail();
  }
  return value;
 }
 function write(value){
  if(failed)fail();check(value);
  try{const text=JSON.stringify(value),store=storage();store.setItem(revisionMarkerKey,text);if(store.getItem(revisionMarkerKey)!==text)fail();initialized=true;last=structuredClone(value);return structuredClone(value.operation);}catch{fail();}
 }
 function read(){
  if(failed)fail();try{
   const raw=storage().getItem(revisionMarkerKey);if(raw===null){if(initialized)fail();return write({schema_version:1,operation:null});}
   const value=check(JSON.parse(raw));if(initialized&&canonical(value)!==canonical(last))fail();initialized=true;last=structuredClone(value);return structuredClone(value.operation);
  }catch{fail();}
 }
 return {read,
  attempt(operation){const old=read();if(old&&!old.resolved)fail();return write({schema_version:1,operation:{...operation,known_id:null,resolved:false}});},
  remember(requestId,id,resolved=false){const op=read();if(!op||op.request_id!==requestId||!uuid(id)||op.known_id&&op.known_id!==id)fail();return write({schema_version:1,operation:{...op,known_id:id,resolved:op.resolved||resolved}});},
 };
}
