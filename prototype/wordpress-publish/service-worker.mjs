// The actual restartable service process owns publisher state and the durable journal.
// Runner IPC supplies short-lived authorization and TLS transport; no credentials on disk.
import {appendFileSync} from 'node:fs';
import {openRunJournal} from './journal.mjs';
import {createWordpressPublisher} from './publisher.mjs';
import {createRcServer} from '../internal-rc/server.mjs';
let publisher=null,serial=0;const pending=new Map();
const rpc=(method,args)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});process.send({type:'rpc',id,method,args});});
process.on('message',async message=>{
 if(message.type==='rpc-result'){const task=pending.get(message.id);if(!task)return;pending.delete(message.id);message.error?task.reject(Error(message.error)):task.resolve(message.value);return;}
 if(message.type==='init'){
  try{
   const {path,bound,auditPath}=message;
   const journal=openRunJournal(path,bound),site={target:bound.page_id,targetURL:bound.target_url,path:id=>'/?rest_route=/wp/v2/pages/'+id+'&context=edit',call:async(...args)=>{const r=await rpc('site',args);return {...r,json:()=>JSON.parse(r.text)};}};
   if(message.rc){await createRcServer({config:{...message.rc,bound,journal_path:path},site,onError:error=>process.send({type:'diagnostic',message:error.message}),upstreamFetch:async(...args)=>{const r=await rpc('backend',args);return {...r,json:async()=>r.data};},scan:url=>rpc('scan',[url]),record:value=>appendFileSync(auditPath,JSON.stringify(value)+'\n',{mode:0o600})});}
   else publisher=createWordpressPublisher({site,journal,authorize:(...args)=>rpc('authorize',args),authorizeRead:(...args)=>rpc('authorizeRead',args),record:value=>appendFileSync(auditPath,JSON.stringify(value)+'\n',{mode:0o600})});
   process.send({type:'ready',pid:process.pid,records:journal.count()});
  }catch(error){process.send({type:'startup-error',error:error.message});process.exitCode=2;process.disconnect();}
  return;
 }
 if(message.type==='dispatch')try{if(!publisher)throw Error('Service not ready');const value=await publisher.dispatch(message.token,message.action,message.input);process.send({type:'result',id:message.id,value});}catch(error){if(process.connected)process.send({type:'result',id:message.id,error:error.message});}
});
process.on('disconnect',()=>process.exit());
