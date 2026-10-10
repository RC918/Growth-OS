import {createIntroSave} from './intro-save.mjs';
// Narrow adapter follows existing workspace verified-user/membership flow; no dashboard.
export function createR7WorkspaceApi({origin,key,redirectOrigin,fetchImpl=fetch,introSaveEnabled=false,introReadEnabled=introSaveEnabled,authTimeoutMs=10000}){
 let token=null,membership=null,actor=null,generation=0;const reads=new Set();
 if(!Number.isFinite(authTimeoutMs)||authTimeoutMs<1||authTimeoutMs>30000)throw Error('登入驗證期限設定不正確');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin)||!key?.startsWith('sb_publishable_'))throw Error('工作區設定不正確');
 async function request(path,{method='GET',body,authenticated=true,authCheck=false}={}){
 if(authenticated&&!token)throw Error('請先登入');const headers={apikey:key};if(authenticated)headers.Authorization='Bearer '+token;if(body!==undefined)headers['Content-Type']='application/json';
 const controller=authCheck?new AbortController():null;let timer;
 const perform=async()=>{const r=await fetchImpl(origin+path,{method,headers,cache:'no-store',...(controller?{signal:controller.signal}:{}),...body===undefined?{}:{body:JSON.stringify(body)}});if(!r.ok)throw Error('工作區操作失敗（HTTP '+r.status+'）');return r.json();};
 if(!controller)return perform();
 reads.add(controller);
 try{return await Promise.race([perform(),new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(Error('登入驗證已取消')),{once:true});timer=setTimeout(()=>{reject(Error('登入驗證逾時；未登入，也未重新寄信。'));controller.abort();},authTimeoutMs);})]);}
 finally{clearTimeout(timer);reads.delete(controller);}
 }
 const intro=createIntroSave({enabled:introSaveEnabled===true&&origin==='https://wqepyttadrcnphtyjpjy.supabase.co',readEnabled:introReadEnabled===true&&origin==='https://wqepyttadrcnphtyjpjy.supabase.co',context:()=>membership,actor:()=>actor,request});
 const clear=()=>{generation++;for(const c of reads)c.abort();reads.clear();token=null;membership=null;actor=null;intro.reset();};
 return {intro,context:()=>membership,signOut:clear,
 async requestMagicLink(email,redirectTo){const u=new URL(redirectTo);if(u.protocol!=='https:'||u.origin!==redirectOrigin||u.pathname!=='/r7-workspace'||u.search||u.hash)throw Error('登入返回網址不正確');return request('/auth/v1/otp?redirect_to='+encodeURIComponent(u.href),{method:'POST',authenticated:false,body:{email,create_user:false}});},
 async completeMagicLink(fragment){
 clear();const ticket=generation;const p=new URLSearchParams(fragment.replace(/^#/,''));const ttl=Number(p.get('expires_in'));
 if(p.get('error')||!p.get('access_token')||p.get('token_type')?.toLowerCase()!=='bearer'||!Number.isFinite(ttl)||ttl<=0)throw Error('登入連結無效');token=p.get('access_token');
 try{const user=await request('/auth/v1/user',{authCheck:true});if(generation!==ticket)throw Error('登入工作階段已變更');if(!user?.id)throw Error('登入身分無效');
 const q=new URLSearchParams({select:'organization_id,role',user_id:'eq.'+user.id,limit:'2'}),rows=await request('/rest/v1/r7_members?'+q,{authCheck:true});if(generation!==ticket)throw Error('登入工作階段已變更');
 if(!Array.isArray(rows)||rows.length!==1||!['owner','viewer'].includes(rows[0].role))throw Error('需要唯一既有 R7 工作區資格');membership=Object.freeze(rows[0]);actor=user.id;return membership;
 }catch(e){if(ticket!==generation)throw Error('登入工作階段已變更');clear();throw Error(/^登入|^工作區操作失敗|^需要唯一/.test(e.message)?e.message:'登入驗證失敗；未重新寄信。');}
 }};
}
