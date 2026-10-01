import {POLICY} from './policy.mjs';
const ORIGIN='https://vhzryhibmpvglzcmfnaa.supabase.co';
async function jsonBounded(response,max=131072) {
 if(!response.ok)throw new Error('UPSTREAM_REJECTED');
 const reader=response.body.getReader();let size=0;const chunks=[];
 try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('UPSTREAM_TOO_LARGE');chunks.push(value);}}
 finally {await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export function supabaseAdapters({publishableKey,serviceKey,fetchImpl=fetch}) {
 const userRequest=(path,bearer)=>fetchImpl(ORIGIN+path,{headers:{apikey:publishableKey,Authorization:bearer},signal:AbortSignal.timeout(10000)});
 const rpc=async(name,body)=>jsonBounded(await fetchImpl(ORIGIN+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)}));
 return {
  authenticate:async(request,org)=>{
   const bearer=request.headers.get('authorization');if(!bearer?.startsWith('Bearer '))return null;
   const user=await jsonBounded(await userRequest('/auth/v1/user',bearer));
   if(typeof user.id!=='string')return null;
   const members=await jsonBounded(await userRequest('/rest/v1/organization_members?select=user_id,organization_id,role&user_id=eq.'+encodeURIComponent(user.id)+'&organization_id=eq.'+encodeURIComponent(org)+'&role=eq.owner',bearer));
   if(!Array.isArray(members)||members.length!==1||members[0].user_id!==user.id||members[0].organization_id!==org||members[0].role!=='owner')return null;
   return {id:user.id,role:'owner'};
  },
  ledger:{reserve:({requestId,actorId,organizationId,fixtureId,hash,expectedVersion})=>rpc('model_trial_reserve',{p_request:requestId,p_actor:actorId,p_org:organizationId,p_fixture:fixtureId,p_hash:hash,p_version:expectedVersion}),
   authorize:({requestId,actorId,organizationId})=>rpc('model_trial_authorize_dispatch',{p_request:requestId,p_actor:actorId,p_org:organizationId}),
   settle:({requestId,input,output,result})=>rpc('model_trial_settle',{p_request:requestId,p_input:input,p_output:output,p_result:result})}
 };
}
export function openaiProvider({getKey,fetchImpl=fetch}) {
 const send=async(path,body)=>{
  const key=getKey();if(!key)throw new Error('MODEL_KEY_NOT_CONFIGURED');
  // Fixed provider, no logging/retry, no arbitrary URL/header overrides.
  return jsonBounded(await fetchImpl('https://api.openai.com/v1/responses'+path,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(40000)}));
 };
 return {count:async(body)=>{
  const {model,instructions,input,text,truncation}=body;
  const count=await send('/input_tokens',{model,instructions,input,text,truncation});
  if(count.object!=='response.input_tokens')throw new Error('INVALID_TOKEN_COUNT');
  return count.input_tokens;
 },generate:body=>{
  if(body.model!==POLICY.model||body.max_output_tokens!==POLICY.maxOutput||body.store!==false)throw new Error('MODEL_POLICY_DRIFT');
  return send('',body);
 }};
}
