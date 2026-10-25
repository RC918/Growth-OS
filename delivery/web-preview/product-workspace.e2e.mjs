// CI acceptance candidate: real product modules, synthetic transport/session.
// Does not establish email Auth, live persistence, RLS or actual mobile devices.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile as rawWrite,readFile,readdir,lstat,rm} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {writeFileSync,readFileSync,lstatSync,readdirSync,mkdirSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {dirname,join,isAbsolute,resolve} from 'node:path';
import {createHash} from 'node:crypto';
// Local acceptance may use the desktop's existing runtime without installing
// packages. CI leaves both overrides unset and uses the repository lockfile.
const playwrightModule=process.env.PRODUCT_UI_PLAYWRIGHT_MODULE||'playwright';
const {chromium,firefox,webkit}=await import(playwrightModule);
const packagePath=isAbsolute(playwrightModule)?join(dirname(playwrightModule),'package.json'):createRequire(import.meta.url).resolve('playwright/package.json');
const packageBytes=await readFile(packagePath),playwrightVersion=JSON.parse(packageBytes).version;
import {startTestService,producerReport} from '../growth-console/persistence-integration.e2e.mjs';
import {canonical} from '../../apps/web/first-result-payload.mjs';
import {build} from './build.mjs';
import {applyHandoffBridge} from './handoff-bridge.mjs';
import {applyReviewFlag} from './review-flag.mjs';
import {cp} from 'node:fs/promises';
const BASELINE='4ecc22754a360216028f451f139b1dc7e548ed3b';
const BASELINE_TREE='924da18d51d8dce4429b6ac8ec94a2bc79c95859';
const baselineAssets={"delivery/first-result-workspace/assistant-layout.mjs":"fefcbbe83142b294798bbf061064d7a6f21b23fd","delivery/first-result-workspace/derive.mjs":"935d5052f06f1b91719ba31873bc3e3159cce31a","delivery/first-result-workspace/differences.mjs":"c91c9edcf1d147b5173335bddc311d5dc4ced546","delivery/first-result-workspace/experience.css":"df563c218769e9a5cfd5555a39e4c5713844c3aa","delivery/first-result-workspace/workspace-guide.mjs":"60839ffc6a90e23e0232bb270a2269f925a67616","delivery/web-preview/build.mjs":"159ac05d4770b36e36c905cf9ac19ffa9b48195c","delivery/web-preview/claim-transform.mjs":"2147484651a08e7707854b8cdb2287f24985d301","delivery/web-preview/handoff-bridge.mjs":"e428396fafab5873f826303e35db2ecc10da97c5","delivery/web-preview/review-flag.mjs":"25d2fc27e6a7f0f1f9a16d488fb137c16f190fe3","delivery/web-preview/workspace-integration.mjs":"9f923feb53323d68a25852122174d9cdedfc77ba","vercel.json":"fc7bc243cf70b06f7e68f416a0bd50726166cc73"};
const evidence=resolve(process.env.PRODUCT_UI_EVIDENCE||await mkdtemp(tmpdir()+'/gos-product-ui-evidence-'));
const owned=await mkdtemp(tmpdir()+'/gos-responsive-shell-'),directory=owned+'/candidate';
const liveBrowsers=new Set(),liveServices=new Set(),liveContexts=new Set(),closingBrowsers=new Set(),closingServices=new Set(),closingContexts=new Set(),cleanup={browsers:[],services:[],contexts:[],temp:'pending',errors:[]};
const evidenceLimit=512*1024*1024;
let failure=null,frames=0,logBytes=0,logFailure=null,fixtureReport;const logHash=createHash('sha256');
const remember=error=>{failure??=error;};
const rememberLogError=error=>{logFailure??=error;remember(error);};
process.stderr.on('error',rememberLogError);
function emit(value){
 if(logFailure)return false;
 try{const bytes=Buffer.from(JSON.stringify(value)+'\n');
  assert.ok(Number.isSafeInteger(frames)&&frames>=0&&Math.ceil(bytes.length/480)<=Number.MAX_SAFE_INTEGER-frames,'Sealed frame sequence exceeds safe integer');
  logBytes+=bytes.length;logHash.update(bytes);
  for(let n=0;n<bytes.length;n+=480)process.stderr.write(JSON.stringify({product_evidence_frame:{sequence:++frames,data:bytes.subarray(n,n+480).toString('base64')}})+'\n',error=>{if(error)rememberLogError(error);});
  return true;
 }catch(error){rememberLogError(error);return false;}
}
async function seal(){
 if(logFailure)throw logFailure;
 await bounded(new Promise((yes,no)=>{
  try{process.stderr.write(JSON.stringify({product_evidence_seal:{frames,bytes:logBytes,sha256:logHash.digest('hex')}})+'\n',error=>{if(error){rememberLogError(error);no(error);}else yes();});}
  catch(error){rememberLogError(error);no(error);}
 }),'Product evidence seal',1500);
 if(logFailure)throw logFailure;
}
async function bounded(promise,label,ms=5000){let timer;try{return await Promise.race([promise,new Promise((_,no)=>{timer=setTimeout(()=>no(Error(label+' timed out')),ms);})]);}finally{clearTimeout(timer);}}
async function cleanupStep(stage,operation){
 try{await bounded(Promise.resolve().then(operation),stage);}catch(error){remember(error);cleanup.errors.push({stage,name:error.name,message:error.message});}
}
function requireHealthy(){if(failure)throw failure;if(logFailure){remember(logFailure);throw failure;}}
// Fixed pools: metadata/first-error/cleanup cannot be consumed by normal PNGs.
const MiB=1024*1024,pngLimit=8*MiB;
const budgetLimits={normal:480*MiB,error:MiB,cleanup:MiB,metadata:6*MiB,fault:24*MiB};
const budgetFiles=new Map(),budgetAttempts=[],budgetBlocked=new Set(),budgetErrors=[];
let capacityFailure=null,faultSlots=0,rootIdentity=null;
let differenceDiagnosticBytes=0,differenceDiagnosticLogBytes=0,differenceCompleteBytes=0,differenceCompleteRecords=0,differenceSummaryUsed=false,differenceStopped=false;
const budgetMode='encoded PNG admission before disk write; stat/SHA256 readback; fixed pools';
const budgetHash=bytes=>createHash('sha256').update(bytes).digest('hex');
function category(name){
 if(name.startsWith('fault-')&&name.endsWith('.png'))return 'fault';
 if(name==='first-null.json'||name.includes('first-error')||name.includes('failure')||name.includes('error'))return 'error';
 if(name==='lifecycle.json'||name==='cleanup.json'||name==='final-status.json')return 'cleanup';
 if(name==='inventory.json'||name==='budget-status.json'||name==='evidence-owner.json'||name==='identity.json'||name==='runtime.json'||name.endsWith('-runtime.json')||name==='fixture-identity.json')return 'metadata';
 return 'normal';
}
function totals(){const out=Object.fromEntries(Object.keys(budgetLimits).map(k=>[k,0]));for(const row of budgetFiles.values())out[row.category]+=row.bytes;out.normal+=differenceDiagnosticLogBytes;return out;}
function evidenceName(name){assert.match(name,/^[a-zA-Z0-9_#.-]+$/,'Flat owned evidence filename required');assert.ok(name!=='.'&&name!=='..');return name;}
function rootGuard(){const s=lstatSync(evidence);assert.ok(s.isDirectory()&&!s.isSymbolicLink());assert.equal(s.uid,process.getuid());assert.equal(s.dev,rootIdentity.dev);assert.equal(s.ino,rootIdentity.ino);assert.equal(realpathSync(evidence),evidence);}
function claimEvidenceRoot(){
 assert.equal(realpathSync(dirname(evidence)),dirname(evidence),'Evidence parent must not alias another path');
 try{mkdirSync(evidence);}catch(error){if(error.code!=='EEXIST')throw error;}
 const s=lstatSync(evidence);assert.ok(s.isDirectory()&&!s.isSymbolicLink());assert.equal(s.uid,process.getuid());assert.equal(s.mode&0o022,0,'Evidence root must not be writable by other users');
 assert.equal(readdirSync(evidence).length,0,'Evidence root must be fresh, empty and exclusively owned');rootIdentity={dev:s.dev,ino:s.ino};rootGuard();
 putEvidence('evidence-owner.json',JSON.stringify({pid:process.pid,uid:process.getuid(),root:rootIdentity,exclusive:true}),false);
}
function auditEvidence(){
 rootGuard();const names=readdirSync(evidence);assert.equal(names.length,budgetFiles.size,'Unexpected or missing evidence files');
 for(const name of names){evidenceName(name);const row=budgetFiles.get(name),s=lstatSync(join(evidence,name));assert.ok(row,'Unaccounted evidence: '+name);assert.ok(s.isFile()&&!s.isSymbolicLink());assert.equal(s.uid,process.getuid());assert.equal(s.nlink,1);assert.equal(s.size,row.bytes,'Evidence size drift: '+name);assert.equal(s.ino,row.ino);assert.equal(s.dev,row.dev);}
 const used=totals();for(const [pool,size]of Object.entries(used))assert.ok(size<=budgetLimits[pool],'Evidence pool overflow: '+pool);return used;
}
function budgetError(error,name){
 remember(error);const row={file:name,name:error.name,message:error.message};budgetErrors.push(row);emit({evidence_error:row});
}
function rejectCapacity(name,bytes,pool,reason){
 const error=Error('Evidence capacity rejected: '+name+' ('+reason+')');capacityFailure??=error;
 budgetAttempts.push({path:name,category:pool,status:'rejected',attempted_bytes:bytes,actual_bytes:0,reason});budgetBlocked.add(name);throw error;
}
function putEvidence(name,data,append=false){
 evidenceName(name);const bytes=Buffer.isBuffer(data)?data:Buffer.from(data),pool=category(name);let attempted=false;
 try{
  assert.equal(budgetBlocked.has(name),false,'No retry of failed evidence: '+name);auditEvidence();
  const previous=budgetFiles.get(name),old=previous?.bytes||0,next=(append?old:0)+bytes.length;
  assert.ok(!previous||previous.category===pool,'Evidence classification is immutable');
  if(capacityFailure&&pool==='normal')return rejectCapacity(name,bytes.length,pool,'normal writes stopped after first capacity failure');
  if(name.endsWith('.png')&&bytes.length>pngLimit)return rejectCapacity(name,bytes.length,pool,'encoded PNG exceeds 8MiB');
  if(totals()[pool]-old+next>budgetLimits[pool])return rejectCapacity(name,bytes.length,pool,'fixed '+pool+' pool exhausted');
  const previousBytes=previous?readFileSync(join(evidence,name)):Buffer.alloc(0);
  if(previous)assert.equal(budgetHash(previousBytes),previous.sha256,'Evidence changed before replacement/append: '+name);
  const target=join(evidence,name);attempted=true;
  // wx prevents concurrent creation; replacements only touch previously verified files.
  writeFileSync(target,bytes,{flag:append?'a':previous?'w':'wx'});
  const info=lstatSync(target),actual=readFileSync(target),hash=budgetHash(actual);
  budgetFiles.set(name,{path:name,category:pool,bytes:info.size,sha256:hash,ino:info.ino,dev:info.dev,status:'written'});
  assert.ok(info.isFile()&&!info.isSymbolicLink());assert.equal(info.nlink,1);assert.equal(info.uid,process.getuid());assert.equal(info.size,next);
  const expected=append?budgetHash(Buffer.concat([previousBytes,bytes])):budgetHash(bytes);
  assert.equal(hash,expected,'Written evidence SHA256 mismatch: '+name);budgetFiles.get(name).status='verified';
  budgetAttempts.push({path:name,category:pool,status:'verified',bytes:info.size,delta:info.size-old,sha256:hash});auditEvidence();return true;
 }catch(error){
  // An incomplete write still occupies disk and must remain in the inventory.
  if(attempted){try{const s=lstatSync(join(evidence,name));if(s.isFile()&&!s.isSymbolicLink())budgetFiles.set(name,{path:name,category:pool,bytes:s.size,sha256:budgetHash(readFileSync(join(evidence,name))),ino:s.ino,dev:s.dev,status:'unverified'});}catch(readback){emit({evidence_unreadable:{path:name,name:readback.name,message:readback.message}});}}
  if(!budgetBlocked.has(name))budgetAttempts.push({path:name,category:pool,status:'failed',attempted_bytes:bytes.length,actual_bytes:budgetFiles.get(name)?.bytes||0,reason:error.message});
  budgetBlocked.add(name);budgetError(error,name);throw error;
 }
}
async function budgetScreenshot(page,name,options,fault=false){
 evidenceName(name);
 if(capacityFailure){const error=Error('No screenshot after capacity failure: '+name);budgetAttempts.push({path:name,category:fault?'fault':'normal',status:'not-captured',actual_bytes:0,reason:error.message});budgetError(error,name);throw error;}
 if(fault&&faultSlots>=3){try{rejectCapacity(name,0,'fault','fault screenshot slots exhausted');}catch(error){budgetError(error,name);throw error;}}
 let bytes;
 try{bytes=await page.screenshot({...options,fullPage:true});}catch(error){budgetAttempts.push({path:name,category:fault?'fault':'normal',status:'capture-failed',actual_bytes:0,reason:error.message});budgetError(error,name);throw error;}
 const target=fault?'fault-'+(++faultSlots)+'-'+name:name;
 try{putEvidence(target,bytes);}catch(error){
  // Only the same already encoded, never-written normal PNG may use one fault slot.
  if(!fault&&capacityFailure&&bytes.length<=pngLimit&&!budgetFiles.has(target)&&faultSlots<3){
   const saved='fault-'+(++faultSlots)+'-'+name;
   try{putEvidence(saved,bytes);budgetAttempts.push({path:saved,original_path:name,status:'retained-rejected-buffer',incomplete:true,bytes:bytes.length});}catch(saveError){emit({fault_buffer_unwritten:{path:saved,name:saveError.name,message:saveError.message}});}
  }
  throw error;
 }
}
function finishEvidence(){
 auditEvidence();
 for(const row of budgetFiles.values())assert.equal(budgetHash(readFileSync(join(evidence,row.path))),row.sha256,'Final evidence hash drift: '+row.path);
 putEvidence('budget-status.json',JSON.stringify({limits:budgetLimits,mode:budgetMode,capacity_failure:capacityFailure?.message||null,totals_before_index:totals(),fault_slots:faultSlots,errors:budgetErrors}));
 const files=[...budgetFiles.values()].map(({ino,dev,...row})=>row);
 // Inventory contains attempts before its own write, avoiding recursive hashes.
 // Its own verified write is logged separately; exact serialized bytes allow reconstruction.
 let size=0,bytes,converged=false;
 for(let i=0;i<8;i++){
  const used=totals();used.metadata+=size;
  bytes=Buffer.from(JSON.stringify({limits:budgetLimits,totals:used,files:[...files,{path:'inventory.json',category:'metadata',bytes:size,sha256:'see sealed inventory_file record'}],attempts:budgetAttempts}));
  if(bytes.length===size){converged=true;break;}size=bytes.length;
 }
 assert.equal(converged,true,'Inventory self-size must converge');putEvidence('inventory.json',bytes);
 emitInventoryRows();
 emit({inventory_content:{encoding:'utf8',content:bytes.toString('utf8'),self_write:'excluded from content attempts; included in evidence_attempt and inventory_file'}});
 emit({inventory_file:{path:'inventory.json',bytes:bytes.length,sha256:budgetHash(bytes),totals:auditEvidence(),limits:budgetLimits,capacity_failure:capacityFailure?.message||null}});
}
function emitInventoryRows(){
 for(const row of budgetFiles.values()){const {ino,dev,...publicRow}=row;emit({evidence_file:publicRow});}
 for(const [index,attempt]of budgetAttempts.entries())emit({evidence_attempt:{sequence:index+1,...attempt}});

}

async function checkBudget(){return Object.values(auditEvidence()).reduce((a,b)=>a+b,0);}
async function writeFile(path,data,options){
 const target=resolve(path);
 if(target.startsWith(evidence+'/')){assert.equal(options,undefined);return putEvidence(target.slice(evidence.length+1),data);}
 return rawWrite(path,data,options);
}
async function screenshot(page,path,fault=false){const target=resolve(path);assert.ok(target.startsWith(evidence+'/'),'Screenshot outside owned evidence');return budgetScreenshot(page,target.slice(evidence.length+1),{timeout:5000},fault);}
async function buildCandidate(){
 // Same existing buildPreviewAcceptance steps; only manifest writing is metered here.
 const config=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url)));
 assert.equal(config.buildCommand,'node delivery/web-preview/build.mjs && node delivery/web-preview/handoff-bridge.mjs && node delivery/web-preview/review-flag.mjs');
 const dist=new URL('./dist/',import.meta.url),manifest=await build();await applyHandoffBridge(dist);await applyReviewFlag(dist,{});
 await cp(dist,directory,{recursive:true});
 for(const name of Object.keys(manifest.files)){const entry=manifest.files[name];entry.output_sha256=createHash('sha256').update(await readFile(directory+'/'+name)).digest('hex');entry.derived=entry.source_sha256!==entry.output_sha256;}
 manifest.kind='preview-acceptance-after-handoff-bridge';await writeFile(evidence+'/preview-build-manifest.json',JSON.stringify(manifest,null,2));
}
async function closeService(service){assert.equal(closingServices.has(service),false,'No repeated service cleanup');closingServices.add(service);await bounded(service.close(),'Service close');liveServices.delete(service);cleanup.services.push('closed');}
async function closeBrowser(browser){assert.equal(closingBrowsers.has(browser),false,'No repeated browser cleanup');closingBrowsers.add(browser);await bounded(browser.close(),'Browser close');liveBrowsers.delete(browser);cleanup.browsers.push('closed');}
function ownContext(context){liveContexts.add(context);context.once('close',()=>liveContexts.delete(context));return context;}
async function closeContext(context){if(!context||!liveContexts.has(context)||closingContexts.has(context))return;closingContexts.add(context);await bounded(context.close(),'Context close');liveContexts.delete(context);cleanup.contexts.push('closed');}
const git=(args)=>execFileSync('git',args,{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
const objectHash=bytes=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex');
async function rebuildBaseline(){
 // Checkout's shallow PR merge need not include the grandparent. At most one
 // fetch of this exact public commit, on the same official origin, no retry.
 const present=spawnSync('git',['cat-file','-e',BASELINE+'^{commit}'],{stdio:'ignore',timeout:5000});
 if(present.error)throw present.error;
 if(present.status!==0){assert.equal(git(['remote','get-url','origin']).trim().replace(/\.git$/,''),'https://github.com/RC918/Growth-OS');git(['fetch','--no-tags','--depth=1','origin',BASELINE]);}
 assert.equal(git(['rev-parse',BASELINE+'^{tree}']).trim(),BASELINE_TREE);
 const records=git(['ls-tree','-rz',BASELINE,'--','apps/web',...Object.keys(baselineAssets)]).split('\0').filter(Boolean).map(line=>{const [header,path]=line.split('\t'),[mode,type,blob]=header.split(' ');assert.equal(mode,'100644');assert.equal(type,'blob');return {path,blob};});
 assert.equal(records.filter(r=>r.path.startsWith('apps/web/')).length,102);
 assert.equal(records.length,113);for(const [path,blob]of Object.entries(baselineAssets))assert.equal(records.find(r=>r.path===path)?.blob,blob);
 const root=owned+'/baseline';await mkdir(root);
 for(const item of records){const bytes=execFileSync('git',['cat-file','blob',item.blob],{timeout:5000,maxBuffer:2*1024*1024});assert.equal(objectHash(bytes),item.blob);const target=join(root,item.path);await mkdir(dirname(target),{recursive:true});await rawWrite(target,bytes);}
 await writeFile(evidence+'/baseline-source-closure.json',JSON.stringify({commit:BASELINE,tree:BASELINE_TREE,files:records},null,2));
 // Only this disposable reconstructed tree is built. Baseline sources cannot
 // import candidate code: all build imports/assets are in the audited closure.
 const runner=root+'/capture-build.mjs';await rawWrite(runner,"import {build} from './delivery/web-preview/build.mjs';import {applyHandoffBridge} from './delivery/web-preview/handoff-bridge.mjs';import {applyReviewFlag} from './delivery/web-preview/review-flag.mjs';await build();const dist=new URL('./delivery/web-preview/dist/',import.meta.url);await applyHandoffBridge(dist);await applyReviewFlag(dist,{});\n");
 execFileSync(process.execPath,[runner],{cwd:root,stdio:'pipe',timeout:30000,maxBuffer:1024*1024});
 for(const item of records)assert.equal(objectHash(await readFile(join(root,item.path))),item.blob,'Baseline source changed by build: '+item.path);
 emit({baseline_identity:{commit:BASELINE,tree:BASELINE_TREE,closure_files:records.length}});
 return root+'/delivery/web-preview/dist';
}
async function frozenAndSourceGuard(){
 const manifest=JSON.parse(await readFile('prototype/internal-rc/deploy/hashes.json'));assert.equal(Object.keys(manifest).length,117);
 for(const [path,hash]of Object.entries(manifest))assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),hash,'Frozen hash: '+path);
 const lines=git(['ls-tree','-rz','HEAD','--','apps/web']).split('\0').filter(Boolean);
 for(const line of lines){const [header,path]=line.split('\t');assert.equal(objectHash(await readFile(path)),header.split(' ')[2],'Build changed web source: '+path);}
 emit({source_guard:{frozen:117,web_sources:lines.length,all_match_checkout:true}});
}
async function variants(site){
 const html=await readFile(site+'/growth-console.html','utf8'),workspaceHTML=await readFile(site+'/workspace.html','utf8');
 for(const [variant,css]of Object.entries({narrow:'main{width:360px;max-width:100%}',sidebar:'.shell{grid-template-columns:208px minmax(0,1fr) 224px}',text200:':root{font-size:32px}',fallback:'main>section,.rail section,#workspace,#url-result-panel,.saved-result-review{container-type:normal;container-name:none}'})){
  await writeFile(site+'/test-'+variant+'.css',css);await writeFile(site+'/growth-console-'+variant+'.html',html.replace('</head>','<link rel="stylesheet" href="./test-'+variant+'.css"></head>'));await writeFile(site+'/workspace-'+variant+'.html',workspaceHTML.replace('</head>','<link rel="stylesheet" href="./test-'+variant+'.css"></head>'));
 }
}
async function visibleKeyboardFocus(page,selector){
 await page.locator(selector).scrollIntoViewIfNeeded();
 const focus=await page.locator(selector).evaluate(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect(),color=s.outlineColor;const alpha=color==='transparent'?0:color.startsWith('rgba(')?parseFloat(color.split(',').at(-1)):color.includes('/')?parseFloat(color.split('/').at(-1)):1;return {focused:n===document.activeElement,focusVisible:n.matches(':focus-visible'),style:s.outlineStyle,width:parseFloat(s.outlineWidth),color,alpha,visible:s.visibility==='visible'&&r.width>0&&r.height>0&&r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1};});
 assert.equal(focus.focused,true,selector);assert.equal(focus.focusVisible,true,'Keyboard focus pseudo-class: '+selector);assert.equal(focus.visible,true,'Focused control clipped: '+selector);assert.ok(focus.width>0&&focus.style!=='none'&&focus.alpha>0,'Visible focus outline: '+selector);
 emit({product_keyboard_focus:{selector,...focus}});requireHealthy();
 return focus;
}
async function visualState(page){return page.evaluate(()=>{
 const box=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,rects:n.getClientRects().length,hidden:n.hidden};};
 const scroll=Object.fromEntries(['main','guidance','task-details'].map(id=>{const n=document.getElementById(id);return [id,{x:n.scrollLeft,y:n.scrollTop}];}));
 const semantic={scroll:{window:{x:scrollX,y:scrollY},...scroll},focus:{id:document.activeElement.id,visible:document.activeElement.matches(':focus-visible')},scenario:{banner:document.getElementById('mode-banner').textContent,phase:document.getElementById('task-phase').textContent,claim:document.getElementById('claim-status').textContent,binding:document.getElementById('result-binding').textContent,url:document.getElementById('source-url').value,panels:Object.fromEntries(['input-panel','overview-panel','result-panel','sources-panel','measure-panel'].map(id=>[id,document.getElementById(id).hidden]))},expansion:{guideHidden:document.getElementById('guidance').hidden,taskHidden:document.getElementById('task-details').hidden,navOpen:document.getElementById('site-nav').classList.contains('open'),toggles:Object.fromEntries(['nav-toggle','guide-toggle','task-toggle'].map(id=>[id,document.getElementById(id).getAttribute('aria-expanded')])),details:[...document.querySelectorAll('details')].map((n,index)=>({id:n.id||String(index),open:n.open}))},fields:[...document.querySelectorAll('#result-fields textarea')].map(n=>({id:n.id,value:n.value})),checks:[...document.querySelectorAll('.fact-check input')].map(n=>({id:n.id,checked:n.checked})),confirmationDisabled:document.getElementById('review-confirm').disabled};
 return {semantic,fieldText:document.getElementById('result-fields').textContent,font:getComputedStyle(document.documentElement).fontSize,viewport:{width:innerWidth,height:innerHeight},bodyClass:document.body.className,overflow:document.documentElement.scrollWidth>innerWidth,shell:getComputedStyle(document.querySelector('.shell')).display,controls:Object.fromEntries(['guide-action','guide-close','task-toggle','review-confirm'].map(id=>[id,box(document.getElementById(id))]))};
});}
const visualPairs=[];
async function capturePair(page,kind,width,variant,font){
 // Match the capture state through UI focus and scroll only, never layout CSS.
 await page.waitForFunction(()=>document.querySelector('#claim-recheck')?.getAttribute('aria-busy')==='false');
 await page.locator('#guide-toggle').focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');await visibleKeyboardFocus(page,'#guide-toggle');
 await page.evaluate(()=>{window.scrollTo(0,0);for(const id of ['main','guidance','task-details'])document.getElementById(id).scrollTo(0,0);});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const label=width+'-'+variant+'-'+font,state=await visualState(page);state.semantic.fieldTextSha256=createHash('sha256').update(state.fieldText).digest('hex');delete state.fieldText;
 assert.equal(state.font,font+'px');for(const position of Object.values(state.semantic.scroll))assert.deepEqual(position,{x:0,y:0},'Capture scroll must be reset');
 assert.deepEqual(state.semantic.focus,{id:'guide-toggle',visible:true});assert.equal(state.semantic.expansion.guideHidden,false);assert.equal(state.semantic.expansion.taskHidden,true);assert.equal(state.semantic.expansion.navOpen,false);assert.ok(state.semantic.expansion.details.every(n=>!n.open));
 assert.equal(state.semantic.scenario.panels['result-panel'],false);assert.equal(state.semantic.confirmationDisabled,true);assert.ok(state.semantic.checks.every(n=>!n.checked));assert.match(state.semantic.scenario.banner,/真網址模式/);
 if(kind==='candidate'){const before=visualPairs.find(p=>p.kind==='baseline'&&p.label===label);assert.ok(before,'Missing exact baseline pair');assert.deepEqual(state.semantic,before.state.semantic,'Visual scroll/expansion/scenario/content/focus mismatch');assert.deepEqual(state.viewport,before.state.viewport);}
 await screenshot(page,evidence+'/'+kind+'-'+label+'.png');
 const after=await visualState(page);after.semantic.fieldTextSha256=createHash('sha256').update(after.fieldText).digest('hex');assert.deepEqual(after.semantic,state.semantic,'Capture changed its own semantic state');
 await writeFile(evidence+'/'+kind+'-'+label+'.json',JSON.stringify(state,null,2));visualPairs.push({kind,label,state});emit({visual_pair:{kind,label,...state}});requireHealthy();
}
async function captureBaselines(site){
 const browser=await chromium.launch();liveBrowsers.add(browser);emit({baseline_runtime:{browser:browser.version(),playwright:playwrightVersion,node:process.version,platform:process.platform,arch:process.arch}});
 try{for(const [width,variant]of [[1280,'normal'],[390,'normal'],[320,'normal'],[1280,'narrow'],[1280,'sidebar']])for(const font of [16,32]){
  const service=await startTestService({directory:site,report:fixtureReport,storePath:owned+'/baseline-'+width+'-'+variant+'-'+font+'.json'});liveServices.add(service);const context=ownContext(await browser.newContext({viewport:{width,height:900}}));
  try{
   await context.route('**/*',route=>new URL(route.request().url()).origin===service.origin?route.continue():route.abort('blockedbyclient'));
   const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-24T08:00:00Z'));const route=variant==='normal'?'growth-console.html':'growth-console-'+variant+'.html';
   // Initial font fixture is served as CSS before product module evaluation.
   if(font===32)await context.route('**/growth-console.css',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+'\n:root{font-size:32px}\n'});});
   await page.goto(service.origin+'/'+route);const report=fixtureReport;await page.fill('#source-url',report.snapshot.original_url);await page.click('#source-submit');await page.locator('#result-panel').waitFor({state:'visible'});
   if(width<768)await page.click('#guide-toggle');
   await capturePair(page,'baseline',width,variant,font);assert.equal(service.requests.filter(r=>r.method==='POST').length,0);
  }catch(error){remember(error);throw failure;}finally{await cleanupStep('baseline-context',()=>closeContext(context));await cleanupStep('baseline-service',()=>closeService(service));requireHealthy();}
 }}catch(error){remember(error);throw failure;}finally{await cleanupStep('baseline-browser',()=>closeBrowser(browser));requireHealthy();}
}
try{
 claimEvidenceRoot();
 const event=process.env.GITHUB_EVENT_PATH?JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH)):{};
 const productIdentity={source_head:event.pull_request?.head?.sha||process.env.GITHUB_SHA,checkout_sha:git(['rev-parse','HEAD']).trim(),checkout_tree:git(['rev-parse','HEAD^{tree}']).trim(),e2e_sha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),baseline:BASELINE,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,evidence_limit:evidenceLimit,evidence_limit_mode:budgetMode,evidence_pools:budgetLimits};emit({product_identity:productIdentity});
 assert.equal(playwrightVersion,'1.58.2');
 assert.equal(process.env.PRODUCT_UI_ENGINES||'chromium,firefox,webkit','chromium,firefox,webkit','No reduced-engine CI acceptance');assert.equal(process.env.PRODUCT_UI_CASE,undefined,'No filtered CI acceptance');
 fixtureReport=producerReport();await writeFile(evidence+'/fixture-identity.json',JSON.stringify({report_sha256:createHash('sha256').update(canonical(fixtureReport)).digest('hex'),source_version:fixtureReport.snapshot.version},null,2));
 await frozenAndSourceGuard();
 const baselineSite=await rebuildBaseline();await variants(baselineSite);await captureBaselines(baselineSite);
 await buildCandidate();await checkBudget();await frozenAndSourceGuard();await variants(directory);
