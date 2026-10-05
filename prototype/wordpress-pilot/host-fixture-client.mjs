// Isolated runner helper: real child process + HTTP, original authority/WordPress fixtures stay outside host.
import {fork} from 'node:child_process';
import {createServer} from 'node:net';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
export async function freeOrigin(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+s.address().port;await new Promise(r=>s.close(r));return origin;}
export async function childHost({config,site,fetchImpl,now=Date.now,shutdownMs=30000}){
 const origin=await freeOrigin(),path=config.storage_directory+'-host.json';
 const hostConfig={enabled:true,listen_origin:origin,public_origin:config.authority.redirectOrigin,service:config,wordpress:{origin:new URL(config.binding.target_url).origin,credential_file:'/tmp/unused-isolated-credential'}};
 writeFileSync(path,JSON.stringify(hostConfig),{mode:0o600});
 const child=fork(new URL('./host-fixture.mjs',import.meta.url),['--mode=growth-os-isolated-host',path],{env:{...process.env,NODE_ENV:'test',GROWTH_ISOLATED_SHUTDOWN_MS:String(shutdownMs)},stdio:['ignore','pipe','pipe','ipc']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 child.on('message',async m=>{if(!['site','authority'].includes(m.kind))return;let reply;try{if(m.kind==='site'){const r=await site.call(m.value.path,m.value.options);reply={value:{status:r.status,text:r.text}};}else{const r=await fetchImpl(m.value.url,m.value.options);reply={value:{status:r.status,ok:r.ok,data:await r.json()}};}}catch(e){reply={error:e.message};}if(child.connected)child.send({kind:'reply',id:m.id,...reply});});
 await Promise.race([new Promise(resolve=>child.on('message',m=>{if(m.kind==='ready')resolve();})),exited.then(()=>{throw Error('Host startup failed: '+output);})]);child.send({kind:'clock',value:now()});
 const request=async(action,input,token)=>fetch(origin+'/api/wordpress-publication/'+action,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(input),signal:AbortSignal.timeout(20000)});
 return {origin,pid:child.pid,child,exited,output:()=>output,request,clock(){child.send({kind:'clock',value:now()});},async dispatch(token,action,input){const r=await request(action,input,token),data=await r.json();if(r.status!==200)throw Error(data.error);return data;},async close(){if(child.exitCode!==null||child.signalCode!==null)return;child.kill('SIGTERM');const result=await exited;assert.equal(result.code,0,output);},async kill(){child.kill('SIGKILL');return exited;}};
}
export async function driverRead(host,token,action,input){const child=fork(new URL('./host-driver.mjs',import.meta.url),['--mode=growth-os-isolated-host'],{env:{...process.env,NODE_ENV:'test'},stdio:['ignore','pipe','pipe','ipc']});let value;child.on('message',m=>value=m);const exited=new Promise(r=>child.once('exit',code=>r(code)));child.send({origin:host.origin,token,action,input});assert.equal(await exited,0);assert.equal(value.status,200);return {pid:child.pid,data:value.data,history:value.history};}
