// Offline test-only HTTP persistence and Chromium/CDP harness. No hosted Auth,
// database, Postgres JSONB digest, or RLS claims are made by this synthetic service.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,rename,mkdtemp,cp} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {appendFileSync,writeFileSync,realpathSync,readlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {canonical,validateReport} from '../../apps/web/first-result-payload.mjs';
import {build} from '../web-preview/build.mjs';
import {applyHandoffBridge} from '../web-preview/handoff-bridge.mjs';
import {applyReviewFlag} from '../web-preview/review-flag.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let dispatchTrace=null;
const traceDispatch=event=>{if(dispatchTrace)appendFileSync(dispatchTrace,JSON.stringify(event)+'\n');};
const bounded=async(promise,label,ms=6000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('TEST_ONLY timeout '+label)),ms);})]);}finally{clearTimeout(timer);}};
export const testOrigin='https://claim-offline.supabase.co';
export const ids={org:'11111111-1111-4111-8111-111111111111',foreignOrg:'22222222-2222-4222-8222-222222222222',owner:'33333333-3333-4333-8333-333333333333',viewer:'44444444-4444-4444-8444-444444444444',foreign:'55555555-5555-4555-8555-555555555555'};
export const producerReport=(kind='normal')=>JSON.parse(execFileSync('python3',['-B','delivery/growth-console/claim-source-fixture.py','--report',kind],{encoding:'utf8'}));
export async function startTestService({storePath,directory,report=producerReport()}={}){
 let state;try{state=JSON.parse(await readFile(storePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={versions:[],opportunities:[],reviews:[]};}
 const sessions=new Map(),requests=[];let lose=null,hold=null;
 const persist=async()=>{await writeFile(storePath+'.tmp',JSON.stringify(state));await rename(storePath+'.tmp',storePath);};
 const respond=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const server=createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://localhost'),path=u.pathname.replace(/^\/backend/,'');
  if(path.startsWith('/auth/')||path.startsWith('/rest/')){
   const session=sessions.get(req.headers.authorization?.replace('Bearer ',''));
   let body=null;if(req.method==='POST'){let text='';for await(const chunk of req)text+=chunk;body=JSON.parse(text);}
   requests.push({method:req.method,path,query:u.search,actor:session?.actor??'anonymous',role:session?.role??null,body});
   appendFileSync(storePath+'.incoming.jsonl',JSON.stringify({at:new Date().toISOString(),kind:'server-inbound',sequence:requests.length,method:req.method,path,dispatch_id:req.headers['x-test-dispatch-id']??null,connection_port:req.socket.remotePort,request_id:body?.p_request_id??null,body_sha256:body?createHash('sha256').update(canonical(body)).digest('hex'):null})+'\n');
   if(!session)return respond(res,401,{code:'TEST_ONLY_UNAUTHENTICATED'});
   if(hold&&path===hold.path){const item=hold;hold=null;item.enter();await item.promise;}
   if(path==='/auth/v1/user')return respond(res,200,{id:session.actor});
   if(req.method==='POST'){
    if(session.role!=='owner'||body.p_organization_id!==session.org)return respond(res,403,{code:'TEST_ONLY_SCOPE_DENIED'});
    let value;
    if(path==='/rest/v1/rpc/save_url_result_draft'){
     assert.deepEqual(Object.keys(body).sort(),['p_organization_id','p_opportunity_id','p_request_id','p_expected_version','p_payload'].sort());
     await validateReport(body.p_payload);
     const prior=state.versions.find(v=>v.first_result_request_id===body.p_request_id);
     if(prior){assert.equal(canonical(prior.first_result_payload),canonical(body.p_payload));value=prior.id;}
     else{
      const versions=state.versions.filter(v=>v.organization_id===session.org&&v.opportunity_id===body.p_opportunity_id);
      if(Math.max(0,...versions.map(v=>v.version_number))!==body.p_expected_version)return respond(res,409,{code:'TEST_ONLY_VERSION_CONFLICT'});
      const p=body.p_payload,s=p.snapshot;
      const row={id:randomUUID(),organization_id:session.org,created_by:session.actor,opportunity_id:body.p_opportunity_id,version_number:body.p_expected_version+1,title:p.preview.fields.title.suggested,draft_body:p.preview.fields.description.suggested,status:'draft',created_at:new Date().toISOString(),first_result_request_id:body.p_request_id,first_result_expected_version:body.p_expected_version,
       // Format only. Not the PostgreSQL authoritative request digest algorithm.
       first_result_request_digest:'pg-jsonb-sha256:'+createHash('sha256').update('TEST_ONLY:'+canonical(body)).digest('hex'),first_result_payload:p};
      state.versions.push(row);value=row.id;
      if(!state.opportunities.some(o=>o.id===row.opportunity_id))state.opportunities.push({id:row.opportunity_id,organization_id:session.org,entry_kind:'url_result',source_identity:{original_url:s.original_url,final_url:s.final_url,snapshot_id:s.id,source_version:s.version,source_digest:s.content_fingerprint},status:'draft',created_at:row.created_at,channel:'website',audience_need:'Test-only',proposed_action:'Test-only',rationale:'Test-only',evidence_confidence:'source_asserted'});
     }
    }else if(path==='/rest/v1/rpc/review_url_result'){
     assert.deepEqual(Object.keys(body).sort(),['p_organization_id','p_version_id','p_request_id','p_source_digest','p_content_digest','p_version_digest','p_checks'].sort());
     const v=state.versions.find(v=>v.id===body.p_version_id&&v.organization_id===session.org);
     if(!v||v.first_result_payload.snapshot.content_fingerprint!==body.p_source_digest||v.first_result_payload.review.content_digest!==body.p_content_digest||v.first_result_request_digest!==body.p_version_digest||state.versions.some(n=>n.opportunity_id===v.opportunity_id&&n.version_number>v.version_number))return respond(res,409,{code:'TEST_ONLY_STALE_VERSION'});
     assert.equal(canonical(body.p_checks),canonical({title:true,meta_description:true,description:true,source:true,blocking_facts_clear:true}));
     if(state.reviews.some(r=>r.version_id===v.id))return respond(res,409,{code:'TEST_ONLY_ALREADY_REVIEWED'});
     const row={id:randomUUID(),organization_id:session.org,version_id:v.id,actor_user_id:session.actor,decision:'approved',reason:'Test-only exact-version review',reviewed_at:new Date().toISOString(),url_review_request_id:body.p_request_id,url_review_source_digest:body.p_source_digest,url_review_content_digest:body.p_content_digest,url_review_version_digest:body.p_version_digest,url_review_checks:body.p_checks};
     state.reviews.push(row);value=row.id;
    }else return respond(res,403,{code:'TEST_ONLY_RPC_NOT_ALLOWED'});
    await persist();
    if(lose?.path===path){const loss=lose;lose=null;if(loss.mode==='socket'){res.destroy();return;}res.setHeader('X-Test-Lost-Reply','reject-native-fetch');}
    return respond(res,200,value);
   }
   const table=path.split('/').pop();let rows=[];
   if(table==='organization_members')rows=[{organization_id:session.org,role:session.role,user_id:session.actor}];
   else if(table==='organizations')rows=[{id:session.org,name:'離線 TEST-ONLY 工作區 · 非真實登入',business_model:'ecommerce'}];
   else if(table==='content_versions')rows=state.versions.filter(v=>v.organization_id===session.org);
   else if(table==='growth_opportunities')rows=state.opportunities.filter(v=>v.organization_id===session.org);
   else if(table==='content_reviews')rows=state.reviews.filter(v=>v.organization_id===session.org);
   for(const [key,value]of u.searchParams)if(value.startsWith('eq.'))rows=rows.filter(row=>String(row[key])===value.slice(3));
   if(u.searchParams.get('order')?.startsWith('version_number.desc'))rows=rows.toSorted((a,b)=>b.version_number-a.version_number);
   const limit=Number(u.searchParams.get('limit')||1000);rows=rows.slice(0,limit);
   const columns=u.searchParams.get('select')?.split(',');if(columns)rows=rows.map(row=>Object.fromEntries(columns.map(k=>[k,row[k]])));
   return respond(res,200,rows);
  }
  if(req.method==='POST'&&path==='/api/product-source'){
   let text='';for await(const chunk of req)text+=chunk;
   if(JSON.parse(text).url!==report.snapshot.original_url)return respond(res,422,{code:'unsupported'});
   return respond(res,200,report);
  }
  if(req.method!=='GET'||!directory)return respond(res,404,{});
  let name=decodeURIComponent(u.pathname).replace(/^\/console-assets\//,'/').slice(1)||'growth-console.html';
  if(name==='growth-console')name='growth-console.html';
  if(name.includes('/')||name.includes('..'))return respond(res,404,{});
  let bytes=await readFile(directory+'/'+name);
  if(name==='workspace-runtime.mjs')bytes=Buffer.from(`// TEST ONLY: synthetic session service, not hosted Auth.\nexport const workspaceRuntime={origin:${JSON.stringify(testOrigin)},key:'sb_publishable_test_only'};\nexport const workspaceFetch=(url,options)=>{const u=new URL(url);if(u.origin!==${JSON.stringify(testOrigin)})throw Error('Offline boundary');const dispatch_id=crypto.randomUUID(),event={dispatch_id,method:options?.method||'GET',path:u.pathname,request_id:options?.body?JSON.parse(options.body).p_request_id??null:null};const record=stage=>console.info('GOS_TEST_FETCH',JSON.stringify({...event,stage}));record('dispatch');return fetch('/backend'+u.pathname+u.search,{...options,headers:{...options?.headers,'X-Test-Dispatch-ID':dispatch_id}}).then(response=>{record('resolved');return response;},error=>{record('rejected');throw error;});};`);
  if(name==='url-result-config.mjs')bytes=Buffer.from('export const urlResultSchemaEnabled=true,urlSaveEnabled=true,urlSaveTrial=null,urlReviewSchemaEnabled=true,urlReviewEnabled=true,urlReviewTrial=null; // TEST-ONLY flags, no deployed config changes\n');
  if(name.endsWith('.html'))bytes=Buffer.from(bytes.toString().replace('<body>','<body><p role="note" id="test-only">離線 TEST-ONLY 持久化服務 · 合成工作階段，非真實登入；未部署</p>'));
  res.writeHead(200,{'Content-Type':name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'text/html','Cache-Control':'no-store'});res.end(bytes);
 }catch(e){if(e.code==='ENOENT')return respond(res,404,{});respond(res,422,{code:'TEST_ONLY_INVALID_REQUEST',message:e.message});}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 return {origin,requests,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}),snapshot:()=>structuredClone(state),
  session(role='owner'){const token='test-only-'+randomUUID(),org=role==='foreign'?ids.foreignOrg:ids.org,actor=ids[role];sessions.set(token,{actor,org,role:role==='foreign'?'owner':role});return token;},
  loseNext(path,mode='socket'){assert.ok(['socket','cdp-response'].includes(mode));lose={path,mode};},
  holdNext(path){let enter,release;const entered=new Promise(r=>enter=r),promise=new Promise(r=>release=r);hold={path,enter,promise};return {entered,release};},
  fetchImpl(url,options){const u=new URL(url);assert.equal(u.origin,testOrigin);return fetch(origin+'/backend'+u.pathname+u.search,options);}
 };
}

