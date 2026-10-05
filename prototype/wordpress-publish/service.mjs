// Same-run service lifecycle. The broker keeps the pre-existing ephemeral grant in memory;
// it cannot recreate or renew it. Restart creates a NEW OS process from the same journal.
import {fork} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRunJournal} from './journal.mjs';
export async function createPublicationService({path,auditPath,site,organization_id,authorize,authorizeRead,rc=null,upstreamFetch,scan}){
 const bound={run:site.run,journal_id:randomUUID(),organization_id,page_id:site.target,target_url:site.targetURL,expires_at:site.expires_at};
 if(!bound.run||!bound.organization_id||!Number.isInteger(bound.page_id)||!Number.isFinite(bound.expires_at))throw Error('Incomplete original run grant binding');
 createRunJournal(path,bound);let child=null,epoch=0,serial=0;const pending=new Map(),restarts=[];
 async function gate(){
  if(Date.now()>=bound.expires_at)throw Error('Original grant expired');
  const r=await site.call(site.path(site.target));if(r.status!==200)throw Error('Original grant revoked / unavailable');const p=r.json();if(p.id!==bound.page_id||p.link!==bound.target_url)throw Error('Granted page changed');
 }
 async function stop(){const old=child;if(!old)return;child=null;const done=new Promise(r=>old.once('exit',(code,signal)=>r({pid:old.pid,code,signal})));old.kill('SIGKILL');return done;}
 async function start(){
  if(child)throw Error('Service already running');const generation=++epoch;
  const own=fork(new URL('./service-worker.mjs',import.meta.url),[],{env:{PATH:process.env.PATH,NODE_ENV:'test'},stdio:['ignore','ignore','pipe','ipc']});child=own;own.stderr.resume();
  const ready=new Promise((resolve,reject)=>{
   own.once('error',reject);
   own.on('exit',(code,signal)=>{if(child===own)child=null;for(const [id,p]of pending)if(p.generation===generation){p.reject(Error('Service stopped; result unknown, readback only'));pending.delete(id);}reject(Error('Service exited before ready'));});
   own.on('message',async m=>{
    if(m.type==='diagnostic'){console.error('RC test service:',m.message);return;}
    if(m.type==='ready'){resolve(m);return;}if(m.type==='startup-error'){reject(Error(m.error));return;}
    if(m.type==='result'){const p=pending.get(m.id);if(p?.generation!==generation)return;pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.value);return;}
    if(m.type==='rpc'){
     try{
      let value;
      if(m.method==='site'){
       const [route,options={}]=m.args;
       if(![site.path(site.target),'/bolt/'].includes(route)||!['GET','POST'].includes(options.method??'GET'))throw Error('Unapproved WordPress route');
       if(Date.now()>=bound.expires_at)throw Error('Original grant expired');
       const r=await site.call(route,options);value={status:r.status,text:r.text};
      }else if(m.method==='backend'&&rc){
       const [url,options]=m.args;if(!url.startsWith(rc.backend_origin+'/'))throw Error('Backend mismatch');const r=await upstreamFetch(url,options);value={status:r.status,ok:r.ok,data:await r.json()};
      }else if(m.method==='scan'&&rc){
       if(m.args[0]!==site.targetURL)throw Error('Source mismatch');value=await scan(m.args[0]);
      }else if(['authorize','authorizeRead'].includes(m.method)){
       await gate();value=await(m.method==='authorize'?authorize:authorizeRead)(...m.args);
       if(value.binding.organization_id!==bound.organization_id||value.target_url!==bound.target_url)throw Error('Run tenant / page mismatch');
      }else throw Error('Unknown broker method');
      if(child===own&&own.connected)own.send({type:'rpc-result',id:m.id,value});
     }catch(error){if(child===own&&own.connected)own.send({type:'rpc-result',id:m.id,error:error.message});}
    }
   });
  });
  own.send({type:'init',path,bound,auditPath,rc});
  try{return await ready;}catch(error){await stop();throw error;}
 }
 await start();
 return {
  bound,path,restarts,pid:()=>child?.pid,
  async request(route,{method='GET',body,headers={}}={}){if(!child?.connected)throw Error('Service unavailable');return fetch(rc.listen_origin+route,{method,redirect:'error',headers:{'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});},
  async dispatch(token,action,input){if(rc){const r=await this.request('/api/wordpress-publication/'+action,{method:'POST',body:input,headers:{authorization:'Bearer '+token}});if(r.status!==200)throw Error('RC request denied');return r.json();}if(!child?.connected)throw Error('Service unavailable; no automatic restart or retry');const own=child,id=++serial;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject,generation:epoch});own.send({type:'dispatch',id,token,action,input});});},
  stop,
  async restart(){const old=await stop(),ready=await start();const proof={previous_pid:old?.pid??null,exit_signal:old?.signal??null,new_pid:ready.pid,records:ready.records,restarted_at:new Date().toISOString()};restarts.push(proof);return proof;},
  async startAfterCrash(oldPid){const ready=await start();const proof={previous_pid:oldPid,exit_signal:'SIGKILL',new_pid:ready.pid,records:ready.records,restarted_at:new Date().toISOString()};restarts.push(proof);return proof;},
  close:stop
 };
}
