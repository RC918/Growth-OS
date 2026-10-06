import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,chmodSync} from 'node:fs';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {validateConfig,runtimeAssets,listenGateway} from './gateway.mjs';
import {freeOrigin} from '../wordpress-pilot/host-fixture-client.mjs';
const backend='https://wqepyttadrcnphtyjpjy.supabase.co';
async function fixture(t){
 const root=mkdtempSync('/tmp/growth-wiring-test-'),seen=[];
 const upstream=http.createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;seen.push({url:req.url,headers:req.headers,method:req.method,body});res.writeHead(req.url.includes('redirect')?302:200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true}));});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const up='http://127.0.0.1:'+upstream.address().port;
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',root+'/key','-out',root+'/cert','-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1,DNS:app.example.invalid,DNS:site.example.invalid'],{stdio:'ignore'});chmodSync(root+'/cert',0o600);
 const c={enabled:true,listen_origin:(await freeOrigin()).replace('http:','https:'),public_origin:'https://app.example.invalid',supabase:{origin:backend,allowed_origins:[backend],publishable_key:'sb_publishable_fixture'},source_origin:up,publication_origin:up,activation:null,wordpress:{origin:'https://site.example.invalid',upstream:up,page_id:71},tls:{certificate_file:root+'/cert',key_file:root+'/key'}};
 let gateway;const agent=new https.Agent({ca:readFileSync(root+'/cert')});
 t.after(async()=>{await gateway?.close();agent.destroy();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));rmSync(root,{recursive:true,force:true});});
 const request=(path,options={})=>new Promise((resolve,reject)=>{const req=https.request(c.listen_origin+path,{agent,servername:'app.example.invalid',method:options.method??'GET',headers:options.rawHeaders??{host:new URL(c.public_origin).host,...options.headers}},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end(options.body);});
 return {root,c,seen,request,async start(){gateway=await listenGateway(validateConfig(c));},async stop(){await gateway.close();gateway=null;}};
}
const activation=()=>({approval_reference:'owned-short-synthetic-run',expires_at:Date.now()+60000,save_review_rpcs:['review_url_result','save_url_result_draft'],publisher:true});
test('closed/missing/unsafe config and old/wildcard backend cannot start; no credentials logged',async t=>{
 const f=await fixture(t);validateConfig(f.c);
 for(const mutate of [c=>c.enabled=false,c=>c.supabase.origin='https://vhzryhibmpvglzcmfnaa.supabase.co',c=>c.supabase.allowed_origins=['https://*.supabase.co'],c=>c.supabase.allowed_origins.push('https://other.supabase.co'),c=>c.supabase.publishable_key='service_role_secret',c=>c.source_origin='http://169.254.169.254',c=>c.listen_origin='https://0.0.0.0:443',c=>c.activation={...activation(),save_review_rpcs:['arbitrary']}]){const c=structuredClone(f.c);mutate(c);assert.throws(()=>validateConfig(c));}
 for(const args of [[],['prototype/private-site/config.example.json'],[f.root+'/absent']]){const r=spawnSync(process.execPath,['prototype/private-site/gateway.mjs',...args],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stderr.trim(),'Private gateway startup refused');}
 const p=f.root+'/config';writeFileSync(p,JSON.stringify(f.c),{mode:0o644});chmodSync(p,0o644);assert.equal(spawnSync(process.execPath,['prototype/private-site/gateway.mjs',p]).status,1);
 chmodSync(p,0o600);writeFileSync(p,JSON.stringify({...f.c,activation:activation()}));assert.equal(spawnSync(process.execPath,['prototype/private-site/gateway.mjs',p,f.root+'/absent']).status,1);
});
test('TLS entry serves precise runtime/CSP, closed flags, no backend proxy or sensitive files; restart same config',async t=>{
 const f=await fixture(t);await f.start();
 const html=await f.request('/workspace.html');assert.equal(html.status,200);assert.ok(html.headers['content-security-policy'].includes(backend));assert.doesNotMatch(html.headers['content-security-policy'],/vhzry|\*|unsafe/);assert.doesNotMatch(html.body,/http-equiv="Content-Security-Policy"/);
 const runtime=await f.request('/workspace-runtime.mjs');assert.ok(runtime.body.includes(backend));assert.doesNotMatch(runtime.body,/vhzry|service_role|\/backend/);
 assert.match((await f.request('/url-result-config.mjs')).body,/urlSaveEnabled=false/);assert.match((await f.request('/wordpress-publication-config.mjs')).body,/wordpressPublicationEnabled=false/);
 for(const path of ['/backend/auth/v1/user','/.git/config','/config.example.json','/../gateway.mjs','/%2e%2e/config','/workspace.html?x=1','/api/product-source?url=secret','/api/wordpress-publication/admin'])assert.notEqual((await f.request(path)).status,200,path);
 assert.equal((await f.request('/api/wordpress-publication/history',{method:'POST'})).status,503);assert.equal(f.seen.length,0);
 await f.stop();await f.start();assert.equal((await f.request('/workspace-runtime.mjs')).body,runtime.body);
});
test('source keeps public Host; publisher gets loopback Host; forwarding/cookies stripped, precise Origin/method/routes',async t=>{
 const f=await fixture(t);f.c.activation=activation();await f.start();const headers={origin:f.c.public_origin,'content-type':'application/json',authorization:'Bearer test',cookie:'secret=cookie','x-forwarded-host':'evil','x-forwarded-for':'metadata'};
 let r=await f.request('/api/product-source',{method:'POST',headers,body:'{"url":"https://source.example/product"}'});assert.equal(r.status,200);let s=f.seen.at(-1);assert.equal(s.headers.host,'app.example.invalid');assert.equal(s.headers.origin,f.c.public_origin);for(const h of ['authorization','cookie','x-forwarded-for','x-forwarded-host'])assert.equal(s.headers[h],undefined);
 r=await f.request('/api/wordpress-publication/history',{method:'POST',headers,body:'{"version_id":"one"}'});assert.equal(r.status,200);s=f.seen.at(-1);assert.equal(s.headers.host,new URL(f.c.publication_origin).host);assert.equal(s.headers.authorization,'Bearer test');assert.equal(s.headers.origin,f.c.public_origin);assert.equal(s.headers.cookie,undefined);
 const before=f.seen.length;
 for(const [path,options]of [['/api/product-source',{method:'POST',headers:{...headers,origin:'https://evil.example'},body:'{}'}],['/api/product-source',{method:'POST',headers:{...headers,host:'evil.example'},body:'{}'}],['/api/product-source',{method:'POST',headers,body:'x'.repeat(4097)}],['/api/wordpress-publication/history',{headers}],['/api/wordpress-publication/history?retry=1',{method:'POST',headers,body:'{}'}],['/api/product-source',{method:'POST',headers:{...headers,'content-encoding':'gzip'},body:'{}'}],['/workspace.html',{rawHeaders:['Host','app.example.invalid','Origin',f.c.public_origin,'Origin',f.c.public_origin]}]])assert.notEqual((await f.request(path,options)).status,200);
 assert.equal(f.seen.length,before);
 // Expiry checked on every request and config response, not only on startup.
 f.c.activation.expires_at=0;await f.stop();await f.start();assert.equal((await f.request('/api/wordpress-publication/history',{method:'POST',headers,body:'{}'})).status,503);assert.match(runtimeAssets(f.c)['/url-result-config.mjs'],/urlReviewEnabled=false/);
});
test('WordPress exact page REST and three public paths only; no admin, other page, query mutation or cookie',async t=>{
 const f=await fixture(t);f.c.activation=activation();await f.start();const headers={host:'site.example.invalid',authorization:'Basic dGVzdDp0ZXN0','content-type':'application/json',cookie:'wordpress_logged_in=fake','x-forwarded-proto':'http','x-growth-before':'revision'};
 assert.equal((await f.request('/growth-os/',{headers})).status,200);assert.equal(f.seen.at(-1).headers.authorization,undefined);
 const path='/?rest_route=/wp/v2/pages/71&context=edit';assert.equal((await f.request(path,{method:'POST',headers,body:'{}'})).status,200);assert.equal(f.seen.at(-1).headers['x-forwarded-proto'],'https');assert.equal(f.seen.at(-1).headers.host,'site.example.invalid');assert.equal(f.seen.at(-1).headers.cookie,undefined);assert.equal(f.seen.at(-1).headers['x-growth-before'],'revision');
 const n=f.seen.length;for(const path of ['/wp-admin/','/wp-login.php','/?rest_route=/wp/v2/pages/72&context=edit','/?rest_route=/wp/v2/pages/71&context=edit&excerpt=change','/growth-os/?x=1'])assert.equal((await f.request(path,{method:'POST',headers,body:'{}'})).status,404);assert.equal(f.seen.length,n);
});
test('real gateway child SIGTERM exits cleanly and new PID serves same TLS/runtime without listeners remaining',async t=>{
 const f=await fixture(t),p=f.root+'/config';writeFileSync(p,JSON.stringify(f.c),{mode:0o600});
 async function child(){const p=spawn(process.execPath,['prototype/private-site/gateway.mjs',f.root+'/config'],{stdio:['ignore','pipe','pipe']});const exit=new Promise(r=>p.once('exit',r));t.after(()=>{if(p.exitCode===null)p.kill('SIGKILL');});await new Promise((r,j)=>{p.stdout.once('data',r);p.once('exit',()=>j(Error('startup failed')));});return {p,exit};}
 const a=await child();const before=await f.request('/workspace-runtime.mjs');assert.equal(before.status,200);a.p.kill('SIGTERM');assert.equal(await a.exit,0);
 const b=await child();assert.notEqual(a.p.pid,b.p.pid);assert.equal((await f.request('/workspace-runtime.mjs')).body,before.body);b.p.kill('SIGTERM');assert.equal(await b.exit,0);
});
test('candidate Compose renders only loopback port, pinned images and no implicit host path creation',()=>{
 const c=JSON.parse(execFileSync('docker',['compose','-f','prototype/private-site/templates/wordpress.compose.yml','config','--format','json'],{encoding:'utf8'}));assert.equal(c.services.database.ports[0].host_ip,'127.0.0.1');assert.equal(c.services.wordpress.network_mode,'service:database');for(const s of Object.values(c.services)){assert.match(s.image,/@sha256:[a-f0-9]{64}$/);assert.equal(s.restart,'no');for(const v of s.volumes)assert.notEqual(v.bind.create_host_path,true);}
 for(const name of ['gateway','publication','source']){const s=readFileSync('prototype/private-site/templates/growth-'+name+'.service','utf8');assert.match(s,/Restart=no/);assert.match(s,/TimeoutStopSec=40/);assert.match(s,/NoNewPrivileges=true/);}
});
