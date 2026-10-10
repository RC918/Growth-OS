// Isolated runner only. Existing native GoTrue/PostgREST lifecycle, owned disposable DB, no hosted fallback.
import {nativeFixture} from '../private-site/recovery/native-fixture.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export async function start({mode}={}){
 if(mode!=='w1-isolated')throw Error('Explicit w1-isolated mode required');
 const native=await nativeFixture(),{ids,sql,call,login,authOrigin,restOrigin}=native;
 let server;const productIds={a:randomUUID(),b:randomUUID(),market:randomUUID(),foreign:randomUUID()};const sessions=new Map();let lose=null,posts=0;
 try{
 sql(await readFile('supabase/drafts/product_fact/install.sql','utf8'));
 const closed=sql("select has_function_privilege('authenticated','public.w1_change(uuid,uuid,uuid,integer,integer,text)','execute');");if(closed!=='f')throw Error('Candidate not closed');
 sql(await readFile('supabase/drafts/product_fact/enable-isolated.sql','utf8'));
 for(const [k,id]of Object.entries(productIds))sql(`insert into public.w1_products values('${id}','${k==='foreign'?ids.other:ids.org}','${k==='b'?'合成產品 B':'合成產品 A'}','${k==='market'?'EU':'TW'}','website','https://fixture.example.invalid/${k}','合成來源：設備外殼，戶外適用性未交代。',1,'unknown')`);
 const session=await login('owner');for(let i=0;i<50;i++){const r=await call(restOrigin,'/w1_state?select=*',{token:session.access_token});if(r.status===200)break;if(i===49)throw Error('W1 schema cache timeout');await new Promise(r=>setTimeout(r,100));}
 await call(authOrigin,'/logout?scope=local',{method:'POST',token:session.access_token});
 const assets=new Set(['product-fact.html','product-fact.mjs','first-result.css','product-fact.css']);let origin;
 server=createServer(async(req,res)=>{
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
  const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
  try{
   const u=new URL(req.url,origin);if(req.headers.host!==new URL(origin).host)return send(403,{});
   if(!u.pathname.startsWith('/w1/')){const name=u.pathname.slice(1)||'product-fact.html';if(req.method!=='GET'||!assets.has(name))return send(404,{});res.writeHead(200,{'content-type':name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});return res.end(await readFile('apps/web/'+name));}
   if(req.method==='POST'&&req.headers.origin!==origin)return send(403,{});
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)return send(413,{});}const body=raw?JSON.parse(raw):undefined;
   const route=u.pathname.slice(4),token=req.headers.authorization?.replace(/^Bearer /,'');
   if(route==='login'&&req.method==='POST'){
    if(!['owner','viewer','foreign'].includes(body?.actor))return send(400,{});
    const s=await login(body.actor);sessions.set(s.access_token,{role:body.actor,refresh:s.refresh_token});return send(200,{access_token:s.access_token});
   }
   if(!sessions.has(token))return send(401,{});
   if((await call(authOrigin,'/user',{token})).status!==200)return send(401,{});
   if(route==='logout'&&req.method==='POST'){await call(authOrigin,'/logout?scope=local',{method:'POST',token});sessions.delete(token);return send(200,{});}
   if(route==='user'&&req.method==='GET')return send(200,{role:sessions.get(token).role});
   let target;
   if(req.method==='GET'){
    if(route==='state')target='/w1_state?select=*&order=name,market,id';
    else if(route==='history'&&/^[a-f0-9-]{36}$/.test(u.searchParams.get('product')||''))target='/w1_drafts?select=*&product_id=eq.'+u.searchParams.get('product')+'&order=version';
    else if(route==='receipt'&&/^[a-f0-9-]{36}$/.test(u.searchParams.get('request')||''))target='/w1_requests?select=*&request_id=eq.'+u.searchParams.get('request');
    else return send(404,{});
    const r=await call(restOrigin,target,{token});return send(r.status,route==='receipt'&&r.status===200?r.data[0]??null:r.data);
   }
   if(req.method==='POST'&&['answer','review'].includes(route)){
    posts++;const r=await call(restOrigin,'/rpc/'+(route==='answer'?'w1_change':'w1_review'),{method:'POST',token,body});
    if(lose===route&&r.status===200){lose=null;return send(502,{message:'Simulated committed operation with lost upstream reply'});}
    return send(r.status,r.data);
   }return send(404,{});
  }catch{return send(500,{message:'Isolated request failed; reconcile original request.'});}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 return {native,productIds,origin,dropNext:kind=>{lose=kind;},posts:()=>posts,async close(){sessions.clear();server.closeAllConnections();await new Promise(r=>server.close(r));await native.close();}};
 }catch(e){if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}await native.close();throw e;}
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 if(process.argv[2]!=='--serve-isolated')throw Error('Use --serve-isolated; never a deployment entrypoint');
 const rig=await start({mode:'w1-isolated'});console.log('Synthetic W1 only: '+rig.origin+'/product-fact.html');
 const close=async()=>{await rig.close();process.exit();};process.once('SIGINT',close);process.once('SIGTERM',close);setTimeout(close,30*60*1000).unref();
}