const results=[];
const keyboard=[];
async function tabTo(page,selector){
 // Follow the actual tab order in either direction instead of wrapping the
 // entire workspace when a prior control is immediately above the current one.
 const backward=await page.locator(selector).evaluate(n=>!!(n.compareDocumentPosition(document.activeElement)&4));
 // macOS WebKit follows Safari's Option-Tab navigation. No OS/browser
 // preference is changed; retain the plain-Tab failure as a distinct record.
 const option=process.platform==='darwin'&&page.context().browser().browserType().name()==='webkit';
 const key=(backward?'Shift+':'')+(option?'Alt+':'')+'Tab';
 const start=await page.evaluateHandle(()=>document.activeElement);let moved=false;
 try{for(let i=0;i<200;i++){
  const state=await page.locator(selector).evaluate(n=>{const r=n.getBoundingClientRect();return {focused:n===document.activeElement,box:n.getClientRects().length>0&&r.width>0&&r.height>0};});
  assert.equal(state.box,true,'Target lost layout box: '+selector);
  if(state.focused){await visibleKeyboardFocus(page,selector);return;}
  keyboard.push({target:selector,key,from:await page.evaluate(()=>({id:document.activeElement.id,tag:document.activeElement.tagName,text:document.activeElement.textContent?.slice(0,100)}))});
  await page.keyboard.press(key);
  const atStart=await start.evaluate(n=>n===document.activeElement);
  if(!atStart)moved=true;
  if(moved&&atStart)throw Error('First complete focus cycle: '+selector);
 }
 throw Error('Keyboard safety bound reached: '+selector);
 }catch(error){remember(error);throw failure;}finally{await cleanupStep('keyboard-handle',()=>start.dispose());requireHealthy();}
}
// Measure the actual rendered boxes; no target focus or CSS changes by probes.
async function assistantGeometry(page,variant,width){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const g=await page.evaluate(()=>{
  const rail=document.querySelector('.rail'),guide=document.querySelector('#guidance'),task=document.querySelector('#task-card'),action=document.querySelector('#guide-action');
  const box=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  return {visible:!guide.hidden,natural:rail.classList.contains('assistant-natural'),position:getComputedStyle(rail).position,guide:box(guide),task:box(task),action:box(action),scrollHeight:guide.scrollHeight,clientHeight:guide.clientHeight};
 });
 if(width===1280&&g.visible){
  assert.ok(g.scrollHeight<=g.clientHeight+1,'Assistant needs internal scroll');
  assert.ok(g.guide.bottom<=g.task.top+1,'Assistant overlaps task card');
  assert.ok(g.action.top>=g.guide.top&&g.action.bottom<=g.guide.bottom,'Assistant action clipped');
  assert.equal(g.position,'static','Assistant must follow natural document flow');
 }
 return g;
}
async function stableShell(page,width){
 const state=await page.evaluate(()=>{const shell=document.querySelector('.shell'),main=document.querySelector('main'),card=document.querySelector('#result-panel'),style=getComputedStyle(card),font=parseFloat(getComputedStyle(document.documentElement).fontSize),content=card.getBoundingClientRect().width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-parseFloat(style.borderLeftWidth)-parseFloat(style.borderRightWidth);return {overflow:document.documentElement.scrollWidth>innerWidth,display:getComputedStyle(shell).display,direction:getComputedStyle(shell).flexDirection,columns:getComputedStyle(shell).gridTemplateColumns.split(' ').length,bodyOverflow:getComputedStyle(document.body).overflow,mainOverflow:getComputedStyle(main).overflow,cardContainer:style.containerType,contentWidth:content,expectedCardColumns:style.containerType==='normal'||content<32*font?1:2,cardColumns:getComputedStyle(document.querySelector('.comparison')).gridTemplateColumns.split(' ').length};});
 assert.equal(state.overflow,false);assert.notEqual(state.bodyOverflow,'hidden');assert.equal(state.cardColumns,state.expectedCardColumns,'Card CQ must follow content width');
 if(width<768){assert.equal(state.display,'flex');assert.equal(state.direction,'column');assert.equal(state.mainOverflow,'visible');}
 if(width>=1024){assert.equal(state.display,'grid');assert.equal(state.columns,3);}
 for(const selector of ['#guide-action','#guide-close','#task-toggle','#review-confirm']){
  const box=await page.locator(selector).boundingBox();assert.ok(box&&box.width>0&&box.height>=44,'Original control needs a real >=44px box: '+selector);
  await page.locator(selector).scrollIntoViewIfNeeded();assert.equal(await page.locator(selector).evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'Original control is covered: '+selector);
 }
 return state;
}
// Charge the new diagnostic file and both decoded/sealed transport representations.
async function writeDifferenceDiagnostic(record,name='difference-range-diagnostic.json'){
 const pack=value=>{
  const payload=JSON.stringify(value),log=Buffer.from(JSON.stringify({difference_diagnostic:value})+'\n');
  assert.ok(Number.isSafeInteger(frames)&&frames>=0&&Math.ceil(log.length/480)<=Number.MAX_SAFE_INTEGER-frames,'Diagnostic packing exceeds safe sequence');
  let framingBytes=0;
  for(let offset=0,sequence=frames;offset<log.length;offset+=480){framingBytes+=Buffer.byteLength(JSON.stringify({product_evidence_frame:{sequence:++sequence,data:log.subarray(offset,offset+480).toString('base64')}})+'\n');}
  return {payload,fileBytes:Buffer.byteLength(payload),logBytes:log.length,framingBytes,total:Buffer.byteLength(payload)+log.length+framingBytes};
 };
 assert.equal(differenceStopped,false,'Difference diagnostics already stopped');
 const full=pack(record),limit=256*1024,completeLimit=293*MiB,reserve=MiB,runLimit=294*MiB;
 const fits=(x,summary)=>x.fileBytes<=limit&&differenceDiagnosticBytes+x.total<=runLimit&&totals().normal+x.total<=budgetLimits.normal&&
  (summary?(!differenceSummaryUsed&&x.total<=reserve):(differenceCompleteRecords<337&&differenceCompleteBytes+x.total<=completeLimit));
 const complete=record.complete===true&&fits(full,false);
 if(!complete)differenceStopped=true;
 const chosen=complete?full:pack({case:record.case,phase:record.phase,complete:false,reason:'record-count-size-or-pool-limit',attemptedFileBytes:full.fileBytes,attemptedTotalBytes:full.total,recordLimit:limit,recordCount:differenceCompleteRecords,recordCountLimit:337,runLimit});
 assert.ok(fits(chosen,!complete),'No capacity for the single incomplete diagnostic');
 // Admit the complete emission before writing; emit independently enforces the global sequence bound.
 const logFrames=Math.ceil(chosen.logBytes/480);
 assert.ok(Number.isSafeInteger(frames)&&frames>=0&&logFrames<=Number.MAX_SAFE_INTEGER-frames,'Diagnostic sequence exceeds safe integer');
 if(complete){differenceCompleteRecords++;differenceCompleteBytes+=chosen.total;}else differenceSummaryUsed=true;
 await writeFile(evidence+'/'+name,chosen.payload);
 differenceDiagnosticBytes+=chosen.total;
 differenceDiagnosticLogBytes+=chosen.logBytes+chosen.framingBytes;
 auditEvidence();
 assert.equal(emit({difference_diagnostic:JSON.parse(chosen.payload)}),true,'Diagnostic sealed-log emission failed');
 if(!complete)throw Error('Incomplete difference diagnostic: capacity limit');
}

