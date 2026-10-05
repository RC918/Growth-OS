// Run only after the candidate envelope is approved. No initialize-on-missing,
// implicit new grant, fake identity, retry or hosted-project fallback.
import {readFile,lstat} from 'node:fs/promises';
import https from 'node:https';
import http from 'node:http';
import {createRcServer} from './server.mjs';
import {scanOwnedSite} from './source-fixture.mjs';
import {observeRequestKeys} from '../wordpress-publish/request-evidence.mjs';
export async function readSecret(path){const s=await lstat(path);if(!s.isFile()||(s.mode&0o077))throw Error('Secret must be an owner-only regular file');return readFile(path,'utf8');}
export function localBackend(config){
 const targets={auth:new URL(config.auth_url),rest:new URL(config.rest_url)};
 for(const u of Object.values(targets))if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.pathname!=='/'||!u.port)throw Error('Only approved local native Auth/Data API');
 return async(url,options={})=>{const u=new URL(url);if(u.origin!==config.backend_origin)throw Error('Logical backend mismatch');const kind=u.pathname.startsWith('/auth/v1/')?'auth':u.pathname.startsWith('/rest/v1/')?'rest':null;if(!kind)throw Error('Backend path denied');const path=u.pathname.replace(kind==='auth'?'/auth/v1':'/rest/v1','');return fetch(targets[kind].origin+path+u.search,{...options,redirect:'error',signal:AbortSignal.timeout(10000)});};
}
export async function startRuntime(config,{crashAtPost=null}={}){
 if(config.isolated_transport||config.backend_origin!=='https://growth-internal-rc.supabase.co'||config.bound.target_url!=='https://rc-source.example/bolt/'||config.source_mode!=='owned-network-fixture')throw Error('Unapproved RC runtime profile');
 if(Date.now()>=config.bound.expires_at)throw Error('Original grant expired');
 const secret=JSON.parse(await readSecret(config.wordpress_secret));
 if(secret.expires_at!==config.bound.expires_at||secret.run!==config.bound.run||secret.page_id!==config.bound.page_id)throw Error('Original grant binding mismatch');
 const tls=JSON.parse(await readSecret(config.tls_secret));
 // Isolated loopback front, independently owned of the browser/test runner.
 const proxy=https.createServer({key:tls.key,cert:tls.cert},(req,res)=>{
  if(!['/bolt/','/robots.txt','/?rest_route=/wp/v2/pages/'+config.bound.page_id+'&context=edit'].includes(req.url)){res.writeHead(403);res.end();return;}
  observeRequestKeys(req,value=>console.log('WP request keys '+JSON.stringify(value)));
  const r=http.request({host:'127.0.0.1',port:8796,path:req.url,method:req.method,headers:{...req.headers,host:'rc-source.example','x-forwarded-proto':'https'}},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res);});r.on('error',()=>{res.writeHead(502);res.end();});req.pipe(r);
 });
 await new Promise((r,j)=>{proxy.once('error',j);proxy.listen(8797,'127.0.0.1',r);});const agent=new https.Agent({ca:tls.cert});
 let postCount=0;
 const site={run:config.bound.run,target:config.bound.page_id,targetURL:config.bound.target_url,path:id=>'/?rest_route=/wp/v2/pages/'+id+'&context=edit',call:(path,{method='GET',body,headers={},authenticated=true}={})=>new Promise((resolve,reject)=>{
  if(Date.now()>=config.bound.expires_at||![site.path(site.target),'/bolt/','/robots.txt'].includes(path))return reject(Error('Original grant/route denied'));
  if(method==='POST'&&++postCount===crashAtPost)process.kill(process.pid,'SIGKILL'); // RC fault injection only, after durable intent; never HTTP-controlled.
  const r=https.request('https://127.0.0.1:8797'+path,{agent,method,headers:{...headers,...(body?{'content-type':'application/json'}:{}),...(authenticated?{authorization:'Basic '+Buffer.from(secret.user+':'+secret.password).toString('base64')}:{})}},res=>{let text='';res.on('data',b=>{text+=b;if(text.length>2_000_000)r.destroy(Error('Response limit'));});res.on('end',()=>resolve({status:res.statusCode,text,json:()=>JSON.parse(text)}));});r.setTimeout(8000,()=>r.destroy(Error('WordPress timeout')));r.on('error',reject);r.end(body?JSON.stringify(body):undefined);
 })};
 try{const server=await createRcServer({config,site,upstreamFetch:localBackend(config),scan:()=>scanOwnedSite(site,config.source_database)});return {close:async()=>{await server.close();agent.destroy();proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}};}catch(error){agent.destroy();proxy.closeAllConnections();await new Promise(r=>proxy.close(r));throw error;}
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 const path=process.argv[2];if(!path)throw Error('Approved RC config path required');const config=JSON.parse(await readFile(path,'utf8'));let runtime;try{runtime=await startRuntime(config,{crashAtPost:process.argv.includes('--crash-at-third-post')?3:null});}catch{throw Error('RC startup refused; no credential details logged');}console.log('RC service ready (no secrets logged)');
 for(const sig of ['SIGTERM','SIGINT'])process.once(sig,async()=>{await runtime.close();process.exit();});
}
