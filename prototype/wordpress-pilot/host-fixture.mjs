// Test-only child entry; not imported by runtime.mjs or deployed output.
import {loadHostConfig,startHost,installShutdown} from './host.mjs';
if(process.argv[2]!=='--mode=growth-os-isolated-host'||process.env.NODE_ENV!=='test'||!process.send)throw Error('Explicit isolated child required');
let sequence=0,clock=Date.now();const pending=new Map();
process.on('message',m=>{if(m.kind==='reply'){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.value);}if(m.kind==='clock')clock=m.value;});
const ask=(kind,value)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});process.send({kind,id,value});});
try{
 const config=loadHostConfig(process.argv[3],{isolated:true}),b=config.service.binding;
 const site={target:b.page_id,targetURL:b.target_url,path:id=>'/?rest_route=/wp/v2/pages/'+id+'&context=edit',async call(path,options={}){const r=await ask('site',{path,options});return {...r,json:()=>JSON.parse(r.text)};}};
 const fetchImpl=async(url,options={})=>{const r=await ask('authority',{url,options});return {...r,json:async()=>r.data};};
 const host=await startHost({config,site,fetchImpl,now:()=>clock,shutdownMs:process.env.GROWTH_ISOLATED_SHUTDOWN_MS?Number(process.env.GROWTH_ISOLATED_SHUTDOWN_MS):30000});installShutdown(host);
 process.on('disconnect',()=>process.kill(process.pid,'SIGTERM'));process.send({kind:'ready'});
}catch{console.error('Isolated host startup refused');process.exit(1);}