// Read all rendered difference fragments without focusing, scrolling or mutating the page.

// Only this pure predicate grants an exception to paragraph self-containment.
// Recompute safety from observed roles and values; never trust a cached safe flag.
function hangingSafety(x){
 const reasons=[],bad=(index,role,property,value)=>reasons.push({index,role,property,value:value??null});
 if(!x||!Array.isArray(x.styles)||!x.styles.length)return [{property:'styles',value:null}];
 for(const [index,st]of x.styles.entries()){
  const role=st.role;
  if(!['paragraph','inline','ancestor'].includes(role))bad(index,role,'role',role);
  const displays=role==='inline'?['inline']:role==='paragraph'?['block']:['block','grid','flex'];
  if(!displays.includes(st.display))bad(index,role,'display',st.display);
  if(!(role==='inline'?['normal']:['normal','isolate']).includes(st.unicodeBidi))bad(index,role,'unicodeBidi',st.unicodeBidi);
  for(const [key,expected]of Object.entries({direction:'ltr',writingMode:'horizontal-tb',position:'static',float:'none',transform:'none',translate:'none',rotate:'none',scale:'none',animationName:'none',clipPath:'none',clip:'auto'}))if(st[key]!==expected)bad(index,role,key,st[key]);
  if(typeof st.contain!=='string'||/paint|strict|content/.test(st.contain))bad(index,role,'contain',st.contain);
  for(const key of ['before','after'])if(!['none','normal'].includes(st[key]))bad(index,role,key,st[key]);
  if(role==='paragraph'||role==='inline'){
   if(st.whiteSpace!=='pre-wrap')bad(index,role,'whiteSpace',st.whiteSpace);
   if(role==='inline'&&st.verticalAlign!=='baseline')bad(index,role,'verticalAlign',st.verticalAlign);
  }
 }
 if(x.styles.filter(s=>s.role==='paragraph').length!==1)bad(null,null,'paragraph-count',x.styles.filter(s=>s.role==='paragraph').length);
 if(!x.styles.some(s=>s.role==='ancestor'))bad(null,null,'ancestors','missing');
 if(x.hasBr!==false)bad(null,null,'hasBr',x.hasBr);
 if(x.activeAnimations!==0)bad(null,null,'activeAnimations',x.activeAnimations);
 for(const key of ['ancestorsSafe','noScroll','overflowVisible','nextBelow','documentFits'])if(x[key]!==true)bad(null,null,key,x[key]);
 return reasons;
}
function classifyHanging(x){
 const safetyReasons=hangingSafety(x);
 if(safetyReasons.length)return {accepted:false,reason:'unsafe-or-incomplete',safetyReasons,acceptedHangingRuns:[]};
 return classifyHangingGeometry(x);
}
// Also replayable against historical geometry whose dynamic safety evidence is incomplete.
function classifyHangingGeometry(x){
 const reject=reason=>({accepted:false,reason,acceptedHangingRuns:[]});
 if(!/^[\x20-\x7e]+$/.test(x.text)||!x.chars.length||!x.raw.length)return reject('unsupported-or-incomplete');
 const b=x.paragraph,inside=r=>r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;
 const same=(a,c)=>Math.abs(a.top-c.top)<=1&&Math.abs(a.bottom-c.bottom)<=1;
 const chars=x.chars;
 if(chars.map(c=>String.fromCodePoint(c.codepoint)).join('')!==x.text||chars.some(c=>c.rects.length!==1||c.rects[0].right<=c.rects[0].left||c.rects[0].bottom<=c.rects[0].top))return reject('missing-or-ambiguous-rect');
 const offenders=chars.map((c,i)=>inside(c.rects[0])?-1:i).filter(i=>i>=0),covered=new Set(),acceptedHangingRuns=[];
 if(!offenders.length)return reject('unattributed-raw-overflow');
 for(const index of offenders){
  if(covered.has(index))continue;
  if(chars[index].codepoint!==32)return reject('non-space-overflow');
  let first=index,last=index;while(first>0&&chars[first-1].codepoint===32)first--;while(last+1<chars.length&&chars[last+1].codepoint===32)last++;
  const before=chars[first-1],after=chars[last+1];if(!before||!after||before.codepoint===32||after.codepoint===32)return reject('missing-line-neighbour');
  const pr=before.rects[0],nr=after.rects[0];
  if(!inside(pr)||!inside(nr)||nr.top<pr.bottom-1||same(pr,nr))return reject('not-soft-next-line');
  for(let i=first;i<=last;i++){
   const c=chars[i],r=c.rects[0];
   if(!same(pr,r)||r.left<pr.right-1||r.left<b.left-1||r.top<b.top-1||r.bottom>b.bottom+1)return reject('not-inline-end');
   if([before,after,c].some(n=>n.font!==before.font||n.fontSize!==before.fontSize||n.lineHeight!==before.lineHeight))return reject('ambiguous-font');
   covered.add(i);
  }
  if(chars.slice(last+1).some(c=>c.codepoint!==32&&same(pr,c.rects[0])))return reject('later-ink-on-line');
  acceptedHangingRuns.push({first,last,before:first-1,after:last+1,characters:chars.slice(first,last+1),rightOverrun:Math.max(...chars.slice(first,last+1).map(c=>Math.max(0,c.rects[0].right-b.right)))});
 }
 // Every raw overflow rectangle must be explained by a proved run, not a displaced inline box.
 for(const r of x.raw.filter(r=>!inside(r))){
  if(r.left<b.left-1||r.top<b.top-1||r.bottom>b.bottom+1)return reject('raw-non-end-overflow');
  const linked=chars.map((c,index)=>({c,index})).filter(({c})=>c.source===r.source&&same(r,c.rects[0])&&c.rects[0].left>=r.left-1&&c.rects[0].right<=r.right+1);
  if(!Number.isInteger(r.source)||r.source<0||!linked.length)return reject('unattributed-inline-box');
  const boxes=linked.map(({c})=>c.rects[0]).sort((a,b)=>a.left-b.left);
  if(Math.abs(boxes[0].left-r.left)>1||Math.abs(Math.max(...boxes.map(b=>b.right))-r.right)>1)return reject('incomplete-raw-coverage');
  let edge=boxes[0].right;for(const box of boxes.slice(1)){if(box.left>edge+1)return reject('raw-coverage-gap');edge=Math.max(edge,box.right);}
  if(linked.some(({c,index})=>!inside(c.rects[0])&&!covered.has(index)))return reject('unproved-source-character');
  if(!linked.some(({c,index})=>!inside(c.rects[0])&&covered.has(index)))return reject('unrelated-raw-box');
 }
 return {accepted:true,reason:'proved-ascii-pre-wrap-soft-line-end',acceptedHangingRuns};
}

