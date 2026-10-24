// CI acceptance candidate: real product modules, synthetic transport/session.
// Does not establish email Auth, live persistence, RLS or actual mobile devices.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {dirname,join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
// Local acceptance may use the desktop's existing runtime without installing
// packages. CI leaves both overrides unset and uses the repository lockfile.
const playwrightModule=process.env.PRODUCT_UI_PLAYWRIGHT_MODULE||'playwright';
const {chromium,firefox,webkit}=await import(playwrightModule);
const packagePath=isAbsolute(playwrightModule)?join(dirname(playwrightModule),'package.json'):createRequire(import.meta.url).resolve('playwright/package.json');
const packageBytes=await readFile(packagePath),playwrightVersion=JSON.parse(packageBytes).version;
import {buildPreviewAcceptance,startTestService,producerReport} from '../growth-console/persistence-integration.e2e.mjs';
import {canonical} from '../../apps/web/first-result-payload.mjs';
const evidence=process.env.PRODUCT_UI_EVIDENCE||await mkdtemp(tmpdir()+'/gos-product-ui-');
await mkdir(evidence,{recursive:true});
const directory=evidence+'/site';await buildPreviewAcceptance({directory,evidence});
// Presentation-only fixtures in the disposable output; product navigation stays.
// They are not deployment artifacts or browser-native text zoom/legacy engines.
const html=await readFile(directory+'/growth-console.html','utf8'),workspaceHTML=await readFile(directory+'/workspace.html','utf8');
for(const [variant,css] of Object.entries({narrow:'main{width:360px;max-width:100%}',text200:':root{font-size:32px}',fallback:'main>section,.rail section,#workspace,#url-result-panel,.saved-result-review{container-type:normal;container-name:none}'})){
 await writeFile(directory+'/test-'+variant+'.css',css);
 await writeFile(directory+'/growth-console-'+variant+'.html',html.replace('</head>','<link rel="stylesheet" href="./test-'+variant+'.css"></head>'));
 await writeFile(directory+'/workspace-'+variant+'.html',workspaceHTML.replace('</head>','<link rel="stylesheet" href="./test-'+variant+'.css"></head>'));
}
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
  if(state.focused)return;
  keyboard.push({target:selector,key,from:await page.evaluate(()=>({id:document.activeElement.id,tag:document.activeElement.tagName,text:document.activeElement.textContent?.slice(0,100)}))});
  await page.keyboard.press(key);
  const atStart=await start.evaluate(n=>n===document.activeElement);
  if(!atStart)moved=true;
  if(moved&&atStart)throw Error('First complete focus cycle: '+selector);
 }
 throw Error('Keyboard safety bound reached: '+selector);
 }finally{await start.dispose();}
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
  if(variant==='normal')assert.equal(g.natural,false,'Normal desktop changed unnecessarily');
  if(variant==='text200'){assert.equal(g.natural,true);assert.equal(g.position,'static');}
 }
 return g;
}
async function workspaceGeometry(page,variant){
 return page.evaluate(variant=>{
  const root=document.querySelector('#workspace'),grid=root.querySelector('.workspace-grid'),header=root.querySelector('.workspace-header'),r=root.getBoundingClientRect();
  const font=parseFloat(getComputedStyle(document.documentElement).fontSize),type=getComputedStyle(root).containerType;
  return {containerType:type,width:r.width,expectedColumns:type==='normal'||r.width<42*font?1:2,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,headerDirection:getComputedStyle(header).flexDirection,childrenInside:[...grid.children].every(n=>{const b=n.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1;}),fallback:variant==='fallback'};
 },variant);
}
const selected=(process.env.PRODUCT_UI_ENGINES||'chromium,firefox,webkit').split(',');
assert.ok(selected.length&&selected.every(n=>['chromium','firefox','webkit'].includes(n)));
for(const [name,engine] of Object.entries({chromium,firefox,webkit}).filter(([name])=>selected.includes(name))){
 const browser=await engine.launch(name==='chromium'&&process.env.PRODUCT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PRODUCT_CHROMIUM_EXECUTABLE_PATH}:{});
 await writeFile(evidence+'/'+name+'-runtime.json',JSON.stringify({browser:name,version:browser.version(),node:process.version,playwright_module:process.env.PRODUCT_UI_PLAYWRIGHT_MODULE||'lockfile:playwright',executable:name==='chromium'&&process.env.PRODUCT_CHROMIUM_EXECUTABLE_PATH?process.env.PRODUCT_CHROMIUM_EXECUTABLE_PATH:engine.executablePath(),playwright_version:playwrightVersion,package_json_sha256:createHash('sha256').update(packageBytes).digest('hex'),platform:process.platform,arch:process.arch,keyboard_navigation:process.platform==='darwin'&&name==='webkit'?'Option+Tab / Shift+Option+Tab':'Tab / Shift+Tab'},null,2));
 try{for(const width of [1280,390]){for(const variant of width===1280?['normal','narrow','text200','fallback']:['normal','text200','fallback']){
  const label=name+'-'+width+'-'+variant;if(process.env.PRODUCT_UI_CASE&&process.env.PRODUCT_UI_CASE!==label)continue;const report=producerReport();
  const consoleRoute=variant==='normal'?'growth-console.html':'growth-console-'+variant+'.html';
  const workspaceRoute=variant==='normal'?'workspace.html':'workspace-'+variant+'.html';
  const service=await startTestService({directory,report,storePath:evidence+'/'+label+'-store.json'});
  let context;
  try{
   context=await browser.newContext({viewport:{width,height:900}});
   await context.route('**/*',route=>new URL(route.request().url()).origin===service.origin?route.continue():route.abort('blockedbyclient'));
   const page=await context.newPage();
   page.on('dialog',dialog=>dialog.type()==='beforeunload'?dialog.accept():dialog.dismiss());
   await page.goto(service.origin+'/'+consoleRoute);
   await page.fill('#source-url',report.snapshot.original_url);await page.click('#source-submit');
   await page.locator('#result-panel').waitFor({state:'visible'});
   const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('.comparison')).gridTemplateColumns.split(' ').length,rootFont:getComputedStyle(document.documentElement).fontSize,mainWidth:document.querySelector('main').getBoundingClientRect().width,containerType:getComputedStyle(document.querySelector('#result-panel')).containerType,nav:!!document.querySelector('#site-nav').getBoundingClientRect().width,toggle:!!document.querySelector('#nav-toggle').getBoundingClientRect().width}));
   assert.equal(layout.overflow,false);assert.ok(layout.nav||layout.toggle);
   if(variant==='text200')assert.equal(layout.rootFont,'32px');
   if(variant==='narrow')assert.equal(layout.mainWidth,360);
   if(variant==='fallback')assert.equal(layout.containerType,'normal');
   if(variant!=='normal')assert.equal(layout.columns,1);
   const assistant=await assistantGeometry(page,variant,width);
   await page.screenshot({path:evidence+'/'+label+'-console.png',fullPage:true});
   await page.fill('#field-description','Made of steel.');await page.click('#claim-recheck');
   assert.equal(await page.locator('[data-diff-field=description]').evaluate(n=>n._after),'Made of steel.');
   assert.ok(await page.locator('[data-diff-field=description] ins').textContent());
   assert.ok(await page.locator('[data-diff-field=description] ins').evaluate(n=>parseFloat(getComputedStyle(n).marginInlineStart)>0),'Changes run together');
   assert.equal(await page.locator('.field-evidence[open]').count(),0);
   await tabTo(page,'#result-fields > :first-child .field-evidence > summary');await page.keyboard.press('Enter');
   assert.equal(await page.locator('.field-evidence[open]').count(),1);
   assert.equal(await page.locator('.field-evidence').first().getAttribute('open')!==null,true);
   await assistantGeometry(page,variant,width);
   await page.screenshot({path:evidence+'/'+label+'-differences.png',fullPage:true});
   await page.keyboard.press('Enter');
   for(const key of ['title','meta_description','description']){
    await tabTo(page,'#check-'+key);await page.keyboard.press('Space');
   }
   await writeFile(evidence+'/'+label+'-preconfirm.json',JSON.stringify(await page.evaluate(()=>({html:document.querySelector('#result-panel').outerHTML,confirmDisabled:document.querySelector('#review-confirm').disabled,checks:[...document.querySelectorAll('.fact-check input')].map(n=>({id:n.id,checked:n.checked,disabled:n.disabled})),claim:document.querySelector('#claim-status').textContent,focused:document.activeElement.outerHTML})),null,2));
   await page.locator('#review-confirm').waitFor({state:'visible'});
   await page.waitForFunction(()=>!document.querySelector('#review-confirm').disabled);
   await tabTo(page,'#review-confirm');await page.keyboard.press('Enter');
   await page.waitForFunction(()=>!document.querySelector('#workspace-handoff').disabled);
   if(width===390){
    await page.click('#nav-toggle');await tabTo(page,'[data-view="sources"]');await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'main');
    await page.click('#nav-toggle');await page.click('[data-view="result"]');
   }
   await tabTo(page,'#workspace-handoff');
   const popupEvent=context.waitForEvent('page');await page.keyboard.press('Enter');
   const popup=await popupEvent;await popup.waitForLoadState();await popup.close();
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
   await workspace.click('#sign-out');await context.close();context=null;
   const fresh=await browser.newContext({viewport:{width,height:900}});
   await fresh.route('**/*',route=>new URL(route.request().url()).origin===service.origin?route.continue():route.abort('blockedbyclient'));
   try{
    const restored=await fresh.newPage();await restored.goto(service.origin+'/'+workspaceRoute+'#access_token='+service.session()+'&token_type=bearer&expires_in=3600');
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
    const workspaceGeometryResult=await workspaceGeometry(restored,variant);
    assert.equal(workspaceGeometryResult.columns,workspaceGeometryResult.expectedColumns);assert.equal(workspaceGeometryResult.childrenInside,true,'Legacy cards escape workspace');
    assert.equal(workspaceGeometryResult.headerDirection,workspaceGeometryResult.expectedColumns===1?'column':'row');
    if(variant==='fallback')assert.equal(workspaceGeometryResult.containerType,'normal');
    const overflow=await restored.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
    await restored.screenshot({path:evidence+'/'+label+'-readback.png',fullPage:true});
    const workspaceLayout=await restored.evaluate(()=>({rootFont:getComputedStyle(document.documentElement).fontSize,mainWidth:document.querySelector('main').getBoundingClientRect().width,containerType:getComputedStyle(document.querySelector('#url-result-panel')).containerType}));
    if(variant==='fallback')assert.equal(workspaceLayout.containerType,'normal');
    if(variant==='text200')assert.equal(workspaceLayout.rootFont,'32px');
    if(variant==='narrow')assert.equal(workspaceLayout.mainWidth,360);
    results.push({browser:name,width,variant,console_layout:layout,workspace_layout:workspaceLayout,assistant_geometry:assistant,workspace_geometry:workspaceGeometryResult,selected_uiux:true,source_originals_equal:true,guide_focus:true,synthetic_session:true,workspace_revision:2,original_version_preserved:true,full_payload_equal:true,payload_sha256:Object.fromEntries(Object.entries(payloads).map(([k,v])=>[k,digest(v)])),save_posts:2,overflow});
   }finally{await fresh.close();}
  }catch(error){
   await writeFile(evidence+'/'+label+'-failure.json',JSON.stringify({message:error.message,pages:await Promise.all((context?.pages()||[]).map(async p=>({url:p.url().split('#')[0],text:await p.locator('body').innerText().catch(()=>'(unavailable)'),focus:await p.evaluate(()=>({id:document.activeElement.id,tag:document.activeElement.tagName,html:document.activeElement.outerHTML.slice(0,500)})).catch(()=>null)})))},null,2));
   for(const [i,p]of(context?.pages()||[]).entries())await p.screenshot({path:evidence+'/'+label+'-failure-'+i+'.png',fullPage:true}).catch(()=>{});
   throw error;
  }finally{await context?.close();await writeFile(evidence+'/'+label+'-requests.json',JSON.stringify(service.requests,null,2));await writeFile(evidence+'/keyboard.json',JSON.stringify(keyboard,null,2));await service.close();}
  await writeFile(evidence+'/results.json',JSON.stringify(results,null,2));
 }}}finally{await browser.close();}
}
console.log(JSON.stringify({scope:'Product UI with synthetic transport/session; not hosted acceptance',results}));
