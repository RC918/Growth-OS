// Isolated in-memory server simulator, never hosted and never connected to Supabase.
import {validateR7,R7} from '../../apps/web/intro-r7-review.mjs';
import {candidateHash} from '../../apps/web/intro-save.mjs';
export const ids={owner:'00000000-0000-4000-8000-000000000001',other:'00000000-0000-4000-8000-000000000002',org:'00000000-0000-4000-8000-000000000003',otherOrg:'00000000-0000-4000-8000-000000000004'};
export function fixture(){
 const versions=[],audit=[],calls=[];let lose=false,corrupt=false,hold=null;
 const users={a:{id:ids.owner,org:ids.org,role:'owner'},b:{id:ids.other,org:ids.otherOrg,role:'owner'},viewer:{id:ids.owner,org:ids.org,role:'viewer'}};
 async function fetchImpl(url,options){
 const u=new URL(url),actor=users[options.headers.Authorization?.replace('Bearer ','')];calls.push({path:u.pathname,method:options.method,body:options.body});if(!actor)return {ok:false,status:401};
 let value;
 if(u.pathname==='/auth/v1/user')value={id:actor.id};
 else if(['/rest/v1/organization_members','/rest/v1/r7_members'].includes(u.pathname))value=[{organization_id:actor.org,role:actor.role}];
 else if(u.pathname==='/rest/v1/intro_versions'){
 if(u.searchParams.get('organization_id')!=='eq.'+actor.org)return {ok:false,status:403};
 value=versions.filter(r=>r.organization_id===actor.org).slice(-1);if(corrupt&&value.length)value=[{...value[0],candidate_hash:'bad'}];
 }else{
 const p=JSON.parse(options.body),latest=versions.filter(r=>r.organization_id===actor.org).at(-1);
 if(actor.role!=='owner'||p.p_organization_id!==actor.org)return {ok:false,status:403};
 if(audit.some(a=>a.request_id===p.p_request_id))return {ok:false,status:409};
 if(p.p_expected_version!==(latest?.version||0)||p.p_candidate_hash!==candidateHash||p.p_source_version!==R7.version)return {ok:false,status:409};
 if(u.pathname==='/rest/v1/rpc/save_r7_intro'){
 await validateR7(p.p_frame);
 if(p.p_expected_version!==(versions.filter(r=>r.organization_id===actor.org).at(-1)?.version||0))return {ok:false,status:409};
 value={kind:'r7_static_intro',id:crypto.randomUUID(),organization_id:actor.org,created_by:actor.id,request_id:p.p_request_id,version:(latest?.version||0)+1,source_url:R7.url,source_version:R7.version,candidate_hash:candidateHash,frame:structuredClone(p.p_frame),created_at:new Date().toISOString(),confirmation:null};versions.push(value);
 }else if(u.pathname==='/rest/v1/rpc/confirm_r7_intro'){
 if(!latest||latest.id!==p.p_version_id||latest.confirmation)return {ok:false,status:409};
 latest.confirmation={version_id:latest.id,version:latest.version,candidate_hash:candidateHash,source_version:R7.version,actor_id:actor.id,request_id:p.p_request_id,confirmed_at:new Date().toISOString()};value=latest;
 }else throw Error('Unexpected fixture endpoint');
 audit.push({action:u.pathname,actor_id:actor.id,organization_id:actor.org,request_id:p.p_request_id,version_id:value.id});
 if(lose){lose=false;throw Error('synthetic connection lost AFTER commit');}
 }
 const snapshot=structuredClone(value);if(hold){const f=hold;hold=null;await f;}
 return {ok:true,json:async()=>snapshot};
 }
 return {fetchImpl,versions,audit,calls,loseNext:()=>lose=true,corrupt:value=>corrupt=value,hold:promise=>hold=promise};
}