class CDP{
 constructor(ws){this.ws=ws;this.next=0;this.pending=new Map();this.events=[];ws.addEventListener('close',()=>{for(const p of this.pending.values())p.reject(Error('TEST_ONLY CDP closed'));this.pending.clear();});ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else{this.events.push(m);if(m.method==='Runtime.consoleAPICalled'&&m.params.args?.[0]?.value==='GOS_TEST_FETCH')traceDispatch({...JSON.parse(m.params.args[1].value),session_id:m.sessionId,console_timestamp:m.params.timestamp,at:new Date().toISOString()});if(m.method==='Fetch.requestPaused'){const reject=m.params.responseHeaders?.some(h=>h.name.toLowerCase()==='x-test-lost-reply'&&h.value==='reject-native-fetch');traceDispatch({kind:'cdp-response',stage:reject?'reject-response':'continue-response',path:new URL(m.params.request.url).pathname,network_id:m.params.networkId});void this.send(reject?'Fetch.failRequest':'Fetch.continueResponse',{requestId:m.params.requestId,...(reject?{errorReason:'Failed'}:{})},m.sessionId).catch(error=>traceDispatch({kind:'interception-error',message:error.message}));}}});}
 static async connect(url){const ws=new WebSocket(url);await bounded(new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});}),'CDP connect');return new CDP(ws);}
 send(method,params={},sessionId){const id=++this.next;return bounded(new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));}),method).finally(()=>this.pending.delete(id));}
 async tab(targetId){const {sessionId}=await this.send('Target.attachToTarget',{targetId,flatten:true});const send=(m,p)=>this.send(m,p,sessionId);
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const wait=async expression=>{for(let n=0;n<160;n++){if(await evaluate(expression))return;await delay(50);}throw Error('UI wait timed out: '+expression);};
  const key=async(key,code,vk)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});if(key==='Enter'||key===' ')await send('Input.dispatchKeyEvent',{type:'char',key,code,text:key==='Enter'?'\r':' ',unmodifiedText:key==='Enter'?'\r':' ',windowsVirtualKeyCode:vk});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});};
  const click=async selector=>{const box=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||n.closest('[hidden]'))throw Error('Unavailable '+${JSON.stringify(selector)});n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box});};
  return {id:targetId,sessionId,send,evaluate,wait,key,click,navigate:async url=>{await send('Page.navigate',{url});await wait("document.readyState==='complete'");},fill:async(selector,text)=>{await click(selector);await key('a','KeyA',65).catch(()=>{});await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);await send('Input.insertText',{text});},focus:selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`),screenshot:async path=>{const result=await send('Page.captureScreenshot',{captureBeyondViewport:true});await writeFile(path,Buffer.from(result.data,'base64'));}};
 }
}

export async function captureFailure(error,{cdp,service,evidence}){
  console.error(error.stack);const failure={error:error.message,stack:error.stack,pages:[],capture_errors:[]};const save=()=>writeFile(evidence+'/browser-failure.json',JSON.stringify(failure,null,2));await save();await writeFile(evidence+'/rpc-requests.json',JSON.stringify(service.requests,null,2));
  if(cdp){try{const {targetInfos}=await cdp.send('Target.getTargets');const tabs=[];for(const target of targetInfos.filter(t=>t.type==='page')){try{const tab=await cdp.tab(target.targetId);failure.pages.push({url:target.url.split('#')[0],text:await tab.evaluate('document.body?.innerText'),inputs:await tab.evaluate("Array.from(document.querySelectorAll('input')).map(n=>({id:n.id,value:n.type==='checkbox'?n.checked:n.value}))")});tabs.push(tab);}catch(capture){failure.capture_errors.push({stage:'DOM',error:capture.message});}await save();}for(const tab of tabs){try{await tab.screenshot(evidence+'/failure-'+tab.id+'.png');}catch(capture){failure.capture_errors.push({stage:'screenshot',target_id:tab.id,error:capture.message});await save();}}}catch(capture){failure.capture_errors.push({stage:'targets',error:capture.message});}await save();}
}

export function observeChromiumLaunch({executable,args,evidence}){
 const resolve=fn=>{try{return fn();}catch{return null;}};
 const state={executable,realpath:resolve(()=>realpathSync(executable)),argv:[executable,...args],node:process.version,platform:process.platform,arch:process.arch,pid:null,runtime_executable:null,spawn_error:null,exit_code:null,signal:null,finished:false,ready:false,stderr_tail:''};
 const save=()=>writeFileSync(evidence+'/chromium-startup.json',JSON.stringify(state,null,2));
 writeFileSync(evidence+'/chromium-stderr.log','');save();
 const child=spawn(executable,args,{stdio:['ignore','ignore','pipe']});let closed=false;
 const closedPromise=new Promise(resolve=>child.once('close',()=>{closed=true;save();resolve();}));
 child.once('spawn',()=>{state.pid=child.pid;state.runtime_executable=resolve(()=>readlinkSync('/proc/'+child.pid+'/exe'));save();});
 child.stderr?.on('data',data=>{appendFileSync(evidence+'/chromium-stderr.log',data);state.stderr_tail=(state.stderr_tail+data.toString()).slice(-32768);save();});
 child.once('error',error=>{state.spawn_error=Object.fromEntries(['name','message','code','errno','syscall'].map(k=>[k,error[k]??null]));state.finished=true;save();});
 child.once('exit',(code,signal)=>{state.exit_code=code;state.signal=signal;state.finished=true;save();});
 return {child,snapshot:()=>structuredClone(state),markReady(){state.ready=true;state.runtime_executable=resolve(()=>readlinkSync('/proc/'+child.pid+'/exe'));save();},async stop(){if(!closed){child.kill('SIGTERM');let timer;try{await Promise.race([closedPromise,new Promise(resolve=>{timer=setTimeout(resolve,2000);})]);}finally{clearTimeout(timer);}if(!closed){child.kill('SIGKILL');await bounded(closedPromise,'Chromium close');}}}};
}

export async function waitForDevTools(launch,userData,{timeoutMs=30000}={}){
 const started=Date.now();
 while(Date.now()-started<timeoutMs){
  try{
   const lines=(await readFile(userData+'/DevToolsActivePort','utf8')).trim().split('\n');
   const port=Number(lines[0]);
   if(/^\d+$/.test(lines[0])&&port>0&&port<=65535&&/^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(lines[1])){
    launch.markReady();return lines;
   }
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const state=launch.snapshot();
  if(state.finished)throw Error('Chromium exited before DevTools became ready');
  await delay(50);
 }
 throw Error('Chromium DevTools readiness deadline exceeded');
}

export async function buildPreviewAcceptance({directory,evidence}){
 // Same frontend pipeline as Vercel; the test service still replaces Auth,
 // backend and UI flags. The final hashes include post-build bridge changes.
 const config=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url)));
 assert.equal(config.buildCommand,'node delivery/web-preview/build.mjs && node delivery/web-preview/handoff-bridge.mjs && node delivery/web-preview/review-flag.mjs');
 const dist=new URL('../web-preview/dist/',import.meta.url);
 const manifest=await build();await applyHandoffBridge(dist);await applyReviewFlag(dist,{});
 await cp(dist,directory,{recursive:true});
 for(const name of Object.keys(manifest.files)){const entry=manifest.files[name];entry.output_sha256=createHash('sha256').update(await readFile(directory+'/'+name)).digest('hex');entry.derived=entry.source_sha256!==entry.output_sha256;}
 manifest.kind='preview-acceptance-after-handoff-bridge';
 await writeFile(evidence+'/preview-build-manifest.json',JSON.stringify(manifest,null,2));
 return manifest;
}

async function browserRun(){
 // Use the repository's pinned Playwright browser, as the other Console
 // suites do. A preinstalled /usr/bin/chromium is unrelated to that install.
 const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||createRequire(import.meta.url)('playwright').chromium.executablePath();
 const evidence=process.argv[2]||await mkdtemp('/tmp/gos-beta-e2e-');await mkdir(evidence,{recursive:true});
 dispatchTrace=evidence+'/browser-dispatch.jsonl';
 const directory=evidence+'/site';await buildPreviewAcceptance({directory,evidence});
 const report=producerReport(),service=await startTestService({storePath:evidence+'/test-only-store.json',directory,report});
 const userData=evidence+'/chromium-profile';const launch=observeChromiumLaunch({executable,args:['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+userData,'about:blank'],evidence});
 let cdp;const results=[];try{
  const port=await waitForDevTools(launch,userData);cdp=await CDP.connect('ws://127.0.0.1:'+port[0]+port[1]);
  for(const width of [1280,390]){
   const {browserContextId}=await cdp.send('Target.createBrowserContext',{disposeOnDetach:true});
   const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank',browserContextId});const page=await cdp.tab(targetId);
   await page.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
   await page.navigate(service.origin+'/growth-console.html');await page.wait("!!document.querySelector('#source-url')");
   await page.fill('#source-url',report.snapshot.original_url);await page.key('Enter','Enter',13);
   await page.wait("document.querySelector('#claim-status').textContent.includes('REVIEW')");
   await page.fill('#field-description','Made of steel.');
   await page.wait("document.querySelector('#claim-status').textContent.includes('REVIEW')");
   for(const k of ['title','meta_description','description']){await page.focus('#check-'+k);await page.key(' ','Space',32);}
   await page.focus('#review-confirm');await page.key('Enter','Enter',13);await page.wait("!document.querySelector('#workspace-handoff').disabled");
   await page.fill('#field-description','Not made of steel.');await page.wait("document.querySelector('#claim-status').textContent.includes('未通過')");
   assert.equal(await page.evaluate("document.querySelector('#workspace-handoff').disabled"),true);
   await page.fill('#field-description','Made of steel.');await page.wait("document.querySelector('#claim-status').textContent.includes('REVIEW')");
   await page.focus('#check-description');await page.key(' ','Space',32);await page.focus('#review-confirm');await page.key('Enter','Enter',13);await page.wait("!document.querySelector('#workspace-handoff').disabled");
   await page.click('#later');await page.click('#return-result');assert.equal(await page.evaluate("document.querySelector('#field-description').value"),'Made of steel.');
   assert.equal(await page.evaluate('localStorage.length'),0);
   await page.screenshot(evidence+'/console-'+width+'.png');
   await page.click('#workspace-handoff');await page.click('#handoff-cancel');assert.match(await page.evaluate("document.querySelector('#handoff-feedback').textContent"),/已取消/);
   {const {targetInfos}=await cdp.send('Target.getTargets');for(const peer of targetInfos.filter(t=>t.openerId===targetId))await cdp.send('Target.closeTarget',{targetId:peer.targetId});}
   await page.click('#workspace-handoff');
   let peerId;for(let n=0;n<100;n++){const {targetInfos}=await cdp.send('Target.getTargets');peerId=targetInfos.find(t=>t.openerId===targetId)?.targetId;if(peerId)break;await delay(50);}assert.ok(peerId);
   const workspace=await cdp.tab(peerId);await workspace.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
   const firstSession=service.session();await workspace.navigate(service.origin+'/workspace.html?test-only=new-session#access_token='+firstSession+'&token_type=bearer&expires_in=3600');
   await workspace.wait("!!document.querySelector('#save-url-result')&&!document.querySelector('#save-url-result').disabled");
   const savePosts=service.requests.filter(r=>r.method==='POST').length;
   await workspace.send('Fetch.enable',{patterns:[{urlPattern:service.origin+'/backend/rest/v1/rpc/*',requestStage:'Response'}]});
   if(width===1280)service.loseNext('/rest/v1/rpc/save_url_result_draft','cdp-response');
   await workspace.focus('#save-url-result');await workspace.key('Enter','Enter',13);
   await workspace.key('Enter','Enter',13);
   if(width===1280){
    await workspace.wait("document.querySelector('#url-save-feedback').textContent.includes('不會重試')");assert.equal(await workspace.evaluate("document.querySelector('#save-url-result').disabled"),true);
    const traces=()=>cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.args?.[0]?.value==='GOS_TEST_FETCH').map(e=>JSON.parse(e.params.args[1].value)).filter(e=>e.method==='POST'&&e.path==='/rest/v1/rpc/save_url_result_draft');
    assert.equal(new Set(traces().filter(e=>e.stage==='dispatch').map(e=>e.dispatch_id)).size,1);assert.equal(traces().filter(e=>e.stage==='rejected').length,1,'native fetch must reject');assert.equal(service.requests.filter(r=>r.method==='POST').length-savePosts,1,'one inbound POST before GET recovery');
    const start=service.requests.length;await workspace.click('#url-result-panel > button:not(#save-url-result)');await workspace.wait("document.querySelector('#url-save-feedback').textContent.includes('已保存第')");assert.ok(service.requests.slice(start).every(r=>r.method==='GET'));
   }
   await workspace.wait("document.querySelector('#url-save-feedback').textContent.includes('已保存第')");
   assert.equal(service.requests.filter(r=>r.method==='POST').length-savePosts,1);
   const version=service.snapshot().versions.at(-1);assert.equal(version.first_result_payload.preview.fields.description.suggested,'Made of steel.');
   assert.notEqual(version.first_result_payload.review.original_suggestions.description,'Made of steel.');
   await workspace.click('#sign-out');await workspace.wait("!document.querySelector('#sign-in').hidden");
   await cdp.send('Target.disposeBrowserContext',{browserContextId});
   const fresh=await cdp.send('Target.createBrowserContext',{disposeOnDetach:true});const freshTarget=await cdp.send('Target.createTarget',{url:'about:blank',browserContextId:fresh.browserContextId});const restored=await cdp.tab(freshTarget.targetId);
   await restored.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
   const secondSession=service.session();assert.notEqual(firstSession,secondSession);
   await restored.navigate(service.origin+'/workspace.html#access_token='+secondSession+'&token_type=bearer&expires_in=3600');
   await restored.wait("!document.querySelector('#workspace').hidden");
   const selector=`.typed-version[data-version-id="${version.id}"] .typed-loader`;
   const held=service.holdNext('/rest/v1/content_versions');
   await restored.click(selector+' > summary');await bounded(held.entered,'late-read entered');
   await restored.click(selector+' > summary');held.release();await delay(100);
   assert.equal(await restored.evaluate(`!!document.querySelector(${JSON.stringify(selector+' .url-review')})`),false);
   await restored.click(selector+' > summary');
   await restored.wait(`!!document.querySelector(${JSON.stringify(selector+' .url-review-status')})&&!document.querySelector(${JSON.stringify(selector+' .url-review-status')}).textContent.includes('正在')`);
   const complete=await restored.evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector+' pre')})).map(n=>{try{return JSON.parse(n.textContent)}catch{return null}}).find(x=>x?.payload)?.payload`);
   assert.equal(canonical(complete),canonical(version.first_result_payload));
   await restored.focus(selector+' [data-review-check="title"]');await restored.key(' ','Space',32);await restored.click(selector+' .url-review-cancel');
   assert.equal(await restored.evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector+' [data-review-check]')})).some(n=>n.checked)`),false);
   for(const k of ['title','meta_description','description','source','blocking_facts_clear']){await restored.focus(selector+` [data-review-check="${k}"]`);await restored.key(' ','Space',32);}
   await restored.send('Fetch.enable',{patterns:[{urlPattern:service.origin+'/backend/rest/v1/rpc/*',requestStage:'Response'}]});
   if(width===390)service.loseNext('/rest/v1/rpc/review_url_result','cdp-response');
   await restored.focus(selector+' .url-review-confirm');await restored.key('Enter','Enter',13);
   if(width===390){await restored.wait(`document.querySelector(${JSON.stringify(selector+' .url-review-status')}).textContent.includes('只查詢原 request')`);const traces=cdp.events.filter(e=>e.sessionId===restored.sessionId&&e.method==='Runtime.consoleAPICalled'&&e.params.args?.[0]?.value==='GOS_TEST_FETCH').map(e=>JSON.parse(e.params.args[1].value)).filter(e=>e.method==='POST'&&e.path==='/rest/v1/rpc/review_url_result');assert.equal(traces.filter(e=>e.stage==='dispatch').length,1);assert.equal(traces.filter(e=>e.stage==='rejected').length,1);const start=service.requests.length;await restored.click(selector+' .url-review-read');await restored.wait(`document.querySelector(${JSON.stringify(selector+' .url-review-status')}).textContent.includes('此已保存版本已確認')`);assert.ok(service.requests.slice(start).every(r=>r.method==='GET'));}
   await restored.wait(`document.querySelector(${JSON.stringify(selector+' .url-review-status')}).textContent.includes('此已保存版本已確認')`);
   assert.ok(service.snapshot().reviews.find(r=>r.version_id===version.id));
   assert.equal(await restored.evaluate('localStorage.length'),0);
   assert.equal(await restored.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
   await restored.screenshot(evidence+'/workspace-confirmed-'+width+'.png');
   results.push({width,result:'PASS',version_id:version.id,payload_exact:true,content_digest:version.first_result_payload.review.content_digest,source_digest:version.first_result_payload.snapshot.content_fingerprint,closed_old_browser_context:true,new_test_session:true,keyboard:true,cancel_back_late_read:true,unknown_get_only:width===1280?'save':'review',real_auth_verified:false});
   await cdp.send('Target.disposeBrowserContext',{browserContextId:fresh.browserContextId});
   for(const role of ['viewer','foreign']){
    const restricted=await cdp.send('Target.createBrowserContext',{disposeOnDetach:true});const target=await cdp.send('Target.createTarget',{url:'about:blank',browserContextId:restricted.browserContextId}),tab=await cdp.tab(target.targetId);
    await tab.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});await tab.navigate(service.origin+'/workspace.html#access_token='+service.session(role)+'&token_type=bearer&expires_in=3600');await tab.wait("!document.querySelector('#workspace').hidden");
    const before=service.requests.filter(r=>r.method==='POST').length;
    if(role==='viewer'){await tab.click(selector+' > summary');await tab.wait(`!!document.querySelector(${JSON.stringify(selector+' .url-review-confirm')})`);assert.equal(await tab.evaluate(`document.querySelector(${JSON.stringify(selector+' .url-review-confirm')}).hidden`),true);assert.equal(await tab.evaluate("document.querySelector('#save-url-result').disabled"),true);}
    else assert.equal(await tab.evaluate("document.querySelectorAll('.typed-version').length"),0);
    assert.equal(service.requests.filter(r=>r.method==='POST').length,before);await tab.screenshot(evidence+'/'+role+'-'+width+'.png');await cdp.send('Target.disposeBrowserContext',{browserContextId:restricted.browserContextId});
   }
  }
  const errors=cdp.events.filter(e=>e.method==='Runtime.exceptionThrown');assert.deepEqual(errors,[]);
  const remote=cdp.events.filter(e=>e.method==='Network.requestWillBeSent'&&/^https?:/.test(e.params.request.url)&&!e.params.request.url.startsWith(service.origin));assert.deepEqual(remote,[]);
  await writeFile(evidence+'/browser-receipt.json',JSON.stringify({test_only:true,frontend:'configured-preview-build-with-handoff-bridge',backend:'synthetic-json-service',ui_flags:'test-only-override',results,external_requests:0,uncaught_browser_errors:0},null,2));
  console.log(JSON.stringify(results,null,2));
 }catch(error){
  console.error('Chromium startup diagnostics: '+JSON.stringify(launch.snapshot()));
  await captureFailure(error,{cdp,service,evidence});
  throw error;
 }finally{await writeFile(evidence+'/rpc-requests.json',JSON.stringify(service.requests,null,2));cdp?.ws.close();await launch.stop();await bounded(service.close(),'service close');}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await browserRun();
