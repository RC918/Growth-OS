// Fixed single-site wiring. No backend credentials, grant issuer or arbitrary proxy.
import http from 'node:http';
import https from 'node:https';
import {readFile,readdir} from 'node:fs/promises';
import {privateFile,installShutdown,loadHostConfig} from '../wordpress-pilot/host.mjs';
const actions=new Set(['preview','publish','readback','restore','history','measurement','measurement-save']);
const rpc=['review_url_result','save_url_result_draft'];
const exact=(v,keys)=>v&&Object.keys(v).sort().join(',')===keys.split(',').sort().join(',');
const origin=(s,protocol)=>{const u=new URL(s);if(u.origin!==s||u.protocol!==protocol||u.username||u.password)throw Error('Exact origin required');return u;};
export function validateConfig(c){
 if(!exact(c,'enabled,listen_origin,public_origin,supabase,source_origin,publication_origin,activation,wordpress,tls')||c.enabled!==true)throw Error('Candidate closed');
 const l=origin(c.listen_origin,'https:');if(l.hostname!=='127.0.0.1'||!l.port)throw Error('Private loopback TLS only');
 origin(c.public_origin,'https:');
 if(!exact(c.supabase,'origin,publishable_key,allowed_origins')||!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(c.supabase.origin)||c.supabase.origin==='https://vhzryhibmpvglzcmfnaa.supabase.co'||!Array.isArray(c.supabase.allowed_origins)||c.supabase.allowed_origins.length!==1||c.supabase.allowed_origins[0]!==c.supabase.origin||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(c.supabase.publishable_key))throw Error('Explicit new-project allowlist and publishable key required');
 for(const s of [c.source_origin,c.publication_origin,c.wordpress?.upstream]){const u=origin(s,'http:');if(u.hostname!=='127.0.0.1'||!u.port)throw Error('Fixed loopback upstream required');}
 if(!exact(c.wordpress,'origin,upstream,page_id')||c.wordpress.origin===c.public_origin||!Number.isSafeInteger(c.wordpress.page_id)||c.wordpress.page_id<1)throw Error('Single WordPress site required');origin(c.wordpress.origin,'https:');
 if(!exact(c.tls,'certificate_file,key_file')||![c.tls.certificate_file,c.tls.key_file].every(s=>typeof s==='string'&&s.startsWith('/')))throw Error('TLS files required');
 if(c.activation!==null&&(!exact(c.activation,'approval_reference,expires_at,save_review_rpcs,publisher')||typeof c.activation.approval_reference!=='string'||!c.activation.approval_reference.trim()||!Number.isSafeInteger(c.activation.expires_at)||JSON.stringify(c.activation.save_review_rpcs)!==JSON.stringify(rpc)||typeof c.activation.publisher!=='boolean'))throw Error('Explicit activation required');
 return structuredClone(c);
}
const active=c=>c.activation!==null&&Date.now()<c.activation.expires_at;
export function runtimeAssets(c){
 const a=active(c),s=c.supabase;
 return {
 '/workspace-runtime.mjs':`export const workspaceRuntime=${JSON.stringify({origin:s.origin,key:s.publishable_key})};export const workspaceFetch=(url,options)=>{const u=new URL(url,location.origin);if(u.origin===location.origin&&/^\\/api\\/wordpress-publication\\/(preview|publish|readback|restore|history|measurement|measurement-save)$/.test(u.pathname)&&!u.search)return fetch(u.href,options);if(u.origin!==workspaceRuntime.origin)throw Error('Backend mismatch');return fetch(u.href,options);};`,
 '/url-result-config.mjs':`export const urlResultSchemaEnabled=${a},urlSaveEnabled=${a},urlSaveTrial=null,urlReviewSchemaEnabled=${a},urlReviewEnabled=${a},urlReviewTrial=null;`,
 '/wordpress-publication-config.mjs':`export const wordpressPublicationEnabled=${a&&c.activation.publisher},wordpressPublicationProfile='single_site_wordpress',gscMeasurementEnabled=${a&&c.activation.publisher};`
 };
}
const security={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const send=(res,status,body='',type='application/json',headers={})=>{if(res.destroyed)return;res.writeHead(status,{...security,'content-type':type,...headers});res.end(body);};
async function body(req,limit){let size=0;const parts=[];if(Number(req.headers['content-length']??0)>limit)throw Error('Body limit');const timer=setTimeout(()=>req.destroy(),5000);try{for await(const p of req){size+=p.length;if(size>limit)throw Error('Body limit');parts.push(p);}return Buffer.concat(parts);}finally{clearTimeout(timer);}}
export async function createHandler(c){
 const root=new URL('../../apps/web/',import.meta.url),assets=new Set((await readdir(root)).filter(p=>/^[a-z0-9.-]+\.(html|mjs|css|csv|txt)$/.test(p)).map(p=>'/'+p));
 const csp=`default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' ${c.supabase.origin}; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`;
 async function proxy(req,res,target,host,limit,{auth=false,revision=false}={}){
  const bytes=req.method==='POST'?await body(req,limit):null;
  const headers={host, ...(req.headers.origin?{origin:req.headers.origin}:{}),...(bytes?{'content-type':'application/json','content-length':bytes.length}:{})};
  if(auth&&req.headers.authorization)headers.authorization=req.headers.authorization;
  if(revision&&req.headers['x-growth-before'])headers['x-growth-before']=req.headers['x-growth-before'];
  // Replace, never trust user-supplied forwarding headers/cookies. No retries/redirects.
  if(revision)headers['x-forwarded-proto']='https';
  await new Promise(resolve=>{
   let total=0,parts=[],done=false;
   const finish=()=>{if(done)return;done=true;clearTimeout(deadline);resolve();};
   const upstream=http.request(target+req.url,{method:req.method,headers},r=>{
    r.on('data',p=>{total+=p.length;if(total>3000000)upstream.destroy(Error('Response limit'));else parts.push(p);});
    r.on('end',()=>{if(!done){if(r.statusCode>=300&&r.statusCode<400)send(res,502,'{"error":"Upstream redirect denied"}');else send(res,r.statusCode,Buffer.concat(parts),r.headers['content-type']??'application/json');finish();}});
    r.on('error',()=>upstream.destroy());
   });
   const deadline=setTimeout(()=>upstream.destroy(Error('Deadline')),20000);
   upstream.on('error',()=>{if(!done){send(res,502,'{"error":"Upstream unavailable; read back uncertain mutations, do not retry"}');finish();}});
   upstream.end(bytes);
  });
 }
 return async(req,res)=>{try{
  const app=req.headers.host===new URL(c.public_origin).host,site=req.headers.host===new URL(c.wordpress.origin).host;
  const publicOrigin=app?c.public_origin:c.wordpress.origin;
  if((!app&&!site)||Object.values(req.headersDistinct).some(v=>v.length!==1)||req.headers.origin&&req.headers.origin!==publicOrigin||!req.url.startsWith('/')||req.url.startsWith('//')||/[\\%#]/.test(req.url))return send(res,403);
  const u=new URL(req.url,publicOrigin);if(req.url!==u.pathname+u.search||req.headers['content-encoding']||req.headers.expect)return send(res,403);
  if(site){
   const rest=req.url===`/?rest_route=/wp/v2/pages/${c.wordpress.page_id}&context=edit`;
   const page=['/growth-os/','/about/','/privacy/','/robots.txt'].includes(req.url);
   if(!(page&&req.method==='GET'||rest&&['GET','POST'].includes(req.method)))return send(res,404);
   if(rest&&(!active(c)||!c.activation.publisher))return send(res,503);
   if(rest&&!/^Basic [A-Za-z0-9+/=]+$/.test(req.headers.authorization??''))return send(res,401);
   if(req.method==='POST'&&!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))return send(res,415);
   return await proxy(req,res,c.wordpress.upstream,new URL(c.wordpress.origin).host,16384,{auth:rest,revision:true});
  }
  if(req.url==='/api/product-source'){
   if(req.method!=='POST')return send(res,405);
   if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))return send(res,415);
   return await proxy(req,res,c.source_origin,new URL(c.public_origin).host,4096);
  }
  const action=u.pathname.slice('/api/wordpress-publication/'.length);
  if(u.pathname.startsWith('/api/wordpress-publication/')&&actions.has(action)&&!u.search){
   if(!active(c)||!c.activation.publisher)return send(res,503);
   if(req.method!=='POST')return send(res,405);
   if(!/^Bearer [^\s]+$/.test(req.headers.authorization??''))return send(res,401);
   if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))return send(res,415);
   return await proxy(req,res,c.publication_origin,new URL(c.publication_origin).host,action==='measurement-save'?2100000:4096,{auth:true});
  }
  if(req.method!=='GET'||u.search||!assets.has(u.pathname))return send(res,404);
  let data=runtimeAssets(c)[u.pathname]??await readFile(new URL(u.pathname.slice(1),root),'utf8');
  const html=u.pathname.endsWith('.html');
  if(html)data=data.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/gi,''); // Header is authoritative for this candidate only.
  send(res,200,data,html?'text/html; charset=utf-8':u.pathname.endsWith('.mjs')?'text/javascript':u.pathname.endsWith('.css')?'text/css':'text/plain',{'content-security-policy':csp});
 }catch{send(res,403,'{"error":"Request denied"}');}};
}
export async function listenGateway(c){
 validateConfig(c);
 const server=https.createServer({key:privateFile(c.tls.key_file),cert:privateFile(c.tls.certificate_file),maxHeaderSize:16384,requestTimeout:15000,headersTimeout:10000,keepAliveTimeout:1000},await createHandler(c));
 server.maxConnections=32;server.on('clientError',(_e,s)=>s.destroy());server.on('upgrade',(_r,s)=>s.destroy());
 await new Promise((r,j)=>{server.once('error',j);server.listen(Number(new URL(c.listen_origin).port),'127.0.0.1',r);});
 return {close:()=>new Promise(resolve=>{const timer=setTimeout(()=>{server.closeAllConnections();resolve(false);},30000);server.close(()=>{clearTimeout(timer);resolve(true);});})};
}
if(process.argv[1]===new URL(import.meta.url).pathname){try{
 if(process.argv.length<3||process.argv.length>4)throw Error('Explicit config required');
 const c=validateConfig(JSON.parse(privateFile(process.argv[2])));
 if(active(c)&&c.activation.publisher){const p=loadHostConfig(process.argv[3]);if(p.listen_origin!==c.publication_origin||p.public_origin!==c.public_origin||p.service.authority.origin!==c.supabase.origin||p.service.authority.key!==c.supabase.publishable_key||p.wordpress.origin!==c.wordpress.origin||p.service.binding.page_id!==c.wordpress.page_id||!p.service.read_grant)throw Error('Publisher binding mismatch');}
 const host=await listenGateway(c);installShutdown(host);console.log('Private gateway ready');
}catch{console.error('Private gateway startup refused');process.exitCode=1;}}