async function hangingContracts(browser,name){
 const context=ownContext(await browser.newContext());const outcomes=[];
 try{
  await context.route('**/*',route=>route.abort('blockedbyclient'));
  const page=await context.newPage();
  const html='<style>p{margin:0;width:50px;font:20px/2 monospace;white-space:pre-wrap;overflow:visible}#clip{overflow:visible}</style><div id="clip"><div data-diff-field="fixture"><p class="difference-text">aaaa a</p></div><details>evidence</details></div>';
  await page.setContent(html);
  await page.locator('[data-diff-field]').evaluate(n=>{n._before=n._after=n.querySelector('p').textContent;});
  const read=async()=> (await page.locator('[data-diff-field]').evaluateAll(measureDifferenceRoots,'contract'))[0];
  const positive=await read();assert.ok(positive.hanging,'Contract must exercise a real overrun');
  assert.equal(classifyHanging(positive.hanging).accepted,true,'Soft-wrap space contract');assert.equal(positive.hanging.styles.find(s=>s.role==='paragraph').unicodeBidi,'isolate');outcomes.push({case:'soft-wrap',snapshot:positive.hanging,verdict:classifyHanging(positive.hanging)});
  await page.locator('p').evaluate(n=>n.replaceChildren(document.createTextNode('aaaa '),document.createTextNode(' a')));
  await page.locator('[data-diff-field]').evaluate(n=>{n._before=n._after=n.querySelector('p').textContent;});
  const cross=await read();assert.equal(classifyHanging(cross.hanging).accepted,true,'Cross-node space run');outcomes.push({case:'cross-node-spaces',snapshot:cross.hanging,verdict:classifyHanging(cross.hanging)});

  const mutate=(label,change)=>{const copy=structuredClone(positive.hanging);change(copy);assert.equal(classifyHanging(copy).accepted,false,label);outcomes.push({case:label,accepted:false});};
  for(const [label,cp]of [['non-space',88],['nbsp',160],['tab',9],['unicode-space',8195],['linefeed',10],['bidi-control',8238]])mutate(label,x=>{x.chars[4].codepoint=cp;x.text=x.chars.map(c=>String.fromCodePoint(c.codepoint)).join('');});
  mutate('same-line-successor',x=>{x.chars[5].rects[0]={...x.chars[0].rects[0]};});
  mutate('missing-next',x=>{x.chars.pop();x.text=x.text.slice(0,-1);});
  mutate('no-same-line-predecessor',x=>{x.chars[3].rects[0].top-=50;x.chars[3].rects[0].bottom-=50;});
  for(const axis of ['left','top','bottom'])mutate(axis+'-overflow',x=>{x.chars[4].rects[0][axis]=x.paragraph[axis]+(axis==='bottom'?10:-10);});
  mutate('unrelated-raw-source',x=>{x.raw.push({...x.raw.find(r=>r.right>x.paragraph.right+1),source:9999});});
  mutate('raw-coverage-gap',x=>{const r=x.raw.find(r=>r.right>x.paragraph.right+1);r.left-=5;});
  mutate('font-ambiguity',x=>x.chars[4].font='different');
  mutate('missing-rect',x=>x.chars[4].rects=[]);mutate('zero-raw',x=>x.raw=[]);
  for(const key of ['ancestorsSafe','noScroll','overflowVisible','nextBelow','documentFits'])mutate(key,x=>x[key]=false);
  // Separate DOM fixtures validate the collector, not merely the pure predicate.
  for(const [label,css]of [['ink-overflow','letter-spacing:60px'],['ancestor-clip',''],['rtl','direction:rtl'],['vertical','writing-mode:vertical-rl'],['transform','transform:translateX(2px)'],['bidi','unicode-bidi:bidi-override'],['wrong-white-space','white-space:break-spaces'],['paint-containment',''],['forced-br',''],['generated-content',''],['vertical-align',''],['inner-block',''],['inner-inline-block',''],['inner-float',''],['inline-isolate',''],['isolate-override','unicode-bidi:isolate-override'],['plaintext','unicode-bidi:plaintext']]){
   await page.setContent(html);await page.locator('[data-diff-field]').evaluate(n=>{n._before=n._after=n.querySelector('p').textContent;});
   if(label==='ancestor-clip')await page.locator('#clip').evaluate(n=>{n.style.width='30px';n.style.overflow='hidden';});
   else if(label==='paint-containment')await page.locator('#clip').evaluate(n=>n.style.contain='paint');
   else if(label==='forced-br')await page.locator('p').evaluate(n=>n.innerHTML='aaaa <br>a');
   else if(label==='generated-content')await page.addStyleTag({content:'p::after{content:"extra"}'});
   else if(label==='vertical-align')await page.locator('p').evaluate(n=>n.innerHTML='aaaa<span style="vertical-align:super"> </span>a');
   else if(label==='inline-isolate')await page.locator('p').evaluate(n=>n.innerHTML='aaaa<span style="unicode-bidi:isolate"> </span>a');
   else if(label.startsWith('inner-'))await page.locator('p').evaluate((n,label)=>{n.innerHTML='aaaa<span> </span>a';n.querySelector('span').style.cssText=label==='inner-float'?'float:left':label==='inner-block'?'display:block':'display:inline-block';},label);
   else await page.locator('p').evaluate((n,css)=>n.style.cssText+=css,css);
   const row=await read(),x=row.hanging;assert.ok(x,'Contract needs a measured snapshot: '+label);
   const over=x.chars.filter(c=>c.codepoint!==32&&c.rects.some(r=>r.left<x.paragraph.left-1||r.right>x.paragraph.right+1||r.top<x.paragraph.top-1||r.bottom>x.paragraph.bottom+1));
   if(label==='ink-overflow'){assert.ok(over.length>0,'Must measure real non-space overflow');assert.equal(x.styles.find(s=>s.tag==='P').whiteSpace,'pre-wrap');}
   if(label==='ancestor-clip')assert.equal(x.ancestorsSafe,false,'Must measure actual ancestor clip');
   const styles=x.styles;
   if(label==='rtl')assert.ok(styles.some(s=>s.direction==='rtl'));
   if(label==='vertical')assert.ok(styles.some(s=>s.writingMode==='vertical-rl'));
   if(label==='transform')assert.ok(styles.some(s=>s.transform!=='none'));
   if(label==='bidi')assert.ok(styles.some(s=>s.unicodeBidi==='bidi-override'));
   if(label==='inline-isolate')assert.ok(styles.some(s=>s.role==='inline'&&s.unicodeBidi==='isolate'));
   if(['isolate-override','plaintext'].includes(label))assert.ok(styles.some(s=>s.role==='paragraph'&&s.unicodeBidi===label));
   if(label==='wrong-white-space')assert.ok(styles.some(s=>s.tag==='P'&&s.whiteSpace==='break-spaces'));
   if(label==='paint-containment')assert.ok(styles.some(s=>s.contain==='paint'));
   if(label==='forced-br')assert.ok(styles.some(s=>s.tag==='BR'));
   if(label==='generated-content')assert.ok(styles.some(s=>s.after.includes('extra')));
   if(label==='vertical-align')assert.ok(styles.some(s=>s.tag==='SPAN'&&s.verticalAlign==='super'));
   if(label==='inner-block')assert.ok(styles.some(s=>s.tag==='SPAN'&&s.display==='block'));
   if(label==='inner-inline-block')assert.ok(styles.some(s=>s.tag==='SPAN'&&s.display==='inline-block'));
   if(label==='inner-float')assert.ok(styles.some(s=>s.tag==='SPAN'&&s.float==='left'));
   const verdict=classifyHanging(x);assert.equal(verdict.accepted,false,label);
   outcomes.push({case:label,verdict,paragraph:x.paragraph,nonSpaceOverflow:over,ancestors:row.ancestors,styles});
  }
  // Historical snapshot: f16f00ae5fc31d4ba75bf2edd400e83db64adf73 / job 121092990097.
  // Sealed JSONL SHA256: 64d3c384de918675e9ba5cba6c1fd9d30349233dcdf9dffb3ca87307411898d1.
  const recordedJSON="{\"safe\":false,\"text\":\"Old generic catalogPublic steel bolt for workshop assembly.\",\"paragraph\":{\"left\":281,\"right\":495,\"top\":-2823.578125,\"bottom\":-2535.609375},\"raw\":[{\"source\":1,\"left\":281,\"right\":465.171875,\"top\":-2814.578125,\"bottom\":-2776.578125},{\"source\":1,\"left\":465.171875,\"right\":475.34375,\"top\":-2814.578125,\"bottom\":-2776.578125},{\"source\":1,\"left\":281,\"right\":399.140625,\"top\":-2756.984375,\"bottom\":-2718.984375},{\"source\":2,\"left\":410.328125,\"right\":487.4375,\"top\":-2756.984375,\"bottom\":-2718.984375},{\"source\":2,\"left\":281,\"right\":457.75,\"top\":-2699.390625,\"bottom\":-2661.390625},{\"source\":2,\"left\":457.75,\"right\":467.921875,\"top\":-2699.390625,\"bottom\":-2661.390625},{\"source\":2,\"left\":281,\"right\":489.453125,\"top\":-2641.796875,\"bottom\":-2603.796875},{\"source\":2,\"left\":489.453125,\"right\":499.625,\"top\":-2641.796875,\"bottom\":-2603.796875},{\"source\":2,\"left\":281,\"right\":438.5625,\"top\":-2584.203125,\"bottom\":-2546.203125}],\"chars\":[{\"node\":1,\"source\":1,\"start\":0,\"end\":1,\"codepoint\":79,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":281,\"right\":306.1875,\"top\":-2814.578125,\"bottom\":-2776.578125}]},{\"node\":1,\"source\":1,\"start\":1,\"end\":2,\"codepoint\":108,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":306.1875,\"right\":315.078125,\"top\":-2814.578125,\"bottom\":-2776.578125}]},{\"node\":1,\"source\":1,\"start\":2,\"end\":3,\"codepoint\":100,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":315.078125,\"right\":335.390625,\"top\":-2814.578125,\"bottom\":-2776.578125}]},{\"node\":1,\"source\":1,\"start\":3,\"end\":4,\"codepoint\":32,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":335.390625,\"right\":345.5625,\"top\":-2814.578125,\"bottom\":-2776.578125}]},{\"node\":1,\"source\":1,\"start\":4,\"end\":5,\"codepoint\":103,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":345.5625,\"right\":365.875,\"top\":-2814.578125,\"bottom\":-2776.578125}]},{\"node\":1,\"source\":1,\"start\":5,\"end\":6,\"codepoint\":101,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":365.875,\"right\":385.5625,\"top\":-2814.578125,\"bottom\":-2776.578125}]},{\"node\":1,\"source\":1,\"start\":6,\"end\":7,\"codepoint\":110,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":385.5625,\"right\":405.84375,\"top\":-2814.578125,\"bottom\":-2776.578125}]},{\"node\":1,\"source\":1,\"start\":7,\"end\":8,\"codepoint\":101,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":405.84375,\"right\":425.53125,\"top\":-2814.578125,\"bottom\":-2776.578125}]},{\"node\":1,\"source\":1,\"start\":8,\"end\":9,\"codepoint\":114,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":425.53125,\"right\":438.6875,\"top\":-2814.578125,\"bottom\":-2776.578125}]},{\"node\":1,\"source\":1,\"start\":9,\"end\":10,\"codepoint\":105,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":438.6875,\"right\":447.578125,\"top\":-2814.578125,\"bottom\":-2776.578125}]},{\"node\":1,\"source\":1,\"start\":10,\"end\":11,\"codepoint\":99,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":447.578125,\"right\":465.171875,\"top\":-2814.578125,\"bottom\":-2776.578125}]},{\"node\":1,\"source\":1,\"start\":11,\"end\":12,\"codepoint\":32,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":465.171875,\"right\":475.34375,\"top\":-2814.578125,\"bottom\":-2776.578125}]},{\"node\":1,\"source\":1,\"start\":12,\"end\":13,\"codepoint\":99,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":281,\"right\":298.59375,\"top\":-2756.984375,\"bottom\":-2718.984375}]},{\"node\":1,\"source\":1,\"start\":13,\"end\":14,\"codepoint\":97,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":298.59375,\"right\":318.203125,\"top\":-2756.984375,\"bottom\":-2718.984375}]},{\"node\":1,\"source\":1,\"start\":14,\"end\":15,\"codepoint\":116,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":318.203125,\"right\":330.75,\"top\":-2756.984375,\"bottom\":-2718.984375}]},{\"node\":1,\"source\":1,\"start\":15,\"end\":16,\"codepoint\":97,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":330.75,\"right\":350.359375,\"top\":-2756.984375,\"bottom\":-2718.984375}]},{\"node\":1,\"source\":1,\"start\":16,\"end\":17,\"codepoint\":108,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":350.359375,\"right\":359.25,\"top\":-2756.984375,\"bottom\":-2718.984375}]},{\"node\":1,\"source\":1,\"start\":17,\"end\":18,\"codepoint\":111,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":359.25,\"right\":378.828125,\"top\":-2756.984375,\"bottom\":-2718.984375}]},{\"node\":1,\"source\":1,\"start\":18,\"end\":19,\"codepoint\":103,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":378.828125,\"right\":399.140625,\"top\":-2756.984375,\"bottom\":-2718.984375}]},{\"node\":2,\"source\":2,\"start\":0,\"end\":1,\"codepoint\":80,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":410.328125,\"right\":429.0625,\"top\":-2756.984375,\"bottom\":-2718.984375}]},{\"node\":2,\"source\":2,\"start\":1,\"end\":2,\"codepoint\":117,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":429.0625,\"right\":449.34375,\"top\":-2756.984375,\"bottom\":-2718.984375}]},{\"node\":2,\"source\":2,\"start\":2,\"end\":3,\"codepoint\":98,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":449.34375,\"right\":469.65625,\"top\":-2756.984375,\"bottom\":-2718.984375}]},{\"node\":2,\"source\":2,\"start\":3,\"end\":4,\"codepoint\":108,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":469.65625,\"right\":478.546875,\"top\":-2756.984375,\"bottom\":-2718.984375}]},{\"node\":2,\"source\":2,\"start\":4,\"end\":5,\"codepoint\":105,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":478.546875,\"right\":487.4375,\"top\":-2756.984375,\"bottom\":-2718.984375}]},{\"node\":2,\"source\":2,\"start\":5,\"end\":6,\"codepoint\":99,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":281,\"right\":298.59375,\"top\":-2699.390625,\"bottom\":-2661.390625}]},{\"node\":2,\"source\":2,\"start\":6,\"end\":7,\"codepoint\":32,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":298.59375,\"right\":308.765625,\"top\":-2699.390625,\"bottom\":-2661.390625}]},{\"node\":2,\"source\":2,\"start\":7,\"end\":8,\"codepoint\":115,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":308.765625,\"right\":325.4375,\"top\":-2699.390625,\"bottom\":-2661.390625}]},{\"node\":2,\"source\":2,\"start\":8,\"end\":9,\"codepoint\":116,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":325.4375,\"right\":337.984375,\"top\":-2699.390625,\"bottom\":-2661.390625}]},{\"node\":2,\"source\":2,\"start\":9,\"end\":10,\"codepoint\":101,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":337.984375,\"right\":357.671875,\"top\":-2699.390625,\"bottom\":-2661.390625}]},{\"node\":2,\"source\":2,\"start\":10,\"end\":11,\"codepoint\":101,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":357.671875,\"right\":377.359375,\"top\":-2699.390625,\"bottom\":-2661.390625}]},{\"node\":2,\"source\":2,\"start\":11,\"end\":12,\"codepoint\":108,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":377.359375,\"right\":386.25,\"top\":-2699.390625,\"bottom\":-2661.390625}]},{\"node\":2,\"source\":2,\"start\":12,\"end\":13,\"codepoint\":32,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":386.25,\"right\":396.421875,\"top\":-2699.390625,\"bottom\":-2661.390625}]},{\"node\":2,\"source\":2,\"start\":13,\"end\":14,\"codepoint\":98,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":396.421875,\"right\":416.734375,\"top\":-2699.390625,\"bottom\":-2661.390625}]},{\"node\":2,\"source\":2,\"start\":14,\"end\":15,\"codepoint\":111,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":416.734375,\"right\":436.3125,\"top\":-2699.390625,\"bottom\":-2661.390625}]},{\"node\":2,\"source\":2,\"start\":15,\"end\":16,\"codepoint\":108,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":436.3125,\"right\":445.203125,\"top\":-2699.390625,\"bottom\":-2661.390625}]},{\"node\":2,\"source\":2,\"start\":16,\"end\":17,\"codepoint\":116,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":445.203125,\"right\":457.75,\"top\":-2699.390625,\"bottom\":-2661.390625}]},{\"node\":2,\"source\":2,\"start\":17,\"end\":18,\"codepoint\":32,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":457.75,\"right\":467.921875,\"top\":-2699.390625,\"bottom\":-2661.390625}]},{\"node\":2,\"source\":2,\"start\":18,\"end\":19,\"codepoint\":102,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":281,\"right\":292.265625,\"top\":-2641.796875,\"bottom\":-2603.796875}]},{\"node\":2,\"source\":2,\"start\":19,\"end\":20,\"codepoint\":111,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":292.265625,\"right\":311.84375,\"top\":-2641.796875,\"bottom\":-2603.796875}]},{\"node\":2,\"source\":2,\"start\":20,\"end\":21,\"codepoint\":114,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":311.84375,\"right\":325,\"top\":-2641.796875,\"bottom\":-2603.796875}]},{\"node\":2,\"source\":2,\"start\":21,\"end\":22,\"codepoint\":32,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":325,\"right\":335.171875,\"top\":-2641.796875,\"bottom\":-2603.796875}]},{\"node\":2,\"source\":2,\"start\":22,\"end\":23,\"codepoint\":119,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":335.171875,\"right\":361.34375,\"top\":-2641.796875,\"bottom\":-2603.796875}]},{\"node\":2,\"source\":2,\"start\":23,\"end\":24,\"codepoint\":111,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":361.34375,\"right\":380.921875,\"top\":-2641.796875,\"bottom\":-2603.796875}]},{\"node\":2,\"source\":2,\"start\":24,\"end\":25,\"codepoint\":114,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":380.921875,\"right\":394.078125,\"top\":-2641.796875,\"bottom\":-2603.796875}]},{\"node\":2,\"source\":2,\"start\":25,\"end\":26,\"codepoint\":107,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":394.078125,\"right\":412.609375,\"top\":-2641.796875,\"bottom\":-2603.796875}]},{\"node\":2,\"source\":2,\"start\":26,\"end\":27,\"codepoint\":115,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":412.609375,\"right\":429.28125,\"top\":-2641.796875,\"bottom\":-2603.796875}]},{\"node\":2,\"source\":2,\"start\":27,\"end\":28,\"codepoint\":104,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":429.28125,\"right\":449.5625,\"top\":-2641.796875,\"bottom\":-2603.796875}]},{\"node\":2,\"source\":2,\"start\":28,\"end\":29,\"codepoint\":111,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":449.5625,\"right\":469.140625,\"top\":-2641.796875,\"bottom\":-2603.796875}]},{\"node\":2,\"source\":2,\"start\":29,\"end\":30,\"codepoint\":112,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":469.140625,\"right\":489.453125,\"top\":-2641.796875,\"bottom\":-2603.796875}]},{\"node\":2,\"source\":2,\"start\":30,\"end\":31,\"codepoint\":32,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":489.453125,\"right\":499.625,\"top\":-2641.796875,\"bottom\":-2603.796875}]},{\"node\":2,\"source\":2,\"start\":31,\"end\":32,\"codepoint\":97,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":281,\"right\":300.609375,\"top\":-2584.203125,\"bottom\":-2546.203125}]},{\"node\":2,\"source\":2,\"start\":32,\"end\":33,\"codepoint\":115,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":300.609375,\"right\":317.28125,\"top\":-2584.203125,\"bottom\":-2546.203125}]},{\"node\":2,\"source\":2,\"start\":33,\"end\":34,\"codepoint\":115,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":317.28125,\"right\":333.953125,\"top\":-2584.203125,\"bottom\":-2546.203125}]},{\"node\":2,\"source\":2,\"start\":34,\"end\":35,\"codepoint\":101,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":333.953125,\"right\":353.640625,\"top\":-2584.203125,\"bottom\":-2546.203125}]},{\"node\":2,\"source\":2,\"start\":35,\"end\":36,\"codepoint\":109,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":353.640625,\"right\":384.8125,\"top\":-2584.203125,\"bottom\":-2546.203125}]},{\"node\":2,\"source\":2,\"start\":36,\"end\":37,\"codepoint\":98,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":384.8125,\"right\":405.125,\"top\":-2584.203125,\"bottom\":-2546.203125}]},{\"node\":2,\"source\":2,\"start\":37,\"end\":38,\"codepoint\":108,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":405.125,\"right\":414.015625,\"top\":-2584.203125,\"bottom\":-2546.203125}]},{\"node\":2,\"source\":2,\"start\":38,\"end\":39,\"codepoint\":121,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":414.015625,\"right\":428.390625,\"top\":-2584.203125,\"bottom\":-2546.203125}]},{\"node\":2,\"source\":2,\"start\":39,\"end\":40,\"codepoint\":46,\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"rects\":[{\"left\":428.390625,\"right\":438.5625,\"top\":-2584.203125,\"bottom\":-2546.203125}]}],\"styles\":[{\"tag\":\"DEL\",\"display\":\"inline\",\"float\":\"none\",\"direction\":\"ltr\",\"writingMode\":\"horizontal-tb\",\"unicodeBidi\":\"normal\",\"position\":\"static\",\"transform\":\"none\",\"translate\":\"none\",\"rotate\":\"none\",\"scale\":\"none\",\"verticalAlign\":\"baseline\",\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"whiteSpace\":\"pre-wrap\",\"contain\":\"none\",\"clip\":\"auto\",\"clipPath\":\"none\",\"animationName\":\"none\",\"transitionProperty\":\"all\",\"before\":\"none\",\"after\":\"none\"},{\"tag\":\"INS\",\"display\":\"inline\",\"float\":\"none\",\"direction\":\"ltr\",\"writingMode\":\"horizontal-tb\",\"unicodeBidi\":\"normal\",\"position\":\"static\",\"transform\":\"none\",\"translate\":\"none\",\"rotate\":\"none\",\"scale\":\"none\",\"verticalAlign\":\"baseline\",\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"whiteSpace\":\"pre-wrap\",\"contain\":\"none\",\"clip\":\"auto\",\"clipPath\":\"none\",\"animationName\":\"none\",\"transitionProperty\":\"all\",\"before\":\"none\",\"after\":\"none\"},{\"tag\":\"P\",\"display\":\"block\",\"float\":\"none\",\"direction\":\"ltr\",\"writingMode\":\"horizontal-tb\",\"unicodeBidi\":\"isolate\",\"position\":\"static\",\"transform\":\"none\",\"translate\":\"none\",\"rotate\":\"none\",\"scale\":\"none\",\"verticalAlign\":\"baseline\",\"font\":\"32px / 57.6px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"57.6px\",\"whiteSpace\":\"pre-wrap\",\"contain\":\"none\",\"clip\":\"auto\",\"clipPath\":\"none\",\"animationName\":\"none\",\"transitionProperty\":\"all\",\"before\":\"none\",\"after\":\"none\"},{\"tag\":\"DIV\",\"display\":\"block\",\"float\":\"none\",\"direction\":\"ltr\",\"writingMode\":\"horizontal-tb\",\"unicodeBidi\":\"isolate\",\"position\":\"static\",\"transform\":\"none\",\"translate\":\"none\",\"rotate\":\"none\",\"scale\":\"none\",\"verticalAlign\":\"baseline\",\"font\":\"32px / 51.2px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"51.2px\",\"whiteSpace\":\"normal\",\"contain\":\"none\",\"clip\":\"auto\",\"clipPath\":\"none\",\"animationName\":\"none\",\"transitionProperty\":\"all\",\"before\":\"none\",\"after\":\"none\"},{\"tag\":\"ARTICLE\",\"display\":\"block\",\"float\":\"none\",\"direction\":\"ltr\",\"writingMode\":\"horizontal-tb\",\"unicodeBidi\":\"isolate\",\"position\":\"static\",\"transform\":\"none\",\"translate\":\"none\",\"rotate\":\"none\",\"scale\":\"none\",\"verticalAlign\":\"baseline\",\"font\":\"32px / 51.2px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"51.2px\",\"whiteSpace\":\"normal\",\"contain\":\"none\",\"clip\":\"auto\",\"clipPath\":\"none\",\"animationName\":\"none\",\"transitionProperty\":\"all\",\"before\":\"none\",\"after\":\"none\"},{\"tag\":\"DIV\",\"display\":\"block\",\"float\":\"none\",\"direction\":\"ltr\",\"writingMode\":\"horizontal-tb\",\"unicodeBidi\":\"isolate\",\"position\":\"static\",\"transform\":\"none\",\"translate\":\"none\",\"rotate\":\"none\",\"scale\":\"none\",\"verticalAlign\":\"baseline\",\"font\":\"32px / 51.2px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"51.2px\",\"whiteSpace\":\"normal\",\"contain\":\"none\",\"clip\":\"auto\",\"clipPath\":\"none\",\"animationName\":\"none\",\"transitionProperty\":\"all\",\"before\":\"none\",\"after\":\"none\"},{\"tag\":\"SECTION\",\"display\":\"block\",\"float\":\"none\",\"direction\":\"ltr\",\"writingMode\":\"horizontal-tb\",\"unicodeBidi\":\"isolate\",\"position\":\"static\",\"transform\":\"none\",\"translate\":\"none\",\"rotate\":\"none\",\"scale\":\"none\",\"verticalAlign\":\"baseline\",\"font\":\"32px / 51.2px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"51.2px\",\"whiteSpace\":\"normal\",\"contain\":\"none\",\"clip\":\"auto\",\"clipPath\":\"none\",\"animationName\":\"none\",\"transitionProperty\":\"all\",\"before\":\"none\",\"after\":\"none\"},{\"tag\":\"MAIN\",\"display\":\"block\",\"float\":\"none\",\"direction\":\"ltr\",\"writingMode\":\"horizontal-tb\",\"unicodeBidi\":\"isolate\",\"position\":\"static\",\"transform\":\"none\",\"translate\":\"none\",\"rotate\":\"none\",\"scale\":\"none\",\"verticalAlign\":\"baseline\",\"font\":\"32px / 51.2px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"51.2px\",\"whiteSpace\":\"normal\",\"contain\":\"none\",\"clip\":\"auto\",\"clipPath\":\"none\",\"animationName\":\"none\",\"transitionProperty\":\"all\",\"before\":\"none\",\"after\":\"none\"},{\"tag\":\"DIV\",\"display\":\"grid\",\"float\":\"none\",\"direction\":\"ltr\",\"writingMode\":\"horizontal-tb\",\"unicodeBidi\":\"isolate\",\"position\":\"static\",\"transform\":\"none\",\"translate\":\"none\",\"rotate\":\"none\",\"scale\":\"none\",\"verticalAlign\":\"baseline\",\"font\":\"32px / 51.2px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"51.2px\",\"whiteSpace\":\"normal\",\"contain\":\"none\",\"clip\":\"auto\",\"clipPath\":\"none\",\"animationName\":\"none\",\"transitionProperty\":\"all\",\"before\":\"none\",\"after\":\"none\"},{\"tag\":\"BODY\",\"display\":\"block\",\"float\":\"none\",\"direction\":\"ltr\",\"writingMode\":\"horizontal-tb\",\"unicodeBidi\":\"normal\",\"position\":\"static\",\"transform\":\"none\",\"translate\":\"none\",\"rotate\":\"none\",\"scale\":\"none\",\"verticalAlign\":\"baseline\",\"font\":\"32px / 51.2px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"51.2px\",\"whiteSpace\":\"normal\",\"contain\":\"none\",\"clip\":\"auto\",\"clipPath\":\"none\",\"animationName\":\"none\",\"transitionProperty\":\"all\",\"before\":\"none\",\"after\":\"none\"},{\"tag\":\"HTML\",\"display\":\"block\",\"float\":\"none\",\"direction\":\"ltr\",\"writingMode\":\"horizontal-tb\",\"unicodeBidi\":\"normal\",\"position\":\"static\",\"transform\":\"none\",\"translate\":\"none\",\"rotate\":\"none\",\"scale\":\"none\",\"verticalAlign\":\"baseline\",\"font\":\"32px / 51.2px system-ui, -apple-system, \\\"Noto Sans TC\\\", sans-serif\",\"fontSize\":\"32px\",\"lineHeight\":\"51.2px\",\"whiteSpace\":\"normal\",\"contain\":\"none\",\"clip\":\"auto\",\"clipPath\":\"none\",\"animationName\":\"none\",\"transitionProperty\":\"all\",\"before\":\"none\",\"after\":\"none\"}],\"ancestorsSafe\":true,\"noScroll\":true,\"overflowVisible\":true,\"nextBelow\":true,\"documentFits\":true,\"environment\":{\"rootFont\":\"32px\",\"innerWidth\":1280,\"innerHeight\":900,\"scrollX\":0,\"scrollY\":10469}}";
  assert.equal(createHash('sha256').update(recordedJSON).digest('hex'),'f689c91875f1801bb3c1cbf505f9774a54699044d5355da32fa99bc8fa40074b');
  const recorded=JSON.parse(recordedJSON),recordedSafety=classifyHanging(recorded),recordedGeometry=classifyHangingGeometry(recorded);
  assert.equal(recordedSafety.accepted,false,'Historical missing roles/animation fields must not default safe');
  assert.ok(recordedSafety.safetyReasons.some(r=>r.property==='activeAnimations'));
  assert.equal(recordedGeometry.accepted,true,'Exact historical geometry must prove hanging');
  outcomes.push({case:'recorded-geometry',sourceHead:'f16f00ae5fc31d4ba75bf2edd400e83db64adf73',job:'121092990097',snapshotSHA:'f689c91875f1801bb3c1cbf505f9774a54699044d5355da32fa99bc8fa40074b',safety:recordedSafety,geometry:recordedGeometry});
  // Keep the explicit normal case, without forcing native positives to normal.
  await page.setContent(html);await page.addStyleTag({content:'*{unicode-bidi:normal}'});
  await page.locator('[data-diff-field]').evaluate(n=>{n._before=n._after=n.querySelector('p').textContent;});
  const normal=await read();assert.equal(classifyHanging(normal.hanging).accepted,true);
  outcomes.push({case:'explicit-normal',snapshot:normal.hanging,verdict:classifyHanging(normal.hanging)});
  // Product-derived 214px paragraph, 200% root, DEL/INS and block/grid ancestors.
  await page.setContent('<style>html{font-size:32px} .shell{display:grid} p{margin:0;width:214px;font:32px/57.6px system-ui,-apple-system,"Noto Sans TC",sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;max-height:none;overflow:visible}.difference-text del{background:#fcebe7;color:#813323;text-decoration:line-through}.difference-text ins{background:#dff3e7;color:#165937;text-decoration:underline}.difference-text del+ins{margin-inline-start:.35em}[data-diff-field]{min-width:0;overflow-wrap:anywhere}</style><div class="shell"><main><section><div><article><div data-diff-field="fixture"><p class="difference-text"><del>Old generic catalog</del><ins>Public steel bolt for workshop assembly.</ins></p></div><details>evidence</details></article></div></section></main></div>');
  await page.locator('[data-diff-field]').evaluate(n=>{n._before=n.querySelector('del').textContent;n._after=n.querySelector('ins').textContent;});
  const product=await read(),productVerdict=classifyHanging(product.hanging);
  assert.equal(product.originalMatches,true);assert.equal(product.currentMatches,true);
  assert.equal(product.hanging.environment.rootFont,'32px');
  assert.equal(product.hanging.paragraph.right-product.hanging.paragraph.left,214);
  assert.ok(product.hanging.styles.some(s=>s.role==='ancestor'&&s.display==='grid'&&s.unicodeBidi==='isolate'));
  assert.equal(product.hanging.styles.find(s=>s.role==='paragraph').unicodeBidi,'isolate');
  assert.equal(product.hanging.styles.find(s=>s.role==='paragraph').overflowWrap,'anywhere');
  assert.equal(product.hanging.styles.find(s=>s.role==='paragraph').lineHeight,'57.6px');
  assert.equal(parseFloat(product.hanging.styles.find(s=>s.tag==='INS').marginInlineStart),11.2);
  assert.equal(product.fragmentsInside,false,'Product-derived positive must measure actual raw overrun');
  assert.equal(productVerdict.accepted,true,'Product-derived native styles must pass full safety and geometry');
  outcomes.push({case:'product-derived-200',snapshot:product.hanging,verdict:productVerdict});
  await page.locator('.shell').evaluate(n=>{n.style.display='flex';n.style.flexDirection='column';});
  const mobileShell=await read();assert.ok(mobileShell.hanging.styles.some(s=>s.role==='ancestor'&&s.display==='flex'));
  assert.equal(classifyHanging(mobileShell.hanging).accepted,true,'Mobile flex ancestor must retain the same full safety checks');
  outcomes.push({case:'product-derived-flex',snapshot:mobileShell.hanging,verdict:classifyHanging(mobileShell.hanging)});
  await writeDifferenceDiagnostic({case:name+'-hanging-contracts',complete:true,outcomes},name+'-hanging-contracts.json');
 }catch(error){remember(error);throw failure;}finally{await cleanupStep('hanging-contract-context',()=>closeContext(context));requireHealthy();}
}
function measureDifferenceRoots(roots,detailed){return roots.map(root=>{
  const p=root.querySelector('.difference-text'),field=root.dataset.diffField;
  if(!p)return {field,unchanged:root._before===root._after};
  const b=p.getBoundingClientRect(),s=getComputedStyle(p),next=root.nextElementSibling?.getBoundingClientRect();
  const ranges=[...p.childNodes].flatMap((n,source)=>{const r=document.createRange();r.selectNodeContents(n);return [...r.getClientRects()].filter(x=>x.width>0&&x.height>0).map(x=>({source,left:x.left,right:x.right,top:x.top,bottom:x.bottom}));});
  // Document scrolling is expected; non-root clipping ancestors must contain every fragment.
  const ancestors=[];
  for(let a=p.parentElement;a&&a!==document.documentElement;a=a.parentElement){
   const c=getComputedStyle(a),r=a.getBoundingClientRect(),left=r.left+a.clientLeft,top=r.top+a.clientTop;
   const clipX=c.overflowX!=='visible',clipY=c.overflowY!=='visible';
   ancestors.push({tag:a.tagName,id:a.id,overflowX:c.overflowX,overflowY:c.overflowY,
    visible:c.display!=='none'&&c.visibility==='visible'&&Number(c.opacity)>0,
    unsupportedClip:c.clipPath!=='none'||c.clip!=='auto',
    fragmentsInside:ranges.every(x=>(!clipX||(x.left>=left-1&&x.right<=left+a.clientWidth+1))&&(!clipY||(x.top>=top-1&&x.bottom<=top+a.clientHeight+1)))});
  }
  const original=[...p.childNodes].filter(n=>n.nodeName!=='INS').map(n=>n.textContent).join('');
  const current=[...p.childNodes].filter(n=>n.nodeName!=='DEL').map(n=>n.textContent).join('');
  let diagnostic;
  if(detailed){
   const box=r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height});
   const beyond=r=>({left:Math.max(0,b.left-r.left),right:Math.max(0,r.right-b.right),top:Math.max(0,b.top-r.top),bottom:Math.max(0,r.bottom-b.bottom)});
   const outside=r=>r.left<b.left-1||r.right>b.right+1||r.top<b.top-1||r.bottom>b.bottom+1;
   const raw=ranges.map((r,index)=>({index,...r,beyond:beyond(r),outside:outside(r)}));
   const characters=[],nodes=[];
   let nodeIndex=0;
   // Read-only text traversal; offsets count UTF-16 units without splitting surrogate pairs.
   const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);
   for(let n=walker.nextNode();n;n=walker.nextNode()){
    const nodeRange=document.createRange();nodeRange.selectNodeContents(n);
    const nodeRects=[...nodeRange.getClientRects()].filter(r=>r.width>0&&r.height>0);
    const affected=nodeRects.some(outside);
    nodes.push({index:nodeIndex,parent:n.parentElement.tagName,utf16Length:n.data.length,affected,rects:nodeRects.map(r=>({...box(r),beyond:beyond(r)}))});
    if(affected){let offset=0;for(const character of n.data){
     const end=offset+character.length,r=document.createRange();r.setStart(n,offset);r.setEnd(n,end);
     characters.push({node:nodeIndex,start:offset,end,codepoint:character.codePointAt(0),whitespace:/\s/u.test(character),cssSpace:character===' '||character==='\t'||character==='\n'||character==='\r',rects:[...r.getClientRects()].map(x=>({...box(x),beyond:beyond(x),outside:outside(x)}))});
     offset=end;
    }}
    nodeIndex++;
   }
   const clips=[];
   for(let a=p.parentElement;a;a=a.parentElement){const c=getComputedStyle(a),r=a.getBoundingClientRect();clips.push({tag:a.tagName,id:a.id,rect:box(r),client:{left:r.left+a.clientLeft,top:r.top+a.clientTop,width:a.clientWidth,height:a.clientHeight},scroll:{left:a.scrollLeft,top:a.scrollTop,width:a.scrollWidth,height:a.scrollHeight},overflowX:c.overflowX,overflowY:c.overflowY,clip:c.clip,clipPath:c.clipPath,contain:c.contain,visibility:c.visibility,whiteSpace:c.whiteSpace,font:c.font,fontSize:c.fontSize,lineHeight:c.lineHeight});}
   diagnostic={environment:{rootFontSize:getComputedStyle(document.documentElement).fontSize,viewport:{width:innerWidth,height:innerHeight},windowScroll:{x:scrollX,y:scrollY},document:{clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}},paragraph:box(b),style:{whiteSpace:s.whiteSpace,font:s.font,fontSize:s.fontSize,lineHeight:s.lineHeight,overflowX:s.overflowX,overflowY:s.overflowY},raw,offenderCount:raw.filter(r=>r.outside).length,nodes,characters,ancestors:clips};
  }

  let hanging;
  if(detailed==='contract'||ranges.some(r=>r.left<b.left-1||r.right>b.right+1||r.top<b.top-1||r.bottom>b.bottom+1)){
   const rect=r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom});
   const styles=[];let safe=true;
   const seen=new Set([...p.querySelectorAll('*'),p]);for(let a=p.parentElement;a;a=a.parentElement)seen.add(a);
   for(const a of seen){
    const c=getComputedStyle(a),before=getComputedStyle(a,'::before').content,after=getComputedStyle(a,'::after').content;
    const st={role:a===p?'paragraph':p.contains(a)?'inline':'ancestor',tag:a.tagName,display:c.display,float:c.cssFloat,direction:c.direction,writingMode:c.writingMode,unicodeBidi:c.unicodeBidi,position:c.position,transform:c.transform,translate:c.translate,rotate:c.rotate,scale:c.scale,verticalAlign:c.verticalAlign,font:c.font,fontSize:c.fontSize,lineHeight:c.lineHeight,whiteSpace:c.whiteSpace,overflowWrap:c.overflowWrap,marginInlineStart:c.marginInlineStart,contain:c.contain,clip:c.clip,clipPath:c.clipPath,animationName:c.animationName,transitionProperty:c.transitionProperty,before,after};styles.push(st);
    if(c.direction!=='ltr'||c.writingMode!=='horizontal-tb'||!(a!==p&&p.contains(a)?['normal']:['normal','isolate']).includes(c.unicodeBidi)||c.position!=='static'||c.transform!=='none'||c.translate!=='none'||c.rotate!=='none'||c.scale!=='none'||c.animationName!=='none'||c.clipPath!=='none'||c.clip!=='auto'||/paint|strict|content/.test(c.contain)||![before,after].every(x=>x==='none'||x==='normal'))safe=false;
    if(a!==p&&p.contains(a)&&(c.display!=='inline'||c.cssFloat!=='none'))safe=false;
    if((a===p||p.contains(a))&&(c.whiteSpace!=='pre-wrap'||(a!==p&&c.verticalAlign!=='baseline')))safe=false;
   }
   if(p.querySelector('br')||p.getAnimations({subtree:true}).length)safe=false;
   const chars=[],walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let node=0;
   for(let n=walker.nextNode();n;n=walker.nextNode()){
    const c=getComputedStyle(n.parentElement);let offset=0;
    for(const ch of n.data){const r=document.createRange(),end=offset+ch.length;r.setStart(n,offset);r.setEnd(n,end);chars.push({node,source:[...p.childNodes].findIndex(a=>a===n||a.contains(n)),start:offset,end,codepoint:ch.codePointAt(0),font:c.font,fontSize:c.fontSize,lineHeight:c.lineHeight,rects:[...r.getClientRects()].map(rect)});offset=end;}node++;
   }
   hanging={safe,hasBr:!!p.querySelector('br'),activeAnimations:p.getAnimations({subtree:true}).length,text:p.textContent,paragraph:rect(b),raw:ranges,chars,styles,ancestorsSafe:ancestors.every(a=>a.visible&&!a.unsupportedClip&&a.fragmentsInside),noScroll:p.scrollWidth<=p.clientWidth+1&&p.scrollHeight<=p.clientHeight+1,overflowVisible:s.overflowX==='visible'&&s.overflowY==='visible',nextBelow:!!next&&b.bottom<=next.top+1,documentFits:document.documentElement.scrollWidth<=innerWidth,environment:{rootFont:getComputedStyle(document.documentElement).fontSize,innerWidth,innerHeight,scrollX,scrollY}};
  }
  return {field,unchanged:false,...(hanging?{hanging}:{}),...(detailed?{diagnostic}:{}),ancestors,originalMatches:original===root._before,currentMatches:current===root._after,
   fragments:ranges.length,fragmentsInside:ranges.every(r=>r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1),
   scrollHeight:p.scrollHeight,clientHeight:p.clientHeight,scrollWidth:p.scrollWidth,clientWidth:p.clientWidth,
   overflowX:s.overflowX,overflowY:s.overflowY,nextBelow:!!next&&b.bottom<=next.top+1};
 });}
