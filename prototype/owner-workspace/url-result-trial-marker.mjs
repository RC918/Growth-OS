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
