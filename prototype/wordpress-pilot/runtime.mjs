// Explicit server-only entry. Never creates grants/stores; no isolated transport switch.
import {loadHostConfig,privateFile,startHost,installShutdown} from './host.mjs';
import {canonical} from '../../apps/web/first-result-payload.mjs';
export function productionTransports(config){
 const s=config.service,credential=JSON.parse(privateFile(config.wordpress.credential_file));
 if(Object.keys(credential).sort().join(',')!=='binding,password,user'||canonical(credential.binding)!==canonical(s.binding)||typeof credential.user!=='string'||!/^[a-zA-Z0-9_.-]{1,60}$/.test(credential.user)||typeof credential.password!=='string'||!credential.password.trim())throw Error('Credential binding denied');
 const authorization='Basic '+Buffer.from(credential.user+':'+credential.password).toString('base64');
 async function bounded(url,options){const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(10000)});let size=0;const parts=[];for await(const part of r.body??[]){size+=part.length;if(size>3000000)throw Error('Upstream limit');parts.push(part);}return {status:r.status,ok:r.ok,text:Buffer.concat(parts).toString('utf8')};}
 const path=id=>{if(id!==s.binding.page_id)throw Error('Page denied');return '/?rest_route=/wp/v2/pages/'+id+'&context=edit';};
 return {site:{target:s.binding.page_id,targetURL:s.binding.target_url,path,async call(p,o={}){
  const method=o.method??'GET';if(![path(s.binding.page_id),new URL(s.binding.target_url).pathname].includes(p)||!['GET','POST'].includes(method)||method==='POST'&&p!==path(s.binding.page_id)||Object.keys(o.headers??{}).some(k=>k!=='x-growth-before'))throw Error('WordPress route denied');
  const r=await bounded(config.wordpress.origin+p,{method,headers:{...(o.authenticated===false?{}:{authorization}),...(o.body?{'content-type':'application/json'}:{}),...o.headers},...(o.body?{body:JSON.stringify(o.body)}:{})});return {...r,json:()=>JSON.parse(r.text)};
 }},async fetchImpl(url,o={}){const u=new URL(url);if(u.origin!==s.authority.origin||!['/auth/v1/user','/rest/v1/'].some(p=>p.endsWith('/')?u.pathname.startsWith(p):u.pathname===p)||(o.method??'GET')!=='GET')throw Error('Authority route denied');const r=await bounded(url,o);return {...r,json:async()=>JSON.parse(r.text)};}};
}
if(process.argv[1]===new URL(import.meta.url).pathname){try{if(process.argv.length!==3)throw Error('Explicit config required');const config=loadHostConfig(process.argv[2]);const host=await startHost({config,...productionTransports(config)});installShutdown(host);console.log('Single-site HTTP ready');}catch{console.error('Single-site startup refused');process.exitCode=1;}}