async function completeDifferences(page,label,phase){
 const detailed=label==='chromium-1280-narrow'&&phase==='text200';
 const rows=await page.locator('[data-diff-field]').evaluateAll(measureDifferenceRoots,detailed);
 if(detailed)await writeDifferenceDiagnostic({case:label,phase,complete:true,rows:rows.map(({hanging,...r})=>r)});
 for(const row of rows)if(row.hanging){
  row.hangingVerdict=classifyHanging(row.hanging);
  await writeDifferenceDiagnostic({case:label,phase,field:row.field,complete:true,rawFragmentsInside:row.fragmentsInside,classification:row.hangingVerdict,snapshot:row.hanging},label+'-'+phase+'-'+row.field+'-hanging.json');
 }
 assert.equal(rows.length,3,'All review fields need difference coverage');
 const record={case:label,phase,rootFont:await page.evaluate(()=>getComputedStyle(document.documentElement).fontSize),rows:rows.map(({diagnostic,hanging,hangingVerdict,...row})=>row)};
 await writeFile(evidence+'/'+label+'-difference-'+phase+'.json',JSON.stringify(record));
 for(const r of rows){
  if(r.unchanged)continue;
  assert.equal(r.originalMatches,true,'Difference lost original text: '+r.field);
  assert.equal(r.currentMatches,true,'Difference lost edited text: '+r.field);
  assert.ok(r.fragments>0&&(r.fragmentsInside||r.hangingVerdict?.accepted===true),'Difference text clipped: '+r.field);
  assert.ok(r.ancestors.length>0&&r.ancestors.every(a=>a.visible&&!a.unsupportedClip&&a.fragmentsInside),'Difference clipped by ancestor: '+r.field);
  assert.ok(r.scrollHeight<=r.clientHeight+1&&r.scrollWidth<=r.clientWidth+1,'Difference needs internal scroll: '+r.field);
  assert.equal(r.overflowX,'visible');assert.equal(r.overflowY,'visible');
  assert.equal(r.nextBelow,true,'Difference overlaps following evidence: '+r.field);
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Difference causes document overflow');
 return record;
}

// Focus each following evidence summary, then verify its on-screen hit targets.
async function differenceEvidenceTargets(page,label,phase){
 const rows=[];
 for(const field of ['title','meta_description','description']){
  const selector='[data-diff-field="'+field+'"] + .field-evidence > summary';
  await tabTo(page,selector);
  const row=await page.locator(selector).evaluate(n=>{
   const r=n.getBoundingClientRect(),s=getComputedStyle(n),points=[[r.left+2,r.top+2],[r.right-2,r.top+2],[r.left+2,r.bottom-2],[r.right-2,r.bottom-2],[r.left+r.width/2,r.top+r.height/2]];
   const tolerance=1,overflowPx={left:Math.max(0,-r.left),right:Math.max(0,r.right-innerWidth),top:Math.max(0,-r.top),bottom:Math.max(0,r.bottom-innerHeight)};
   return {focused:n===document.activeElement,visible:s.visibility==='visible'&&Number(s.opacity)>0,
    box:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},
    viewport:{innerWidth,innerHeight},tolerance,overflowPx,
    insideViewport:r.left>=-tolerance&&r.right<=innerWidth+tolerance&&r.top>=-tolerance&&r.bottom<=innerHeight+tolerance,
    hits:points.map(([x,y])=>n.contains(document.elementFromPoint(x,y)))};
  });
  rows.push({field,...row});
 }
 await writeFile(evidence+'/'+label+'-difference-targets-'+phase+'.json',JSON.stringify({case:label,phase,rows}));
 for(const r of rows){
  const detail=JSON.stringify({field:r.field,box:r.box,viewport:r.viewport,tolerance:r.tolerance,overflowPx:r.overflowPx,hits:r.hits});
  assert.equal(r.focused,true,'Evidence summary not focused: '+detail);
  assert.equal(r.visible,true,'Evidence summary not visible: '+detail);
  assert.equal(r.insideViewport,true,'Evidence summary outside viewport: '+detail);
  assert.ok(r.box.width>4&&r.box.height>=44&&r.hits.every(Boolean),'Evidence summary clipped or covered: '+detail);
 }
}

