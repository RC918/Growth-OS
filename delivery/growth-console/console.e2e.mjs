import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm,stat,readdir} from 'node:fs/promises';
import {appendFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
// Diagnostic module override selects the already installed isolated runtime only.
const playwrightModule=process.env.CONSOLE_DIAGNOSTIC_PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(playwrightModule);
const playwrightPackage=playwrightModule==='playwright'?createRequire(import.meta.url).resolve('playwright/package.json'):join(dirname(playwrightModule),'package.json');
const playwrightVersion=JSON.parse(await readFile(playwrightPackage,'utf8')).version;
assert.equal(playwrightVersion,'1.58.2','Use the existing approved Playwright version');
const sourceHash=createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const evidence=process.env.CONSOLE_DIAGNOSTIC_DIRECTORY;
assert.ok(evidence,'A fresh diagnostic evidence directory is required');
const selectors=['#guide-action','#guide-close','#task-toggle','#review-confirm'];
let diagnosticSequence=0;
const evidenceErrors=[];
const writtenSizes=new Map(),runByteLimit=8*1024*1024;
const runBudgetMode='8MiB soft fail-stop: screenshots checked after writing; structured writes prechecked';
let observationRunBytes=0;
// Small framed writes use Node's queued stream, including backpressure. The seal
// permits independent reconstruction from received job logs; no silent partial write.
let firstError=null;
let logSequence=0,logBytes=0,logFailure=null,completedCases=0,caseKey='startup';
const logDigest=createHash('sha256');
// Logging is never allowed to interrupt a primary error or resource cleanup.
const rememberLogError=error=>{logFailure??=error;if(firstError===null)firstError=error;};
process.stderr.on('error',rememberLogError);
function stderrFallback(value){
 if(logFailure)return false;
 try{
  const bytes=Buffer.from(JSON.stringify(value)+'\n');logBytes+=bytes.length;logDigest.update(bytes);
  for(let offset=0;offset<bytes.length;offset+=480){
   process.stderr.write(JSON.stringify({console_evidence_frame:{sequence:++logSequence,data:bytes.subarray(offset,offset+480).toString('base64')}})+'\n',error=>{if(error)rememberLogError(error);});
  }
  return true;
 }catch(error){rememberLogError(error);return false;}
}
async function sealLog(){
 if(logFailure)throw logFailure;
 await bounded(new Promise((resolve,reject)=>{
  try{process.stderr.write(JSON.stringify({console_evidence_seal:{frames:logSequence,bytes:logBytes,sha256:logDigest.digest('hex')}})+'\n',error=>{if(error){rememberLogError(error);reject(error);}else resolve();});}
  catch(error){rememberLogError(error);reject(error);}
 }),1500,'Console evidence seal');
 if(logFailure)throw logFailure;
}
function safeEvidence(name,value,append=false){
 try{
  const bytes=typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value,null,2)+'\n';
  const length=Buffer.byteLength(bytes),previous=writtenSizes.get(name)||0,next=append?previous+length:length;
  const total=Array.from(writtenSizes.values()).reduce((a,b)=>a+b,0)-previous+next;
  if(total>runByteLimit)throw Error('Diagnostic run evidence exceeds 8MiB: '+name);
  if(append)appendFileSync(join(evidence,name),bytes);else writeFileSync(join(evidence,name),bytes);
  writtenSizes.set(name,next);
  return true;
 }catch(error){
  // Keep the earliest error in memory, even if every evidence path is unwritable.
  if(firstError===null)firstError=error;
  const failure={file:name,error:errorInfo(error)};evidenceErrors.push(failure);
  stderrFallback({evidence_error:failure});
  try{writeFileSync(join(evidence,'evidence-errors.json'),JSON.stringify(evidenceErrors,null,2)+'\n');}
  catch(fallbackError){stderrFallback({evidence_error_index_unwritten:errorInfo(fallbackError)});}
  return false;
 }
}
function requireEvidence(){if(evidenceErrors.length)throw firstError;if(logFailure)throw logFailure;}

