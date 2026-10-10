import {createIntroSave} from './intro-save.mjs';
// Narrow adapter follows existing workspace verified-user/membership flow; no dashboard.
export function createR7WorkspaceApi({origin,key,redirectOrigin,fetchImpl=fetch,introSaveEnabled=false}){
 let token=null,membership=null,actor=null,generation=0;
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin)||!key?.startsWith('sb_publishable_'))throw Error('工作區設定不正確');
 async function request(path,{method='GET',body,authenticated=true}={}){
 if(authenticated&&!token)throw Error('請先登入');const headers={apikey:key};if(authenticated)headers.Authorization='Bearer '+token;if(body!==undefined)headers['Content-Type']='application/json';
 const r=await fetchImpl(origin+path,{method,headers,cache:'no-store',...body===undefined?{}:{body:JSON.stringify(body)}});if(!r.ok)throw Error('工作區操作失敗（HTTP '+r.status+'）');return r.json();
 }
 const intro=createIntroSave({enabled:introSaveEnabled===true&&origin==='https://wqepyttadrcnphtyjpjy.supabase.co',context:()=>membership,actor:()=>actor,request});
 const clear=()=>{generation++;token=null;membership=null;actor=null;intro.reset();};
 return {intro,context:()=>membership,signOut:clear,
 async requestMagicLink(email,redirectTo){const u=new URL(redirectTo);if(u.protocol!=='https:'||u.origin!==redirectOrigin||u.pathname!=='/r7-workspace.html'||u.search||u.hash)throw Error('登入返回網址不正確');return request('/auth/v1/otp?redirect_to='+encodeURIComponent(u.href),{method:'POST',authenticated:false,body:{email,create_user:false}});},
 async completeMagicLink(fragment){
 clear();const ticket=generation;const p=new URLSearchParams(fragment.replace(/^#/,''));const ttl=Number(p.get('expires_in'));
 if(p.get('error')||!p.get('access_token')||p.get('token_type')?.toLowerCase()!=='bearer'||!Number.isFinite(ttl)||ttl<=0)throw Error('登入連結無效');token=p.get('access_token');
 try{const user=await request('/auth/v1/user');if(generation!==ticket)throw Error('登入工作階段已變更');if(!user?.id)throw Error('登入身分無效');
 const q=new URLSearchParams({select:'organization_id,role',user_id:'eq.'+user.id,limit:'2'}),rows=await request('/rest/v1/r7_members?'+q);if(generation!==ticket)throw Error('登入工作階段已變更');
 if(!Array.isArray(rows)||rows.length!==1||!['owner','viewer'].includes(rows[0].role))throw Error('需要唯一既有 R7 工作區資格');membership=Object.freeze(rows[0]);actor=user.id;return membership;
 }catch(e){if(ticket===generation)clear();throw e;}
 }};
}