async function zoomAndPair(page,name,width,variant){
 const before=await page.locator('#field-description').inputValue(),state=await stableShell(page,width);
 await completeDifferences(page,name+'-'+width+'-'+variant,'initial');
 for(const selector of ['#guide-action','#guide-close','#task-toggle'])await tabTo(page,selector);
 if(name==='chromium'&&['normal','narrow','sidebar','text200'].includes(variant))await capturePair(page,'candidate',width,variant==='text200'?'normal':variant,variant==='text200'?32:16);
 if(['normal','narrow','sidebar'].includes(variant)){
  await page.evaluate(()=>document.documentElement.style.fontSize='32px');await stableShell(page,width);
  await completeDifferences(page,name+'-'+width+'-'+variant,'text200');
  if(name==='chromium'&&variant!=='normal')await capturePair(page,'candidate',width,variant,32);
  await assistantGeometry(page,variant,width);
  await page.evaluate(()=>document.documentElement.style.fontSize='16px');await stableShell(page,width);assert.equal(await page.locator('#field-description').inputValue(),before,'Zoom lost edits');
 }
 return state;
}
async function workspaceGeometry(page,variant){
 return page.evaluate(variant=>{
  const root=document.querySelector('#workspace'),grid=root.querySelector('.workspace-grid'),header=root.querySelector('.workspace-header'),r=root.getBoundingClientRect();
  const font=parseFloat(getComputedStyle(document.documentElement).fontSize),type=getComputedStyle(root).containerType;
  return {containerType:type,width:r.width,expectedColumns:type==='normal'||r.width<42*font?1:2,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,headerDirection:getComputedStyle(header).flexDirection,childrenInside:[...grid.children].every(n=>{const b=n.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1;}),fallback:variant==='fallback'};
 },variant);
}
// Same synchronous read supplies both the original overflow assertion and its geometry.
async function freshReadbackLayout(page,identity,caseLabel,browser,width,variant,phase){
 const snapshot=await page.evaluate(()=>{
  const all=[...document.querySelectorAll('*')],limit=1024;
  const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const dimensions=n=>n?{rect:rect(n),clientWidth:n.clientWidth,scrollWidth:n.scrollWidth,clientHeight:n.clientHeight,scrollHeight:n.scrollHeight,scrollLeft:n.scrollLeft,scrollTop:n.scrollTop}:null;
  const root=document.documentElement,body=document.body,workspace=document.getElementById('workspace'),grid=workspace?.querySelector('.workspace-grid');
  const shared={rootFont:{inline:root.style.fontSize,computed:getComputedStyle(root).fontSize},viewport:{innerWidth,innerHeight,clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,scrollX,scrollY},document:dimensions(root),body:dimensions(body),workspace:dimensions(workspace),columns:grid?getComputedStyle(grid).gridTemplateColumns:null,focusId:document.activeElement?.id||null,expanded:all.length<=limit?[...document.querySelectorAll('details')].map((n,index)=>({index,id:n.id,open:n.open})):[]};
  // DOM preorder makes every retained prefix ancestor-closed. Read at most
  // 1024 geometries, even when the document contains more elements.
  const observed=all.slice(0,limit),indices=new Map(observed.map((n,index)=>[n,index])),nodes=[],offenders=[];
  const keys=['display','visibility','position','width','minWidth','maxWidth','height','boxSizing','paddingLeft','paddingRight','marginLeft','marginRight','borderLeftWidth','borderRightWidth','overflowX','overflowY','whiteSpace','overflowWrap','wordBreak','fontSize','fontFamily','lineHeight','flex','flexDirection','flexWrap','gridTemplateColumns','gap','contain','containerType','containerName'];
  for(const [index,n]of observed.entries()){
   const s=getComputedStyle(n),computed=Object.fromEntries(keys.map(key=>[key,s[key]])),box=dimensions(n);
   const outsideViewport=n.getClientRects().length>0&&(box.rect.right>innerWidth+1||box.rect.left< -1),internalOverflow=box.scrollWidth>box.clientWidth+1;
   nodes.push({index,parent:indices.get(n.parentElement)??null,tag:n.tagName,id:n.id,classList:[...n.classList],hidden:n.hidden===true,rectCount:n.getClientRects().length,...box,computed});
   if(outsideViewport||internalOverflow){
    offenders.push({index,outsideViewport,internalOverflow,scrollPolicy:s.overflowX});
   }
  }
  const finalWidth={innerWidth,innerHeight,clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,scrollX,scrollY};
  return {...shared,viewport:finalWidth,overflow:finalWidth.scrollWidth>finalWidth.innerWidth,complete:all.length<=limit,reason:all.length>limit?'element-limit':null,elementCount:all.length,scannedElements:nodes.length,expandedComplete:all.length<=limit,limits:{elements:limit,offenders:limit,encodedBytes:1048576},nodes,offenders};
 });
 const base={source_head:identity.source_head,checkout_sha:identity.checkout_sha,e2e_sha256:identity.e2e_sha256,run:identity.run,attempt:identity.attempt,case:caseLabel,browser,width,variant,phase,expectedInitialRootFont:variant==='text200'?'32px':'16px',sameSynchronousRead:true,...snapshot};
 const flagCounts=rows=>({outside:rows.filter(n=>n.outsideViewport).length,internal:rows.filter(n=>n.internalOverflow).length,both:rows.filter(n=>n.outsideViewport&&n.internalOverflow).length,unique:rows.length});
 const seen=snapshot.nodes.length,seenFlags=flagCounts(snapshot.offenders);
 const makeRecord=(kept,reason,originalEncodedBytes=null)=>{
  const nodes=snapshot.nodes.slice(0,kept),offenders=snapshot.offenders.filter(n=>n.index<kept);
  const graphIntegrity={ancestorClosed:nodes.every((n,index)=>n.index===index&&(index===0?n.parent===null:Number.isInteger(n.parent)&&n.parent>=0&&n.parent<index)),offendersResolvable:new Set(offenders.map(n=>n.index)).size===offenders.length&&offenders.every(n=>Number.isInteger(n.index)&&n.index>=0&&n.index<kept&&(n.outsideViewport||n.internalOverflow))};
  const graphValid=graphIntegrity.ancestorClosed&&graphIntegrity.offendersResolvable,complete=snapshot.complete&&kept===seen&&!reason&&graphValid;
  return {...base,complete,reason:graphValid?reason:'graph-integrity',graphIntegrity,nodes,offenders,limitBytes:MiB,encodedBytes:0,originalEncodedBytes,
   originalEncodedBytesReason:snapshot.complete?null:'not-measured: element limit left unscanned geometry',
   counts:{total:snapshot.elementCount,seen,kept,omitted:{observedNotRetained:seen-kept,notScanned:snapshot.elementCount-seen},flags:{seenScope:snapshot.complete?'full-graph':'observed-prefix',seen:seenFlags,keptScope:complete?'full-graph':'retained-prefix',kept:flagCounts(offenders),unscanned:snapshot.elementCount>seen?'not-measured':'none'}}};
 };
 // Include the size fields themselves. This bounded, in-memory serialization
 // neither resamples the DOM nor writes speculative files to find a fit.
 const sizeRecord=(record,measureOriginal=false)=>{
  for(let i=0;i<8;i++){
   const bytes=Buffer.byteLength(JSON.stringify(record));
   if(record.encodedBytes===bytes&&(!measureOriginal||record.originalEncodedBytes===bytes))return record;
   record.encodedBytes=bytes;if(measureOriginal)record.originalEncodedBytes=bytes;
  }
  throw Error('Geometry encoded-size metadata did not converge');
 };
 const full=sizeRecord(makeRecord(seen,snapshot.reason),snapshot.complete);
 if(full.encodedBytes<=MiB)return finalFreshLayoutEncoding(full).record;
 const reason=snapshot.complete?'encoded-geometry-limit':'element-and-encoded-geometry-limit';
 const originalBytes=snapshot.complete?full.encodedBytes:null;
 let low=0,high=seen,best=sizeRecord(makeRecord(0,reason,originalBytes));
 // Keep whole nodes and their original computed fields, with matching offender
 // references. Every candidate is a prefix of this one already-read snapshot.
 while(low<=high){
  const middle=Math.floor((low+high)/2),candidate=sizeRecord(makeRecord(middle,reason,originalBytes));
  if(candidate.encodedBytes<=MiB){best=candidate;low=middle+1;}else high=middle-1;
 }
 if(best.encodedBytes>MiB){
  // Even shared metadata cannot fit. Disclose its omission, retain identity,
  // viewport and counts, and let the existing incomplete guard stop the run.
  const retain=['source_head','checkout_sha','e2e_sha256','run','attempt','case','browser','width','variant','phase','expectedInitialRootFont','sameSynchronousRead','complete','reason','graphIntegrity','nodes','offenders','limitBytes','encodedBytes','originalEncodedBytes','originalEncodedBytesReason','counts','elementCount','scannedElements','limits','viewport','rootFont','overflow'];
  best=sizeRecord({...Object.fromEntries(retain.map(key=>[key,best[key]])),reason:'encoded-geometry-metadata-limit',omittedSharedFields:Object.keys(best).filter(key=>!retain.includes(key))});
 }
 return finalFreshLayoutEncoding(best).record;
}
function finalFreshLayoutEncoding(record){
 const encoded=JSON.stringify(record),bytes=Buffer.byteLength(encoded);
 if(bytes<=MiB)return {record,encoded,rejected:false};
 // Never write/project an oversized geometry, including reduced metadata.
 // This fixed-shape summary omits the geometry and bounds every copied string.
 const text=value=>typeof value==='string'?value.slice(0,160):null;
 const number=value=>Number.isFinite(value)?value:null;
 const identityKeys=['source_head','checkout_sha','e2e_sha256','run','attempt','case','browser','variant','phase'];
 const summary={...Object.fromEntries(identityKeys.map(key=>[key,text(record[key])])),width:number(record.width),sameSynchronousRead:record.sameSynchronousRead===true,complete:false,reason:'final-encoded-geometry-limit',geometryOmitted:true,omittedScope:'all nodes, offenders and shared geometry metadata',identityTruncated:identityKeys.some(key=>typeof record[key]==='string'&&record[key].length>160),rejectedEncodedBytes:bytes,limitBytes:MiB,encodedBytes:0,originalEncodedBytes:number(record.originalEncodedBytes),originalEncodedBytesReason:text(record.originalEncodedBytesReason),elementCount:number(record.elementCount),seen:number(record.counts?.seen),kept:0,omitted:{observedNotRetained:number(record.counts?.seen),notScanned:number(record.counts?.omitted?.notScanned)},flagsScope:'omitted; no unobserved flags inferred',overflow:typeof record.overflow==='boolean'?record.overflow:null,nodes:[],offenders:[]};
 let summaryEncoded;
 for(let i=0;i<8;i++){
  summaryEncoded=JSON.stringify(summary);const size=Buffer.byteLength(summaryEncoded);
  if(size===summary.encodedBytes)break;summary.encodedBytes=size;
 }
 summaryEncoded=JSON.stringify(summary);
 assert.equal(Buffer.byteLength(summaryEncoded),summary.encodedBytes,'Final incomplete summary size must converge');
 assert.ok(Buffer.byteLength(summaryEncoded)<=MiB,'Even bounded incomplete summary exceeds geometry limit');
 return {record:summary,encoded:summaryEncoded,rejected:true};
}
async function persistFreshLayout(record,isFailure=false){
 const path='fresh-readback-layout-'+record.case+'.json';assert.equal(category(path),'normal');
 const admission=finalFreshLayoutEncoding(record);
 if(!budgetFiles.has(path))await writeFile(evidence+'/'+path,admission.encoded);
 // Recheck after the await, immediately before any complete sealed-log record.
 const projection=finalFreshLayoutEncoding(admission.record);record=projection.record;
 if(isFailure||record.overflow||!record.complete)emit({fresh_readback_layout:record});
 else emit({fresh_readback_layout_summary:{case:record.case,phase:record.phase,complete:record.complete,viewport:record.viewport,rootFont:record.rootFont,elementCount:record.elementCount,offenderCount:record.offenders.length,counts:record.counts,encodedBytes:record.encodedBytes,originalEncodedBytes:record.originalEncodedBytes,full_geometry_file:path,full_geometry_in_log:false}});
 assert.equal(admission.rejected||projection.rejected,false,'Final geometry encoding exceeded 1MiB; only bounded incomplete summary retained');
}
function freshReadbackError(error,phase,caseLabel){
 // Preserve the original Error in memory; never put payloads, URLs or tokens in new logs.
 const scalar=value=>typeof value==='boolean'||typeof value==='number';
 const safeAssertion=error.name==='AssertionError'&&scalar(error.actual)&&scalar(error.expected);
 const frames=[...String(error.stack||'').matchAll(/product-workspace\.e2e\.mjs:(\d+):(\d+)/g)].map(m=>({file:'delivery/web-preview/product-workspace.e2e.mjs',line:Number(m[1]),column:Number(m[2])}));
 return {case:caseLabel,phase,name:error.name,message:safeAssertion?String(error.message):'Message details omitted from added evidence to protect payloads and credentials',messageOmitted:!safeAssertion,assertion:safeAssertion?{actual:error.actual,expected:error.expected,operator:error.operator}:null,sourceFrames:frames,stackScope:'only this public E2E source file; excludes URL/query/fragment and other frames',originalFirstErrorRetained:true};
}

