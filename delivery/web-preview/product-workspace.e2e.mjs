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
 try{const bytes=Buffer.from(JSON.stringify(value)+'\n');logBytes+=bytes.length;logHash.update(bytes);
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
const budgetMode='encoded PNG admission before disk write; stat/SHA256 readback; fixed pools';
const budgetHash=bytes=>createHash('sha256').update(bytes).digest('hex');
function category(name){
 if(name.startsWith('fault-')&&name.endsWith('.png'))return 'fault';
 if(name==='first-null.json'||name.includes('first-error')||name.includes('failure')||name.includes('error'))return 'error';
 if(name==='lifecycle.json'||name==='cleanup.json'||name==='final-status.json')return 'cleanup';
 if(name==='inventory.json'||name==='budget-status.json'||name==='evidence-owner.json'||name==='identity.json'||name==='runtime.json'||name.endsWith('-runtime.json')||name==='fixture-identity.json')return 'metadata';
 return 'normal';
}
function totals(){const out=Object.fromEntries(Object.keys(budgetLimits).map(k=>[k,0]));for(const row of budgetFiles.values())out[row.category]+=row.bytes;return out;}
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
async function zoomAndPair(page,name,width,variant){
 const before=await page.locator('#field-description').inputValue(),state=await stableShell(page,width);
 for(const selector of ['#guide-action','#guide-close','#task-toggle'])await tabTo(page,selector);
 if(name==='chromium'&&['normal','narrow','sidebar','text200'].includes(variant))await capturePair(page,'candidate',width,variant==='text200'?'normal':variant,variant==='text200'?32:16);
 if(['normal','narrow','sidebar'].includes(variant)){
  await page.evaluate(()=>document.documentElement.style.fontSize='32px');await stableShell(page,width);
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
  const all=[...document.querySelectorAll('*')],limit=1024,offenderLimit=128;
  const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const dimensions=n=>n?{rect:rect(n),clientWidth:n.clientWidth,scrollWidth:n.scrollWidth,clientHeight:n.clientHeight,scrollHeight:n.scrollHeight,scrollLeft:n.scrollLeft,scrollTop:n.scrollTop}:null;
  const root=document.documentElement,body=document.body,workspace=document.getElementById('workspace'),grid=workspace?.querySelector('.workspace-grid');
  const shared={rootFont:{inline:root.style.fontSize,computed:getComputedStyle(root).fontSize},viewport:{innerWidth,innerHeight,clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,scrollX,scrollY},document:dimensions(root),body:dimensions(body),workspace:dimensions(workspace),columns:grid?getComputedStyle(grid).gridTemplateColumns:null,focusId:document.activeElement?.id||null,expanded:all.length<=limit?[...document.querySelectorAll('details')].map((n,index)=>({index,id:n.id,open:n.open})):[]};
  if(all.length>limit)return {...shared,overflow:root.scrollWidth>innerWidth,complete:false,reason:'element-limit',elementCount:all.length,limits:{elements:limit,offenders:offenderLimit},nodes:[],offenders:[]};
  const indices=new Map(all.map((n,index)=>[n,index])),nodes=[],offenders=[];
  const keys=['display','visibility','position','width','minWidth','maxWidth','height','boxSizing','paddingLeft','paddingRight','marginLeft','marginRight','borderLeftWidth','borderRightWidth','overflowX','overflowY','whiteSpace','overflowWrap','wordBreak','fontSize','fontFamily','lineHeight','flex','flexDirection','flexWrap','gridTemplateColumns','gap','contain','containerType','containerName'];
  for(const [index,n]of all.entries()){
   const s=getComputedStyle(n),computed=Object.fromEntries(keys.map(key=>[key,s[key]])),box=dimensions(n);
   const outsideViewport=n.getClientRects().length>0&&(box.rect.right>innerWidth+1||box.rect.left< -1),internalOverflow=box.scrollWidth>box.clientWidth+1;
   nodes.push({index,parent:indices.get(n.parentElement)??null,tag:n.tagName,id:n.id,classList:[...n.classList],hidden:n.hidden===true,rectCount:n.getClientRects().length,...box,computed});
   if(outsideViewport||internalOverflow){
    if(offenders.length===offenderLimit)return {...shared,overflow:root.scrollWidth>innerWidth,complete:false,reason:'offender-limit',elementCount:all.length,scannedElements:index+1,observedOffenders:offenderLimit+1,limits:{elements:limit,offenders:offenderLimit},nodes:[],offenders:[]};
    offenders.push({index,outsideViewport,internalOverflow,scrollPolicy:s.overflowX});
   }
  }
  const finalWidth={innerWidth,innerHeight,clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,scrollX,scrollY};
  return {...shared,viewport:finalWidth,overflow:finalWidth.scrollWidth>finalWidth.innerWidth,complete:true,reason:null,elementCount:all.length,limits:{elements:limit,offenders:offenderLimit},nodes,offenders};
 });
 const record={source_head:identity.source_head,checkout_sha:identity.checkout_sha,e2e_sha256:identity.e2e_sha256,run:identity.run,attempt:identity.attempt,case:caseLabel,browser,width,variant,phase,expectedInitialRootFont:variant==='text200'?'32px':'16px',sameSynchronousRead:true,...snapshot};
 const bytes=Buffer.byteLength(JSON.stringify(record));
 if(bytes>MiB)return {source_head:record.source_head,e2e_sha256:record.e2e_sha256,case:caseLabel,browser,width,variant,phase,sameSynchronousRead:true,complete:false,reason:'encoded-geometry-limit',encodedBytes:bytes,limitBytes:MiB,elementCount:snapshot.elementCount,viewport:snapshot.viewport,rootFont:snapshot.rootFont,overflow:snapshot.overflow};
 return record;
}
async function persistFreshLayout(record,isFailure=false){
 const path='fresh-readback-layout-'+record.case+'.json';assert.equal(category(path),'normal');
 if(!budgetFiles.has(path))await writeFile(evidence+'/'+path,JSON.stringify(record));
 if(isFailure||record.overflow||!record.complete)emit({fresh_readback_layout:record});
 else emit({fresh_readback_layout_summary:{case:record.case,phase:record.phase,complete:record.complete,viewport:record.viewport,rootFont:record.rootFont,elementCount:record.elementCount,offenderCount:record.offenders.length,full_geometry_file:path,full_geometry_in_log:false}});
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
 try{for(const width of [1280,390,320]){for(const variant of width===1280?['normal','narrow','text200','fallback','sidebar']:['normal','text200','fallback']){
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
   await page.fill('#field-description','Made of steel.');await page.click('#claim-recheck');
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
