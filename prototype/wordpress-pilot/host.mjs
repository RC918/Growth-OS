// Single-site HTTP host. No fixture transport, credential issuer or implicit store creation.
import {createServer} from 'node:http';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {createPilotService,validateBinding} from './service.mjs';
export function privateFile(path){if(typeof path!=='string'||!isAbsolute(path)||realpathSync(path)!==path)throw Error('Private absolute file required');const s=lstatSync(path);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.nlink!==1||s.size>65536)throw Error('Private owned file required');return readFileSync(path,'utf8');}
const exact=(o,keys)=>o&&Object.keys(o).sort().join(',')===keys.split(',').sort().join(',');
export function validateHostConfig(c,{isolated=false}={}){
 if(!exact(c,'enabled,listen_origin,public_origin,service,wordpress')||c.enabled!==true)throw Error('Host closed');
 const u=new URL(c.listen_origin),p=new URL(c.public_origin);
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.origin!==c.listen_origin||p.origin!==c.public_origin||!(p.protocol==='https:'||isolated&&p.hostname==='127.0.0.1'&&p.protocol==='http:'))throw Error('Explicit loopback listener and public origin required');
 const s=c.service;
 if(!exact(s,'enabled,gsc_measurement_enabled,evidence_environment,binding,write_grant,read_grant,authority,storage_directory')||s.enabled!==true||typeof s.gsc_measurement_enabled!=='boolean'||s.evidence_environment!==(isolated?'isolated_fixture':'owner_site'))throw Error('Service profile denied');
 validateBinding(s.binding);
 if(!exact(s.authority,'origin,key,redirectOrigin')||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(s.authority.origin)||typeof s.authority.key!=='string'||!s.authority.key.startsWith('sb_publishable_')||s.authority.redirectOrigin!==c.public_origin)throw Error('Workspace authority required');
 if(!isAbsolute(s.storage_directory)||realpathSync(s.storage_directory)!==s.storage_directory)throw Error('Explicit existing store required');
 for(const kind of ['write','read']){const g=s[kind+'_grant'];if(g!==null&&(!exact(g,'pilot_id,approval_reference,starts_at,expires_at')||g.pilot_id!==s.binding.pilot_id||typeof g.approval_reference!=='string'||!g.approval_reference.trim()||!Number.isSafeInteger(g.starts_at)||!Number.isSafeInteger(g.expires_at)||g.expires_at<=g.starts_at))throw Error('Invalid grant');}
 if(!exact(c.wordpress,'origin,credential_file')||c.wordpress.origin!==new URL(s.binding.target_url).origin||!isAbsolute(c.wordpress.credential_file))throw Error('Fixed WordPress origin and credential file required');
 return structuredClone(c);
}
export function loadHostConfig(path,options){return validateHostConfig(JSON.parse(privateFile(path)),options);}
const actions=new Set(['preview','publish','readback','restore','history','measurement','measurement-save']);
const send=(res,status,value)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','connection':'close'});res.end(JSON.stringify(value));};
export async function startHost({config,site,fetchImpl,now=Date.now,shutdownMs=30000}){
 // Entrypoints validate config before providing transports; service independently validates binding/store.
 const service=createPilotService({config:config.service,site,fetchImpl,now});
 let draining=false,active=0,finishDrain,closing;
 const server=createServer({maxHeaderSize:16384,requestTimeout:15000,headersTimeout:10000,keepAliveTimeout:1000},async(req,res)=>{
  active++;let timer;
  try{
   if(draining)return send(res,503,{status:'draining'});
   const u=new URL(req.url,config.listen_origin),dupes=Object.values(req.headersDistinct).some(v=>v.length!==1);
   if(dupes||req.url!==u.pathname+u.search||u.origin!==config.listen_origin||req.headers.host!==new URL(config.listen_origin).host||req.headers.origin&&req.headers.origin!==config.public_origin)return send(res,403,{error:'Request denied'});
   if(req.method==='GET'&&['/health','/ready'].includes(req.url)){try{service.ready();return send(res,200,{status:'ready'});}catch{return send(res,503,{status:'unavailable'});}}
   const action=u.pathname.slice('/api/wordpress-publication/'.length);
   if(!u.pathname.startsWith('/api/wordpress-publication/')||!actions.has(action)||u.search)return send(res,404,{error:'Route denied'});
   if(req.method!=='POST')return send(res,405,{error:'POST required'});
   if(!/^Bearer [^\s]+$/.test(req.headers.authorization??''))return send(res,401,{error:'Bearer required'});
   if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']??'')||req.headers['content-encoding']||req.headers.expect)return send(res,415,{error:'JSON required'});
   const limit=action==='measurement-save'?2100000:4096;let size=0;const chunks=[];
   if(Number(req.headers['content-length']??0)>limit)return send(res,413,{error:'Input too large'});
   timer=setTimeout(()=>req.destroy(),5000);
   for await(const part of req){size+=part.length;if(size>limit){send(res,413,{error:'Input too large'});return;}chunks.push(part);}
   clearTimeout(timer);timer=null;
   const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
   send(res,200,await service.dispatch(req.headers.authorization.slice(7),action,input));
  }catch{send(res,403,{error:'Request denied; uncertain mutations require readback, never automatic retry'});}
  finally{clearTimeout(timer);active--;if(draining&&active===0)finishDrain?.();}
 });
 server.maxConnections=32;server.maxRequestsPerSocket=1;
 server.on('clientError',(_e,socket)=>socket.destroy());server.on('checkContinue',(_req,res)=>send(res,417,{error:'Expectation denied'}));server.on('upgrade',(_req,socket)=>socket.destroy());
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(new URL(config.listen_origin).port),'127.0.0.1',resolve);});}catch(e){service.close();throw e;}
 return {async close(){if(closing)return closing;draining=true;closing=(async()=>{
   const stopped=new Promise(resolve=>server.close(resolve));
   let timeout;const drained=active===0?Promise.resolve(true):new Promise(resolve=>{finishDrain=()=>resolve(true);});
   const clean=await Promise.race([Promise.all([drained,stopped]).then(()=>true),new Promise(resolve=>{timeout=setTimeout(()=>resolve(false),shutdownMs);})]);clearTimeout(timeout);
   if(!clean){server.closeAllConnections();return false;} // Keep writer lock; entry exits nonzero like a crash.
   service.close();return true;
  })();return closing;}};
}
export function installShutdown(host){let stopping=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{if(stopping)return;stopping=true;try{process.exit(await host.close()?0:1);}catch{process.exit(1);}});}