const selected=(process.env.PRODUCT_UI_ENGINES||'chromium,firefox,webkit').split(',');
assert.ok(selected.length&&selected.every(n=>['chromium','firefox','webkit'].includes(n)));
for(const [name,engine] of Object.entries({chromium,firefox,webkit}).filter(([name])=>selected.includes(name))){
 const browser=await engine.launch(name==='chromium'&&process.env.PRODUCT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PRODUCT_CHROMIUM_EXECUTABLE_PATH}:{});
 liveBrowsers.add(browser);
 await writeFile(evidence+'/'+name+'-runtime.json',JSON.stringify({browser:name,version:browser.version(),node:process.version,playwright_module:process.env.PRODUCT_UI_PLAYWRIGHT_MODULE||'lockfile:playwright',executable:name==='chromium'&&process.env.PRODUCT_CHROMIUM_EXECUTABLE_PATH?process.env.PRODUCT_CHROMIUM_EXECUTABLE_PATH:engine.executablePath(),playwright_version:playwrightVersion,package_json_sha256:createHash('sha256').update(packageBytes).digest('hex'),platform:process.platform,arch:process.arch,keyboard_navigation:process.platform==='darwin'&&name==='webkit'?'Option+Tab / Shift+Option+Tab':'Tab / Shift+Tab'},null,2));
 emit({candidate_runtime:{browser:name,version:browser.version(),node:process.version,platform:process.platform,arch:process.arch,playwright:playwrightVersion,head:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT}});
 try{await hangingContracts(browser,name);for(const width of [1280,390,320]){for(const variant of width===1280?['normal','narrow','text200','fallback','sidebar']:['normal','text200','fallback']){
  const label=name+'-'+width+'-'+variant;if(process.env.PRODUCT_UI_CASE&&process.env.PRODUCT_UI_CASE!==label)continue;const report=fixtureReport;
  const consoleRoute=variant==='normal'?'growth-console.html':'growth-console-'+variant+'.html';
  const workspaceRoute=variant==='normal'?'workspace.html':'workspace-'+variant+'.html';
  const service=await startTestService({directory,report,storePath:owned+'/'+label+'-store.json'});liveServices.add(service);
  let context;
  try{
   context=ownContext(await browser.newContext({viewport:{width,height:900}}));
   await context.route('**/*',route=>new URL(route.request().url()).origin===service.origin?route.continue():route.abort('blockedbyclient'));
   const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-24T08:00:00Z'));
   page.on('dialog',dialog=>dialog.type()==='beforeunload'?dialog.accept():dialog.dismiss());
   await page.goto(service.origin+'/'+consoleRoute);
   await page.fill('#source-url',report.snapshot.original_url);await page.click('#source-submit');
   await page.locator('#result-panel').waitFor({state:'visible'});
   const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('.comparison')).gridTemplateColumns.split(' ').length,rootFont:getComputedStyle(document.documentElement).fontSize,mainWidth:document.querySelector('main').getBoundingClientRect().width,containerType:getComputedStyle(document.querySelector('#result-panel')).containerType,nav:!!document.querySelector('#site-nav').getBoundingClientRect().width,toggle:!!document.querySelector('#nav-toggle').getBoundingClientRect().width}));
   assert.equal(layout.overflow,false);assert.ok(layout.nav||layout.toggle);
   if(variant==='text200')assert.equal(layout.rootFont,'32px');
   if(variant==='narrow')assert.equal(layout.mainWidth,360);
   if(variant==='fallback')assert.equal(layout.containerType,'normal');
   if(['narrow','text200','fallback'].includes(variant))assert.equal(layout.columns,1);
   if(width<768)await page.click('#guide-toggle');
   const shell=await zoomAndPair(page,name,width,variant);
   const assistant=await assistantGeometry(page,variant,width);
   if(variant==='sidebar')assert.equal(await page.locator('.rail').evaluate(n=>n.getBoundingClientRect().width),224);
   await screenshot(page,evidence+'/'+label+'-console.png');
   // From the loaded result onward, edit and recheck through actual keyboard input.
   await tabTo(page,'#field-description');await page.keyboard.press(process.platform==='darwin'?'Meta+A':'Control+A');await page.keyboard.type('Made of steel.');
   assert.equal(await page.locator('#field-description').inputValue(),'Made of steel.');
   await tabTo(page,'#claim-recheck');await page.keyboard.press('Enter');
   await completeDifferences(page,label,'edited');
   await differenceEvidenceTargets(page,label,'edited');
   if(['normal','narrow','sidebar'].includes(variant)){
    const edited=await page.locator('#field-description').inputValue();
    await page.evaluate(()=>document.documentElement.style.fontSize='32px');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).fontSize),'32px');
    await stableShell(page,width);
    await completeDifferences(page,label,'edited-text200');
    await differenceEvidenceTargets(page,label,'edited-text200');
    assert.equal(await page.locator('#field-description').inputValue(),edited,'Zoom lost edited text');
    await page.evaluate(()=>document.documentElement.style.fontSize='16px');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).fontSize),'16px');
    await stableShell(page,width);
    await completeDifferences(page,label,'edited-restored');
    await differenceEvidenceTargets(page,label,'edited-restored');
    assert.equal(await page.locator('#field-description').inputValue(),edited,'Restoring font lost edited text');
   }
   await tabTo(page,'#field-description');await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'check-description','Description check must follow editor');
   await visibleKeyboardFocus(page,'#check-description');
   await page.keyboard.press('Tab');
   assert.equal(await page.locator('[data-diff-field="description"] + .field-evidence > summary').evaluate(n=>n===document.activeElement),true,'Description evidence must be reachable without an inner scroll trap');
   await visibleKeyboardFocus(page,'[data-diff-field="description"] + .field-evidence > summary');
   await page.keyboard.press('Enter');
   assert.equal(await page.locator('[data-diff-field="description"] + .field-evidence').evaluate(n=>n.open),true);
   await page.keyboard.press('Enter');
   assert.equal(await page.locator('[data-diff-field="description"] + .field-evidence').evaluate(n=>n.open),false);
   assert.equal(await page.locator('[data-diff-field=description]').evaluate(n=>n._after),'Made of steel.');
   assert.ok(await page.locator('[data-diff-field=description] ins').textContent());
   assert.ok(await page.locator('[data-diff-field=description] ins').evaluate(n=>parseFloat(getComputedStyle(n).marginInlineStart)>0),'Changes run together');
   assert.equal(await page.locator('.field-evidence[open]').count(),0);
   await tabTo(page,'#result-fields > :first-child .field-evidence > summary');await page.keyboard.press('Enter');
   assert.equal(await page.locator('.field-evidence[open]').count(),1);
   assert.equal(await page.locator('.field-evidence').first().getAttribute('open')!==null,true);
   await assistantGeometry(page,variant,width);
   await screenshot(page,evidence+'/'+label+'-differences.png');
   await page.keyboard.press('Enter');
   for(const key of ['title','meta_description','description']){
    await tabTo(page,'#check-'+key);await page.keyboard.press('Space');
   }
   await writeFile(evidence+'/'+label+'-preconfirm.json',JSON.stringify(await page.evaluate(()=>({html:document.querySelector('#result-panel').outerHTML,confirmDisabled:document.querySelector('#review-confirm').disabled,checks:[...document.querySelectorAll('.fact-check input')].map(n=>({id:n.id,checked:n.checked,disabled:n.disabled})),claim:document.querySelector('#claim-status').textContent,focused:document.activeElement.outerHTML})),null,2));
   await page.locator('#review-confirm').waitFor({state:'visible'});
   await page.waitForFunction(()=>!document.querySelector('#review-confirm').disabled);
   await tabTo(page,'#review-confirm');await page.keyboard.press('Enter');
   await page.waitForFunction(()=>!document.querySelector('#workspace-handoff').disabled);
   if(width<768){
    await page.click('#nav-toggle');await tabTo(page,'[data-view="sources"]');await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'main');
    await page.click('#nav-toggle');await page.click('[data-view="result"]');
   }
   await tabTo(page,'#workspace-handoff');
   const popupEvent=context.waitForEvent('page');await page.keyboard.press('Enter');
   const popup=await popupEvent;await popup.waitForLoadState();await bounded(popup.close(),'Popup close');
   assert.equal(service.requests.some(r=>r.method==='POST'),false);
   const workspace=await context.newPage();
   await workspace.goto(service.origin+'/'+workspaceRoute+'#access_token='+service.session()+'&token_type=bearer&expires_in=3600');
   await workspace.waitForFunction(()=>document.querySelector('#save-url-result')?.disabled===false);
   assert.equal(await workspace.evaluate(()=>document.activeElement.textContent),'URL 成果 · 保存為待審草稿');
   await workspace.waitForFunction(()=>document.querySelector('#ux-guide-action').getAttribute('href')==='#save-url-result');
   await tabTo(workspace,'#ux-guide-action');await workspace.keyboard.press('Enter');
   assert.equal(await workspace.evaluate(()=>document.activeElement.id),'save-url-result');
   assert.equal(service.requests.some(r=>r.method==='POST'),false);
   await tabTo(workspace,'#url-result-panel select');await workspace.keyboard.press('ArrowDown');await workspace.keyboard.press('Enter');
   assert.equal(await workspace.locator('#url-result-panel select').evaluate(n=>n===document.activeElement),true);
   await tabTo(workspace,'#save-url-result');await workspace.keyboard.press('Enter');
   await workspace.waitForFunction(()=>document.querySelector('#url-save-feedback').textContent.includes('已保存第'));
   const first=service.snapshot().versions[0];assert.equal(first.first_result_payload.preview.fields.description.suggested,'Made of steel.');
   const firstPayload=canonical(first.first_result_payload);
   const versionSelector='.typed-version[data-version-id="'+first.id+'"] .typed-loader';
   await workspace.locator(versionSelector+' > summary').click();
   await workspace.locator(versionSelector+' .resume-review').waitFor();
   await tabTo(workspace,versionSelector+' .resume-review');await workspace.keyboard.press('Enter');
   await workspace.locator(versionSelector+' textarea[data-field="description"]').fill('Public steel bolt.');
   for(const key of ['title','meta_description','description']){
    const selector=versionSelector+' [data-check="'+key+'"]';
    if(!await workspace.locator(selector).isChecked()){await tabTo(workspace,selector);await workspace.keyboard.press('Space');}
   }
   await tabTo(workspace,versionSelector+' .resume-confirm');await workspace.keyboard.press('Enter');
   await workspace.waitForFunction(s=>!document.querySelector(s).disabled,versionSelector+' .resume-prepare');
   await tabTo(workspace,versionSelector+' .resume-prepare');await workspace.keyboard.press('Enter');
   await workspace.waitForFunction(s=>!document.querySelector(s).disabled,versionSelector+' .resume-save');
   await tabTo(workspace,versionSelector+' .resume-save');await workspace.keyboard.press('Enter');
   await workspace.locator(versionSelector+' .resume-saved-result .typed-draft').waitFor();
   const saved=service.snapshot().versions.at(-1);
   assert.equal(saved.version_number,2);assert.equal(saved.opportunity_id,first.opportunity_id);
   assert.equal(saved.first_result_payload.preview.fields.description.suggested,'Public steel bolt.');
   assert.equal(canonical(service.snapshot().versions[0].first_result_payload),firstPayload);
   assert.equal(canonical(saved.first_result_payload.snapshot),canonical(first.first_result_payload.snapshot));
   await workspace.click('#sign-out');await closeContext(context);context=null;
   const fresh=ownContext(await browser.newContext({viewport:{width,height:900}}));
   await fresh.route('**/*',route=>new URL(route.request().url()).origin===service.origin?route.continue():route.abort('blockedbyclient'));
   let restored=null,readbackLayout=null,freshPhase='fresh-readback-content';
   try{
    restored=await fresh.newPage();await restored.goto(service.origin+'/'+workspaceRoute+'#access_token='+service.session()+'&token_type=bearer&expires_in=3600');
    const loader=restored.locator('.typed-version[data-version-id="'+saved.id+'"] .typed-loader');
    await loader.locator(':scope > summary').click();await loader.locator('.typed-draft').waitFor();
    assert.equal(await loader.locator('.ux-saved-original').count(),3);
    for(const key of ['title','meta_description','description'])assert.equal(await loader.locator('.ux-saved-original[data-field="'+key+'"] p').textContent(),saved.first_result_payload.preview.fields[key].original);
    await restored.waitForFunction(()=>document.querySelector('#ux-guide-action').getAttribute('href')==='#opportunities');
    const payload=await loader.locator('pre').evaluateAll(nodes=>nodes.map(n=>{try{return JSON.parse(n.textContent)?.payload;}catch{return null;}}).find(Boolean));
    assert.equal(canonical(payload),canonical(saved.first_result_payload));
    const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
    const payloads={v1_original:JSON.parse(firstPayload),v1_after:service.snapshot().versions[0].first_result_payload,v2_saved:saved.first_result_payload,v2_readback:payload};
    await writeFile(evidence+'/'+label+'-payloads.json',JSON.stringify(payloads,null,2));
    const posts=service.requests.filter(r=>r.method==='POST');assert.equal(posts.length,2);
    assert.equal(new Set(posts.map(r=>r.body.p_request_id)).size,2);
    freshPhase='fresh-readback-workspace-geometry';
    const workspaceGeometryResult=await workspaceGeometry(restored,variant);
    assert.equal(workspaceGeometryResult.columns,workspaceGeometryResult.expectedColumns);assert.equal(workspaceGeometryResult.childrenInside,true,'Legacy cards escape workspace');
    assert.equal(workspaceGeometryResult.headerDirection,workspaceGeometryResult.expectedColumns===1?'column':'row');
    if(variant==='fallback')assert.equal(workspaceGeometryResult.containerType,'normal');
    freshPhase='fresh-readback-document-overflow';
    readbackLayout=await freshReadbackLayout(restored,productIdentity,label,name,width,variant,freshPhase);
    assert.equal(readbackLayout.complete,true,'Fresh layout evidence incomplete: '+readbackLayout.reason);
    const overflow=readbackLayout.overflow;assert.equal(overflow,false,'fresh-readback-document-overflow '+JSON.stringify(readbackLayout.viewport));
    await persistFreshLayout(readbackLayout);requireHealthy();
    freshPhase='fresh-readback-screenshot';
    await screenshot(restored,evidence+'/'+label+'-readback.png');
    freshPhase='fresh-readback-layout-assertions';
    const workspaceLayout=await restored.evaluate(()=>({rootFont:getComputedStyle(document.documentElement).fontSize,mainWidth:document.querySelector('main').getBoundingClientRect().width,containerType:getComputedStyle(document.querySelector('#url-result-panel')).containerType}));
    if(variant==='fallback')assert.equal(workspaceLayout.containerType,'normal');
    if(variant==='text200')assert.equal(workspaceLayout.rootFont,'32px');
    if(variant==='narrow')assert.equal(workspaceLayout.mainWidth,360);
    results.push({browser:name,width,variant,console_layout:layout,shell_layout:shell,workspace_layout:workspaceLayout,assistant_geometry:assistant,workspace_geometry:workspaceGeometryResult,selected_uiux:true,source_originals_equal:true,guide_focus:true,synthetic_session:true,workspace_revision:2,original_version_preserved:true,full_payload_equal:true,payload_sha256:Object.fromEntries(Object.entries(payloads).map(([k,v])=>[k,digest(v)])),save_posts:2,overflow});
   }catch(error){
    // Lock the original assertion before any evidence or close can fail.
    remember(error);
    await cleanupStep('fresh-first-error-evidence',async()=>{
     const detail=freshReadbackError(error,freshPhase,label);
     await writeFile(evidence+'/fresh-readback-error-'+label+'.json',JSON.stringify(detail));emit({fresh_readback_error:detail});
    });
    if(restored&&!restored.isClosed()){
     await cleanupStep('fresh-layout-evidence',async()=>{
      if(!readbackLayout)readbackLayout=await freshReadbackLayout(restored,productIdentity,label,name,width,variant,'failure-observation-after-'+freshPhase);
      await persistFreshLayout(readbackLayout,true);
     });
     await cleanupStep('fresh-fault-screenshot',()=>screenshot(restored,evidence+'/fresh-readback-'+label+'.png',true));
    }
    throw failure;
   }finally{await cleanupStep('fresh-context',()=>closeContext(fresh));requireHealthy();}
  }catch(error){
   remember(error);
   await cleanupStep('case-failure-evidence',async()=>{
    const pages=await Promise.all((context?.pages()||[]).map(async p=>({url:p.url().split('#')[0],text:await p.locator('body').innerText({timeout:1500}).catch(()=>'(unavailable)'),focus:await bounded(p.evaluate(()=>({id:document.activeElement.id,tag:document.activeElement.tagName,html:document.activeElement.outerHTML.slice(0,500)})),'Failure focus',1500).catch(()=>null)})));
    await writeFile(evidence+'/'+label+'-failure.json',JSON.stringify({name:failure.name,message:failure.message,pages},null,2));
   });
   for(const [i,p]of(context?.pages()||[]).entries())await cleanupStep('case-failure-screenshot',()=>screenshot(p,evidence+'/'+label+'-failure-'+i+'.png',true));
   throw failure;
  }finally{
   await cleanupStep('case-context',()=>closeContext(context));
   await cleanupStep('case-requests',()=>writeFile(evidence+'/'+label+'-requests.json',JSON.stringify(service.requests,null,2)));
   await cleanupStep('case-keyboard',()=>writeFile(evidence+'/keyboard.json',JSON.stringify(keyboard,null,2)));
   await cleanupStep('case-service',()=>closeService(service));
   requireHealthy();
  }
  await writeFile(evidence+'/results.json',JSON.stringify(results,null,2));
 }}}catch(error){remember(error);throw failure;}finally{await cleanupStep('case-browser',()=>closeBrowser(browser));requireHealthy();}
}
assert.equal(results.length,33);assert.equal(visualPairs.filter(p=>p.kind==='baseline').length,10);assert.equal(visualPairs.filter(p=>p.kind==='candidate').length,10);
await frozenAndSourceGuard();await writeFile(evidence+'/visual-pairs.json',JSON.stringify(visualPairs,null,2));
for(const result of results)emit({product_case_result:result});
emit({product_result:{scope:'synthetic transport/session, not hosted or native zoom',cases:results.length,baseline_pairs:10,visual_review:'BLOCKED_NO_REVIEWER_PIXEL_ACCESS',budget_bytes:await checkBudget()}});
}catch(error){remember(error);await cleanupStep('first-error-evidence',()=>writeFile(evidence+'/first-error.json',JSON.stringify({name:failure.name,message:failure.message})));emit({product_failure:{name:failure.name,message:failure.message}});}
finally{
 for(const context of [...liveContexts].filter(c=>!closingContexts.has(c)))await cleanupStep('final-context',()=>closeContext(context));
 for(const browser of [...liveBrowsers].filter(b=>!closingBrowsers.has(b)))await cleanupStep('final-browser',()=>closeBrowser(browser));
 for(const service of [...liveServices].filter(s=>!closingServices.has(s)))await cleanupStep('final-service',()=>closeService(service));
 if(!liveBrowsers.size&&!liveServices.size&&!liveContexts.size){
  await cleanupStep('owned-temp',async()=>{await bounded(rm(owned,{recursive:true,force:true}),'Owned temp removal');try{await bounded(lstat(owned),'Owned temp readback');throw Error('Owned temp still present');}catch(error){if(error.code!=='ENOENT')throw error;}cleanup.temp='removed-absence-confirmed';});
 }else cleanup.temp='retained-unknown-resource';
 cleanup.remaining={browsers:liveBrowsers.size,services:liveServices.size,contexts:liveContexts.size};
 await cleanupStep('cleanup-evidence',async()=>{await writeFile(evidence+'/cleanup.json',JSON.stringify({...cleanup,first_error:failure?{name:failure.name,message:failure.message}:null},null,2));await checkBudget();});
 emit({product_cleanup:{...cleanup,first_error:failure?{name:failure.name,message:failure.message}:null}});
 if(failure&&!budgetFiles.has('first-error.json')&&!budgetBlocked.has('first-error.json'))await cleanupStep('final-first-error',()=>writeFile(evidence+'/first-error.json',JSON.stringify({name:failure.name,message:failure.message})));
 await cleanupStep('evidence-inventory',()=>{try{finishEvidence();}catch(error){emitInventoryRows();emit({inventory_incomplete:{name:error.name,message:error.message}});throw error;}});
 try{await seal();}catch(error){rememberLogError(error);remember(error);}
}
if(failure||logFailure||budgetErrors.length||cleanup.errors.length||cleanup.temp!=='removed-absence-confirmed')process.exitCode=1;
if(liveBrowsers.size||liveServices.size||liveContexts.size||logFailure)process.exit(1);
