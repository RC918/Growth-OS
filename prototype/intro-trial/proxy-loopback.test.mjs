import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {requireAuthorizedProxy} from './proxy-guard.mjs';

const guardURL=new URL('./proxy-guard.mjs',import.meta.url).href;
async function listen(server,t){
 const sockets=new Set();server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));});
 return server.address().port;
}
async function child(url,proxy,{optIn=true,guard=true,noProxy=''}={}){
 // Deliberately minimal, synthetic child env: no inherited credentials, options,
 // CA overrides or platform proxy values. All destinations are loopback.
 const env={HTTP_PROXY:proxy,HTTPS_PROXY:proxy,NO_PROXY:noProxy};
 const script=`import {requireAuthorizedProxy} from ${JSON.stringify(guardURL)};
 try {${guard?'requireAuthorizedProxy();':''}
 const r=await fetch(${JSON.stringify(url)},{method:'POST',redirect:'error',headers:{Authorization:'Bearer FAKE_LOOPBACK_MARKER'},body:'fake input',signal:AbortSignal.timeout(1500)});
 console.log(JSON.stringify({status:r.status,body:await r.text()}));
 }catch(e){console.log(JSON.stringify({stopped:true}));process.exitCode=1;}`;
 return new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,[...(optIn?['--use-env-proxy']:[]),'--input-type=module','-e',script],{env,stdio:['ignore','pipe','pipe']});
  let out='';p.stdout.on('data',d=>out+=d);p.stderr.resume();
  const timer=setTimeout(()=>{p.kill('SIGKILL');reject(Error('loopback child timeout'));},5000);
  p.on('error',reject);p.on('exit',code=>{clearTimeout(timer);resolve({code,out});});
 });
}
test('real Node fetch child: opt-in tunnels fake marker; off is direct; guard blocks off; rejecting proxy never falls back',async t=>{
 let targetHits=0,connects=0,markers=0,refuse=false;
 const target=http.createServer((req,res)=>{targetHits++;assert.equal(req.headers.authorization,'Bearer FAKE_LOOPBACK_MARKER');req.resume();res.end('FAKE_LOOPBACK_RESULT');});
 const targetPort=await listen(target,t),authority='127.0.0.1:'+targetPort,url='http://'+authority+'/fake';
 const proxy=http.createServer((req,res)=>{res.writeHead(403);res.end();});
 proxy.on('connect',(req,socket,head)=>{
  connects++;assert.equal(req.url,authority);
  if(refuse){socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');return;}
  // Proxy forwards only this exact loopback authority; never DNS or external I/O.
  const upstream=net.connect({host:'127.0.0.1',port:targetPort},()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
  let seen='';socket.on('data',d=>{seen+=d.toString();if(seen.includes('FAKE_LOOPBACK_MARKER')){markers++;seen='';}});
  socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());
 });
 const proxyURL='http://127.0.0.1:'+await listen(proxy,t);
 let r=await child(url,proxyURL);assert.equal(r.code,0);assert.match(r.out,/FAKE_LOOPBACK_RESULT/);assert.equal(targetHits,1);assert.equal(connects,1);assert.equal(markers,1);
 r=await child(url,proxyURL,{optIn:false,guard:false});assert.equal(r.code,0);assert.equal(targetHits,2);assert.equal(connects,1);
 r=await child(url,proxyURL,{optIn:false});assert.equal(r.code,1);assert.equal(targetHits,2);assert.equal(connects,1);
 refuse=true;r=await child(url,proxyURL);assert.equal(r.code,1);assert.equal(targetHits,2);assert.ok(connects>=2);
 const before=connects;r=await child(url,proxyURL,{noProxy:'.openai.com'});assert.equal(r.code,1);assert.equal(connects,before);assert.equal(targetHits,2);
 // HTTPS also reaches the configured proxy. The deliberately non-TLS fake
 // target cannot complete TLS; no TLS bypass/CA installation is used.
 refuse=false;r=await child(url.replace('http:','https:'),proxyURL);assert.equal(r.code,1);assert.ok(connects>before);assert.equal(targetHits,2);
 t.diagnostic('Real child fetch: proxy marker observed; unguarded opt-out direct observed; guarded opt-out and NO_PROXY rejected; proxy refusal delivered 0 target requests. Loopback only.');
});
test('proxy preflight rejects bypass, empty effective proxy and TLS override without printing values',()=>{
 const good={HTTPS_PROXY:'http://FAKE_LOOPBACK_PROXY',NO_PROXY:'localhost,127.0.0.1,::1,.example.test'};
 assert.deepEqual(requireAuthorizedProxy(good,['--use-env-proxy']),{explicit_env_proxy:true,tls_verification:true});
 for(const patch of [{HTTPS_PROXY:''},{https_proxy:''},{NO_PROXY:'*'},{NO_PROXY:'.openai.com'},{NO_PROXY:'api.openai.com:443'},{no_proxy:'*.com'},{NO_PROXY:'malformed/entry'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{NODE_OPTIONS:'--no-use-env-proxy'}])assert.throws(()=>requireAuthorizedProxy({...good,...patch},['--use-env-proxy']));
 assert.throws(()=>requireAuthorizedProxy(good,[]),/PROXY_OPT_IN_REQUIRED/);
});