async function capture(page,width,stage,selector=null,box=null){
 const state=await page.evaluate(()=>{
  function elementState(el){
   if(!el)return null;
   const style=getComputedStyle(el),ancestors=[];
   for(let node=el;node;node=node.parentElement)ancestors.push({tag:node.tagName,id:node.id,hidden:node.hidden===true,inert:node.inert===true,ariaHidden:node.getAttribute('aria-hidden'),display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility});
   return {connected:el.isConnected,clientRects:Array.from(el.getClientRects(),r=>({x:r.x,y:r.y,width:r.width,height:r.height})),hidden:el.hidden===true,inert:el.inert===true,ariaExpanded:el.getAttribute('aria-expanded'),display:style.display,visibility:style.visibility,ancestors};
  }
  const controls={};for(const id of ['guide-action','guide-close','task-toggle','review-confirm','guide-toggle'])controls['#'+id]=elementState(document.getElementById(id));
  const panels={};for(const id of ['result-panel','overview-panel','guidance','task-details'])panels[id]=elementState(document.getElementById(id));
  return {viewport:{width:innerWidth,height:innerHeight},rootFont:{inline:document.documentElement.style.fontSize,computed:getComputedStyle(document.documentElement).fontSize},scenario:document.getElementById('task-id').textContent,phase:document.getElementById('task-phase').textContent,panels,controls};
 });
 const boxes={};for(const key of selectors)boxes[key]=await page.locator(key).boundingBox();
 const row={identity,case:caseKey,sequence:++diagnosticSequence,time:new Date().toISOString(),width,stage,selector,box,state,boxes};
 safeEvidence(`${String(row.sequence).padStart(3,'0')}-${width}-${stage}.json`,row);
 stderrFallback({console_diagnostic_state:project(row)});requireEvidence();
 return row;
}
async function stableShell(page,width,stage){
 const state=await page.evaluate(()=>({viewport:innerWidth,font:getComputedStyle(document.documentElement).fontSize,overflow:document.documentElement.scrollWidth>innerWidth,bodyOverflow:getComputedStyle(document.body).overflow,bodyClass:document.body.className,display:getComputedStyle(document.querySelector('.shell')).display,direction:getComputedStyle(document.querySelector('.shell')).flexDirection,columns:getComputedStyle(document.querySelector('.shell')).gridTemplateColumns,mainOverflow:getComputedStyle(document.querySelector('main')).overflow}));
 safeEvidence(caseKey+'-'+stage+'-shell.json',state);stderrFallback({console_shell:{case:caseKey,stage,...state}});requireEvidence();
 assert.equal(state.overflow,false);assert.notEqual(state.bodyOverflow,'hidden');assert.equal(state.bodyClass.includes('flow-layout'),false);
 if(width<768){assert.equal(state.display,'flex');assert.equal(state.direction,'column');assert.equal(state.mainOverflow,'visible');}
 if(width>=1024){assert.equal(state.display,'grid');assert.equal(state.columns.split(' ').length,3);}
}
async function keyboardTo(page,selector){
 const backward=await page.locator(selector).evaluate(n=>!!(n.compareDocumentPosition(document.activeElement)&4));
 for(let i=0;i<200;i++){
  if(await page.locator(selector).evaluate(n=>n===document.activeElement)){await visibleKeyboardFocus(page,selector);return;}
  await page.keyboard.press(backward?'Shift+Tab':'Tab');
 }
 throw Error('Keyboard safety bound: '+selector);
}
async function visibleKeyboardFocus(page,selector){
 await page.locator(selector).scrollIntoViewIfNeeded();
 const focus=await page.locator(selector).evaluate(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect(),color=s.outlineColor;const alpha=color==='transparent'?0:color.startsWith('rgba(')?parseFloat(color.split(',').at(-1)):color.includes('/')?parseFloat(color.split('/').at(-1)):1;return {focused:n===document.activeElement,focusVisible:n.matches(':focus-visible'),style:s.outlineStyle,width:parseFloat(s.outlineWidth),color,alpha,visible:s.visibility==='visible'&&r.width>0&&r.height>0&&r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1};});
 assert.equal(focus.focused,true,selector);assert.equal(focus.focusVisible,true,'Keyboard focus pseudo-class: '+selector);assert.equal(focus.visible,true,'Focused control clipped: '+selector);assert.ok(focus.width>0&&focus.style!=='none'&&focus.alpha>0,'Visible focus outline: '+selector);
 stderrFallback({console_keyboard_focus:{case:caseKey,selector,...focus}});requireEvidence();
 return focus;
}
// Read-only, short-lived browser sampling; no product callback or observer is replaced.
async function startObservation(page,width){
 await page.evaluate(({width})=>{
  const probe={width,rows:[],cursor:0,count:0,bytes:0,stopped:false,reason:null,overflow:null,raf:null,mutationCount:0,observer:null,observerError:null};
  const rect=r=>({x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,right:r.right,bottom:r.bottom,left:r.left});
  const keys=['display','visibility','position','overflow','overflowX','overflowY','contain','contentVisibility','containerType','containerName','width','height','minWidth','minHeight','maxWidth','maxHeight','boxSizing','flexDirection','flexBasis','flexGrow','flexShrink','gridTemplateColumns','gridTemplateRows','transform','zoom'];
  probe.accept=(row,drain=false)=>{
   if(probe.overflow||(probe.stopped&&!drain))return false;
   row.sequence=probe.count+1;
   const size=new TextEncoder().encode(JSON.stringify(row)+'\n').length;
   if(probe.count+1>256||probe.bytes+size>1024*1024){probe.overflow={count:probe.count,bytes:probe.bytes,attemptedRecordBytes:size,limitRecords:256,limitBytes:1024*1024};probe.stop('capacity-failure');return false;}
   probe.rows.push(row);probe.count++;probe.bytes+=size;return true;
  };
  probe.recordMutations=(records,drain=false)=>{
   for(const [batchIndex,record]of records.entries()){
    const row={type:'mutation',stage:'mutation-delivery',time:performance.now(),timeMeaning:'callback delivery, not mutation occurrence',batchIndex,batchLength:records.length,target:{tag:record.target.tagName,id:record.target.id},attribute:record.attributeName,oldValue:record.oldValue,currentValue:record.target.getAttribute(record.attributeName),valueMeaning:'current value at delivery; intermediate values may differ'};
    if(!probe.accept(row,drain))return;probe.mutationCount++;
   }
  };
  probe.stop=reason=>{
   if(probe.stopped)return;probe.stopped=true;probe.reason=reason;cancelAnimationFrame(probe.raf);
   if(probe.observer){
    const pending=probe.observer.takeRecords();probe.observer.disconnect();
    try{probe.recordMutations(pending,true);}catch(error){probe.observerError={name:error.name,message:error.message};probe.reason='mutation-observer-error';}
   }
  };
  probe.sample=stage=>{
   if(probe.stopped)return;
   // All DOM/geometry reads for a row run synchronously in this one browser callback.
   const nodes=[],seen=new Map();
   function nodeState(el){
    if(!el)return null;if(seen.has(el))return seen.get(el);
    const index=nodes.length;seen.set(el,index);const style=getComputedStyle(el),computed={};for(const key of keys)computed[key]=style[key];
    nodes.push({index,tag:el.tagName,id:el.id,connected:el.isConnected,hidden:el.hidden===true,inert:el.inert===true,ariaHidden:el.getAttribute('aria-hidden'),ariaExpanded:el.getAttribute('aria-expanded'),open:el.hasAttribute('open'),rect:rect(el.getBoundingClientRect()),clientRects:Array.from(el.getClientRects(),rect),scroll:{width:el.scrollWidth,height:el.scrollHeight,left:el.scrollLeft,top:el.scrollTop,clientWidth:el.clientWidth,clientHeight:el.clientHeight},computed});return index;
   }
   const controls={};for(const id of ['guide-action','guide-close','task-toggle','review-confirm']){
    const element=document.getElementById(id),ancestry=[];for(let el=element;el;el=el.parentElement)ancestry.push(nodeState(el));controls['#'+id]={node:nodeState(element),ancestry};
   }
   const focus=document.activeElement;
   const vv=window.visualViewport;
   const row={type:'snapshot',stage,time:performance.now(),viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY},visualViewport:vv===null?null:{width:vv.width,height:vv.height,offsetLeft:vv.offsetLeft,offsetTop:vv.offsetTop,pageLeft:vv.pageLeft,pageTop:vv.pageTop,scale:vv.scale},font:{inline:document.documentElement.style.fontSize,computed:getComputedStyle(document.documentElement).fontSize},bodyClass:document.body.className,focus:focus?{tag:focus.tagName,id:focus.id}:null,scenario:document.getElementById('task-id').textContent,controls,nodes};
   if(!probe.accept(row))return;
   // Guidance is intentionally collapsed before the original toggle. Record it,
   // but automatic stop tracks the known review target; original four assertions remain.
   const target=controls['#review-confirm'].node;
   if(target===null||nodes[target].clientRects.length===0)probe.stop('first-empty-review-confirm');
  };
  probe.observer=new MutationObserver(records=>{try{probe.recordMutations(records);}catch(error){probe.observerError={name:error.name,message:error.message};probe.stop('mutation-observer-error');}});
  probe.observer.observe(document.documentElement,{subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['class','style','hidden']});
  probe.sample('before-font-change');
  function frame(){if(probe.stopped)return;probe.sample('animation-frame');if(!probe.stopped)probe.raf=requestAnimationFrame(frame);}
  if(!probe.stopped)probe.raf=requestAnimationFrame(frame);
  window.__consoleLayoutProbe=probe;
 },{width});
 activeObservation={page,width};
 await observationCheckpoint(page,width,'started');
}
async function observationCheckpoint(page,width,stage,end=false){
 const batch=await page.evaluate(({stage,end})=>{
  const probe=window.__consoleLayoutProbe;
  if(!probe)return {missing:true};
  probe.sample(stage);if(end)probe.stop('segment-complete');
  const rows=probe.rows.slice(probe.cursor);probe.cursor=probe.rows.length;
  return {rows,count:probe.count,bytes:probe.bytes,mutationCount:probe.mutationCount,stopped:probe.stopped,observerDisconnected:probe.stopped,reason:probe.reason,overflow:probe.overflow,observerError:probe.observerError};
 },{stage,end});
 if(batch.missing)throw Error('Atomic observation missing for width '+width);
 const text=batch.rows.map(row=>JSON.stringify(row)+'\n').join('');
 observationRunBytes+=Buffer.byteLength(text);
 if(observationRunBytes>runByteLimit){const error=Error('Atomic observation run exceeds 8MiB');preserveFirst(error);safeEvidence('observation-capacity-error.json',{width,stage,observationRunBytes});throw error;}
 if(text)safeEvidence('atomic-'+caseKey+'.jsonl',text,true);
 // Shared nodes avoid repeating complete ancestor chains; no text/values/Env are logged.
 for(const row of batch.rows){
  const compact=row.type==='mutation'?row:{type:row.type,sequence:row.sequence,stage:row.stage,font:row.font,bodyClass:row.bodyClass,viewport:row.viewport,visualViewport:row.visualViewport,controls:Object.fromEntries(Object.entries(row.controls).map(([key,value])=>{const node=row.nodes[value.node];return [key,node?{connected:node.connected,hidden:node.hidden,rect:node.rect,clientRects:node.clientRects,display:node.computed.display}:null];}))};
  stderrFallback({console_atomic_observation:{width,case:caseKey,...compact}});
 }
 safeEvidence('atomic-'+caseKey+'-status.json',{width,stage,count:batch.count,bytes:batch.bytes,mutationCount:batch.mutationCount,stopped:batch.stopped,observerDisconnected:batch.observerDisconnected,reason:batch.reason,overflow:batch.overflow,observerError:batch.observerError,observationRunBytes});
 stderrFallback({console_atomic_status:{width,case:caseKey,stage,count:batch.count,bytes:batch.bytes,mutationCount:batch.mutationCount,stopped:batch.stopped,observerDisconnected:batch.observerDisconnected,reason:batch.reason,overflow:batch.overflow,observerError:batch.observerError}});
 requireEvidence();
 if(batch.overflow)throw Error('Atomic observation case capacity exceeded at '+width);
 if(batch.observerError)throw Error('Mutation observation failed at '+width+': '+batch.observerError.message);
 if(end)activeObservation=null;
}
// Screenshot size is only known after the original write: this is a soft limit,
// not a promise that no file can momentarily take the run above 8MiB.
async function accountScreenshot(name){
 const info=await stat(join(evidence,name));writtenSizes.set(name,info.size);
 const total=Array.from(writtenSizes.values()).reduce((a,b)=>a+b,0);
 if(total>runByteLimit){const error=Error('Post-write diagnostic run soft limit exceeded (8MiB) after screenshot '+name);evidenceErrors.push({file:name,error:errorInfo(error)});stderrFallback({evidence_capacity_error:{name,total,limit:runByteLimit,mode:runBudgetMode}});throw error;}
}
const temp=await mkdtemp(join(tmpdir(),'growth-console-'));
let browser,server,exitSeen=false,closeSeen=false,spawnError=null,activeObservation=null;
const lifecycle={node:process.version,platform:process.platform,arch:process.arch,temp,pid:null,events:[],streams:{stdout:{bytes:0,saved:0},stderr:{bytes:0,saved:0}}};
const cleanup={browser:'not-started',child:'not-started',temp:'not-attempted',errors:[]};
const errorInfo=error=>({name:error.name,message:error.message,stack:error.stack});
const identity={source_head:process.env.CONSOLE_DIAGNOSTIC_SOURCE_HEAD||'local-only',checkout_sha:process.env.GITHUB_SHA||'local-only',run_id:process.env.GITHUB_RUN_ID||'local-only',attempt:process.env.GITHUB_RUN_ATTEMPT||'local-only',e2e_sha256:sourceHash,playwright:playwrightVersion,budgets:{caseRecords:256,caseBytes:1024*1024,runBytes:runByteLimit,mode:runBudgetMode,mutationRecordsShareCaseBudget:true}};
function project(row){
 const controls={};for(const [key,value]of Object.entries(row.state.controls))controls[key]=value===null?null:{connected:value.connected,clientRects:value.clientRects,hidden:value.hidden,inert:value.inert,ariaExpanded:value.ariaExpanded,display:value.display,visibility:value.visibility,blockingAncestors:value.ancestors.filter(a=>a.hidden||a.inert||a.display==='none'||a.visibility==='hidden')};
 const panels={};for(const [key,value]of Object.entries(row.state.panels))panels[key]=value===null?null:{hidden:value.hidden,inert:value.inert,display:value.display,visibility:value.visibility};
 return {case:row.case,sequence:row.sequence,width:row.width,stage:row.stage,selector:row.selector,box:row.box,viewport:row.state.viewport,rootFont:row.state.rootFont,scenario:row.state.scenario,panels,controls,boxes:row.boxes};
}
function event(kind,detail={}){lifecycle.events.push({time:new Date().toISOString(),kind,...detail});safeEvidence('lifecycle.json',lifecycle);}
function preserveFirst(error){if(firstError===null){firstError=error;safeEvidence('first-error.json',errorInfo(error));}}
async function bounded(operation,ms,label){let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out after '+ms+'ms')),ms);})]);}finally{clearTimeout(timer);}}
let resolveExit,resolveClose;
const exited=new Promise(resolve=>{resolveExit=resolve;}),closed=new Promise(resolve=>{resolveClose=resolve;});
try{
 const frozen=JSON.parse(await readFile('prototype/internal-rc/deploy/hashes.json'));assert.equal(Object.keys(frozen).length,117);
 for(const [path,hash]of Object.entries(frozen))assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),hash,'Frozen source: '+path);
 const generated=(await readdir('apps/web')).filter(name=>name==='console-claim-engine.mjs'||name.startsWith('source-html-'));
 for(const name of generated){const path='apps/web/'+name;assert.deepEqual(await readFile(path),execFileSync('git',['show','HEAD:'+path],{timeout:5000,maxBuffer:2*1024*1024}),'Generated source drift: '+path);}
 stderrFallback({console_source_guard:{frozen:117,generated_sources_unchanged:generated.length}});
 let resolvePort,rejectPort,portBuffer='',portSettled=false;
 const portReady=new Promise((resolve,reject)=>{resolvePort=resolve;rejectPort=reject;});
 function startupError(error){if(!portSettled){portSettled=true;preserveFirst(error);rejectPort(error);}}
 server=spawn('python3',['-B','prototype/public-audit/product_ui_fixture.py',join(temp,'sources.sqlite3')],{stdio:['ignore','pipe','pipe']});
 lifecycle.pid=server.pid===undefined?null:server.pid;
 for(const stream of ['stdout','stderr'])server[stream].on('data',data=>{
  const stats=lifecycle.streams[stream];stats.bytes+=data.length;
  const bytes=data.subarray(0,Math.max(0,65536-stats.saved));
  if(bytes.length&&safeEvidence('fixture-'+stream+'.log',bytes,true))stats.saved+=bytes.length;
  event('output',{stream,bytes:data.length,truncated:stats.saved<stats.bytes});
  if(stream==='stdout'&&!portSettled){
   portBuffer+=data.toString('utf8');
   const end=portBuffer.indexOf('\n');
   if(end!==-1){const line=portBuffer.slice(0,end).replace(/\r$/,'');
    if(!/^[1-9][0-9]{0,4}$/.test(line)||Number(line)>65535)startupError(Error('Fixture supplied an invalid complete port line'));
    else{portSettled=true;resolvePort(Number(line));}
   }else if(Buffer.byteLength(portBuffer)>128)startupError(Error('Fixture port line exceeds 128 bytes'));
  }
 });
 server.on('error',error=>{spawnError=errorInfo(error);startupError(error);event('error',{error:spawnError});});
 server.on('exit',(code,signal)=>{exitSeen=true;resolveExit({code,signal});startupError(Error('Fixture exited before port: '+code+'/'+signal));event('exit',{code,signal});});
 server.on('close',(code,signal)=>{closeSeen=true;resolveClose({code,signal});startupError(Error('Fixture closed before port: '+code+'/'+signal));event('close',{code,signal});});
 server.on('spawn',()=>event('spawn',{pid:server.pid}));
 safeEvidence('identity.json',identity);stderrFallback({console_diagnostic_identity:identity});
 event('listeners-attached');
 const port=await bounded(portReady,5000,'Fixture startup');
 event('port-ready',{port});requireEvidence();
 const origin='http://127.0.0.1:'+port;
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 safeEvidence('runtime.json',{identity,node:process.version,platform:process.platform,arch:process.arch,playwrightModule,playwright:playwrightVersion,browser:browser.version(),executable:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});requireEvidence();
 for(const initialFont of [16,32]){for(const width of [1280,390,320]){
  caseKey=width+'-initial'+initialFont;
  server.kill('SIGUSR1');const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage();const errors=[],remote=[],posts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(new URL(r.url()).pathname);});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){remote.push(route.request().url());return route.abort();}return route.continue();});
  if(initialFont===32)await context.addInitScript(()=>{
   // Initial-font fixture only; no product code or layout callback is patched.
   const observer=new MutationObserver(()=>{if(document.documentElement){document.documentElement.style.fontSize='32px';observer.disconnect();}});
   observer.observe(document,{childList:true,subtree:true});if(document.documentElement){document.documentElement.style.fontSize='32px';observer.disconnect();}
  });
  await page.goto(origin+'/growth-console.html');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).fontSize),initialFont+'px');const url=page.locator('#source-url');
  assert.match(await page.locator('#mode-banner').innerText(),/真網址模式/);
  await url.fill('https://example.com/products/bolt');await url.press('Enter');await page.locator('#result-panel:not([hidden])').waitFor();
  assert.match(await page.locator('#task-phase').innerText(),/需要你確認/);assert.match(await page.locator('#result-fields').innerText(),/Bolt A/);assert.equal(await page.locator('#review-confirm').isDisabled(),true);
  if(width<768)await page.locator('#guide-toggle').click();
  for(const key of ['title','meta_description','description']){
   await page.locator('#guide-action').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#check-'+key).evaluate(e=>document.activeElement===e),true);await page.keyboard.press('Space');
  }
  // Check confirmation's actual Tab reachability while the real checks enable it.
  await keyboardTo(page,'#review-confirm');
  await page.locator('#guide-action').click();assert.equal(await page.locator('#review-confirm').evaluate(e=>document.activeElement===e),true);await page.keyboard.press('Enter');await page.locator('#review-state').filter({hasText:'本頁已確認'}).waitFor();
  assert.match(await page.locator('#task-phase').innerText(),/本頁確認完成/);assert.match(await page.locator('#guide-reason').innerText(),/尚未保存/);
  await page.locator('#field-description').fill('Preserve this manual version.');assert.equal(await page.locator('#check-description').isChecked(),false);assert.match(await page.locator('#review-state').innerText(),/^待確認/);
  await page.locator('#later').click();assert.equal(await page.locator('#overview-panel').isVisible(),true);await page.locator('#return-result').click();assert.equal(await page.locator('#field-description').inputValue(),'Preserve this manual version.');
  await page.locator('#guide-close').click();assert.equal(await page.locator('#guide-toggle').evaluate(e=>document.activeElement===e),true);assert.equal(await page.locator('#guidance').isVisible(),false);await page.locator('#guide-toggle').click();assert.equal(await page.locator('#guide-heading').evaluate(e=>document.activeElement===e),true);
  const mainText=await page.locator('#field-description').inputValue();const wasOpen=await page.locator('#task-details').isVisible();await page.locator('#task-toggle').click();assert.equal(await page.locator('#task-details').isVisible(),!wasOpen);await page.locator('#task-toggle').click();assert.equal(await page.locator('#field-description').inputValue(),mainText);
  async function overview(){if(width<1024)await page.locator('#nav-toggle').click();await page.locator('[data-view=overview]').click();}
  await overview();await url.fill('https://example.com/timeout');await page.locator('#source-submit').click();await page.locator('#source-feedback').filter({hasText:'逾時'}).waitFor();assert.equal(await url.inputValue(),'https://example.com/timeout');assert.match(await page.locator('#task-phase').innerText(),/未完成/);
  if(width<1024)await page.locator('#nav-toggle').click();await page.locator('[data-view=result]').click();assert.equal(await page.locator('#field-description').inputValue(),mainText);assert.equal(await page.locator('#review-confirm').isDisabled(),true);
  // Hold a real HTTP response locally, then cancel; no synthetic completion timers.
  await overview();let release;const barrier=new Promise(r=>release=r);
  await page.route('**/api/product-source',async route=>{const response=await route.fetch();await barrier;try{await route.fulfill({response});}catch{}});
  await url.fill('https://example.com/products/bolt');await page.locator('#source-submit').click();await page.locator('#task-phase').filter({hasText:'正在讀取'}).waitFor();assert.equal(await page.locator('#guide-action').isVisible(),false);await page.locator('#source-cancel').click();release();await page.unroute('**/api/product-source');assert.match(await page.locator('#task-phase').innerText(),/未知/);
  const count=posts.length;await page.locator('#prototype-tools summary').click();
  for(const kind of ['start','running','review','failed','complete','return']){
   await page.locator('[data-scenario='+kind+']').click();await page.waitForFunction(kind=>document.getElementById('task-id').textContent==='prototype-'+kind,kind);
   assert.match(await page.locator('#mode-banner').innerText(),/合成互動原型/);assert.equal(posts.length,count);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await capture(page,width,'before-review-scene');
  await page.locator('[data-scenario=review]').click();await page.waitForFunction(()=>document.getElementById('task-id').textContent==='prototype-review');
  await capture(page,width,'after-review-scene');
  await page.screenshot({path:join(evidence,`growth-console-${caseKey}.png`),fullPage:true});
  await accountScreenshot(`growth-console-${caseKey}.png`);
  await stableShell(page,width,'initial');
  const beforeZoomText=await page.locator('#field-description').inputValue();
  await capture(page,width,'before-font-change');
  await startObservation(page,width);
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  await observationCheckpoint(page,width,'after-font-change');
  await capture(page,width,'after-font-change');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'200% text must reflow');
  await capture(page,width,'before-guide-toggle');
  if(width<768)await page.locator('#guide-toggle').click();
  await capture(page,width,'after-guide-toggle');
  await observationCheckpoint(page,width,'after-guide-toggle');
  for(const selector of ['#guide-action','#guide-close','#task-toggle','#review-confirm']){
   const box=await page.locator(selector).boundingBox();
   let originalError;
   if(box===null){try{assert.ok(box.height>=44);}catch(error){originalError=error;preserveFirst(error);}}
   await observationCheckpoint(page,width,'measure-'+selector,box===null);
   const row=await capture(page,width,'before-size-assertion',selector,box);
   if(box===null){
    safeEvidence('first-null.json',row);stderrFallback({console_diagnostic_first_null:{identity,...project(row)}});requireEvidence();
    try{await page.screenshot({path:join(evidence,`first-null-${caseKey}.png`),fullPage:true,timeout:2000});await accountScreenshot(`first-null-${caseKey}.png`);}
    catch(error){safeEvidence('first-null-screenshot-error.json',errorInfo(error));}
    throw originalError;
   }
   assert.ok(box.height>=44);
  }
  await observationCheckpoint(page,width,'measurement-segment-complete',true);
  await stableShell(page,width,'200-percent');
  await page.screenshot({path:join(evidence,`growth-console-${caseKey}-200.png`),fullPage:true});await accountScreenshot(`growth-console-${caseKey}-200.png`);
  // All four retain the original 44px and hit-box checks. The synthetic review
  // scene intentionally disables confirmation; keyboard was checked when enabled.
  for(const selector of selectors){await page.locator(selector).scrollIntoViewIfNeeded();assert.equal(await page.locator(selector).evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'Control covered: '+selector);}
  for(const selector of ['#guide-action','#guide-close','#task-toggle'])await keyboardTo(page,selector);
  await page.evaluate(()=>document.documentElement.style.fontSize='16px');
  assert.equal(await page.locator('#field-description').inputValue(),beforeZoomText);await stableShell(page,width,'returned-100-percent');
  const overlap=await page.evaluate(()=>{const a=document.getElementById('task-card').getBoundingClientRect(),b=document.getElementById('review-confirm').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});assert.equal(overlap,false);
  assert.equal(await page.locator('#task-phase').getAttribute('aria-live'),'polite');assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('task-card')).animationName),'none');
  await page.locator('#exit-prototype').click();assert.equal(await page.locator('#source-url').inputValue(),'');
  await page.reload();assert.match(await page.locator('#task-phase').innerText(),/尚未開始/);assert.equal(await page.locator('#result-panel').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.deepEqual(await context.cookies(),[]);assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);assert.ok(posts.every(p=>p==='/api/product-source'));
  completedCases++;stderrFallback({console_case_pass:{case:caseKey,width,initialFont,returnedFont:16,controls:selectors,minimumHeight:44,remoteRequests:remote.length,pageErrors:errors.length,posts:posts.length,onlySourceAPI:true}});
  console.log(`PASS console ${caseKey}: URL HTTP/parser/SQLite → cited result → exact page-only review; six labelled scenes; failure/late response; return, focus, 200% text, reduced motion, zero hosted writes`);await bounded(context.close(),2000,'Console context close');
 }
 }
 assert.equal(completedCases,6);
 // Exercise the exact additive Sites route/module package; no Python backend is implied.
 const manifest=JSON.parse(await readFile('delivery/growth-console/SHA256.json'));
 const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());requests.push(route.request().method()+' '+u.pathname);
  if(u.origin!=='https://console.example.invalid')return route.abort();
  if(u.pathname==='/api/product-source')return route.fulfill({status:404,contentType:'application/json',body:'{"code":"not_found"}'});
  const file=u.pathname==='/growth-console'?'growth-console.html':u.pathname.replace('/console-assets/','');
  assert.ok(Object.hasOwn(manifest.files,file));
  return route.fulfill({contentType:file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html',body:await readFile('delivery/growth-console/dist/'+file)});
 });
 await page.goto('https://console.example.invalid/growth-console');await page.locator('#source-url').fill('https://example.com/products/bolt');await page.locator('#source-submit').click();await page.locator('#source-feedback').filter({hasText:'尚未連接可用的來源服務'}).waitFor();
 assert.equal(await page.locator('#source-url').inputValue(),'https://example.com/products/bolt');assert.deepEqual(errors,[]);assert.equal(requests.filter(x=>x.startsWith('POST')).length,1);
 await page.locator('#prototype-tools summary').click();await page.locator('[data-scenario=review]').click();await page.locator('#result-panel:not([hidden])').waitFor();assert.match(await page.locator('#mode-banner').innerText(),/合成互動原型/);assert.deepEqual(errors,[]);await bounded(context.close(),2000,'Console context close');
 console.log('PASS exact /growth-console package: asset graph, unavailable backend retains URL, labelled prototype available; no hosted API claim');
}catch(error){
 preserveFirst(error);
 if(activeObservation){const current=activeObservation;try{await bounded(observationCheckpoint(current.page,current.width,'error-final-drain',true),2000,'Final observation drain');}catch(drainError){cleanup.errors.push({stage:'observation-final-drain',error:errorInfo(drainError)});safeEvidence('observation-final-drain-error.json',errorInfo(drainError));}}
}
finally{
 if(browser){
  try{await bounded(browser.close(),3000,'Browser close');cleanup.browser='closed';}
  catch(error){cleanup.browser='unknown';cleanup.errors.push({stage:'browser-close',error:errorInfo(error)});}
 }
 if(server){
  try{
   if(exitSeen)cleanup.child='already-exited';
   else if(spawnError&&lifecycle.pid===null&&closeSeen)cleanup.child='spawn-failed-no-child';
   else if(server.exitCode!==null||server.signalCode!==null){cleanup.child='already-exited';event('exit-state-read',{code:server.exitCode,signal:server.signalCode});}
   else if(lifecycle.pid!==null){
    event('signal',{signal:'SIGTERM',sent:server.kill('SIGTERM')});
    try{await bounded(exited,1500,'Fixture SIGTERM exit');}
    catch(error){
     if(!exitSeen&&server.exitCode===null&&server.signalCode===null){event('signal',{signal:'SIGKILL',sent:server.kill('SIGKILL')});await bounded(exited,1500,'Fixture SIGKILL exit');}
    }
    cleanup.child=exitSeen?'exited':'unknown';
   }else cleanup.child='unknown';
   if(!closeSeen)await bounded(closed,1000,'Fixture streams close');
  }catch(error){cleanup.child='unknown';cleanup.errors.push({stage:'child-close',error:errorInfo(error)});}
 }
 // Never remove even this run's temporary database while its writer is unknown.
 if(cleanup.child==='already-exited'||cleanup.child==='exited'||cleanup.child==='spawn-failed-no-child'||!server){
  try{await bounded(rm(temp,{recursive:true,force:true}),2000,'Temporary directory removal');cleanup.temp='removal-returned';}
  catch(error){cleanup.temp='unknown';cleanup.errors.push({stage:'temp-remove',error:errorInfo(error)});}
 }else cleanup.temp='retained-child-state-unknown';
 try{await bounded(stat(temp),1000,'Temporary directory existence readback');cleanup.tempExists=true;if(cleanup.temp==='removal-returned')cleanup.temp='still-present';}
 catch(error){if(error.code==='ENOENT'){cleanup.tempExists=false;if(cleanup.temp==='removal-returned')cleanup.temp='removed-and-absence-confirmed';}else{cleanup.tempExists='unknown';cleanup.errors.push({stage:'temp-readback',error:errorInfo(error)});}}
 cleanup.exitSeen=exitSeen;cleanup.closeSeen=closeSeen;
 safeEvidence('cleanup.json',cleanup);
 event('cleanup-recorded');
 stderrFallback({console_diagnostic_final:{identity,completed_cases:completedCases,first_error:firstError===null?null:{name:firstError.name,message:firstError.message},cleanup,evidence_errors:evidenceErrors.length,observation_run_bytes:observationRunBytes,run_budget_mode:runBudgetMode,evidence_accounted_bytes:Array.from(writtenSizes.values()).reduce((a,b)=>a+b,0),child_exit:lifecycle.events.filter(e=>['exit','close'].includes(e.kind)),runtime:{node:process.version,platform:process.platform,arch:process.arch,playwright:playwrightVersion}}});
}
if(evidenceErrors.length){stderrFallback({evidence_errors:evidenceErrors,first_error:firstError===null?null:errorInfo(firstError),cleanup});process.exitCode=1;}
if(firstError!==null){stderrFallback({first_error:errorInfo(firstError)});process.exitCode=1;}
else if(cleanup.errors.length||cleanup.child==='unknown'||cleanup.temp!=='removed-and-absence-confirmed'){stderrFallback({cleanup_incomplete:cleanup});process.exitCode=1;}
try{await sealLog();}catch(error){logFailure=error;process.exitCode=1;}
// A timed-out browser close can retain handles; terminate only this test process.
if(logFailure||cleanup.browser==='unknown'||cleanup.child==='unknown')process.exit(1);

