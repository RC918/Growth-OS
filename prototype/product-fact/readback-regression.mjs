// Real UI with deterministic synthetic transport: regression for successful POST + failed readback.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname.slice(1);if(!['product-fact.html','product-fact.mjs','product-fact.css','first-result.css'].includes(path))throw Error();res.setHeader('content-type',path.endsWith('.mjs')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile('apps/web/'+path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
try{for(const width of [1280,390])for(const kind of ['answer','review'])for(const failedRead of ['receipt401','receipt403','receipt409','receipt500','state401','history500']){
 let posts=0,receipts=[],op=null,ack=null,fail=true,forged=false;
 const row={id:'product-a',organization_id:'org-a',name:'合成 A',market:'TW',channel:'website',source_url:'https://fixture.invalid',source_quote:'Synthetic',source_version:1,fact_version:0,answer:'unknown',draft_version:0,review_valid:false};
 if(kind==='review')Object.assign(row,{fact_id:'fact-1',draft_id:'draft-1',fact_version:1,draft_version:1,answer:'yes',body:'合成候選'});
 const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();
 await context.route('**/w1/**',async route=>{const req=route.request(),u=new URL(req.url()),path=u.pathname.slice(4);const send=(status,data)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 if(path==='login')return send(200,{access_token:'synthetic-only'});if(path==='user'||path==='logout')return send(200,{});
 if(path===kind){posts++;op=req.postDataJSON();ack=kind==='answer'?{request_id:op.p_request,fact_id:'fact-1',draft_id:'draft-1',version:1}:{request_id:op.p_request,review_id:'review-1',draft_id:'draft-1'};row.review_valid=kind==='review';Object.assign(row,{fact_id:'fact-1',draft_id:'draft-1',fact_version:1,draft_version:1,answer:'yes',body:'合成候選'});return send(200,ack);}
 if(path==='receipt'){receipts.push(u.searchParams.get('request'));if(fail&&failedRead.startsWith('receipt'))return send(Number(failedRead.slice(7)),{});return send(200,{request_id:op.p_request,organization_id:'org-a',input:{kind,product:'product-a',expected:0,source:1,value:'yes',draft:'draft-1'},result:{...ack,...(forged?{draft_id:'wrong-draft'}:{})}});}
 if(path==='state'){if(op&&fail&&failedRead==='state401')return send(401,{});return send(200,[row]);}
 if(path==='history'){if(op&&fail&&failedRead==='history500')return send(500,{});return send(200,[]);}return send(404,{});
 });
 await page.goto(origin+'/product-fact.html');await page.locator('#login').click();await page.locator('#result').waitFor();if(kind==='answer'){await page.locator('#answer').selectOption('yes');await page.locator('#save').click();}else{await page.locator('#review-check').check();await page.locator('#review').click();}await page.locator('#feedback').filter({hasText:'結果待核對'}).waitFor();assert.equal(posts,1);assert.equal(await page.locator('#save').isDisabled(),true);assert.equal(await page.locator('#reconcile').isVisible(),true);assert.doesNotMatch(await page.locator('#feedback').textContent(),/此操作已拒絕/);
 // Reauthentication keeps the original operation tuple and never replays its POST.
 await page.locator('#logout').click();await page.locator('#login').waitFor();assert.equal(await page.locator('#actor').isDisabled(),true);fail=false;await page.locator('#login').click();await page.locator('#result').waitFor();assert.equal(await page.locator('#save').isDisabled(),true);assert.equal(posts,1);
 forged=true;await page.locator('#reconcile').click();await page.locator('#feedback').filter({hasText:'回條與原操作回覆不一致'}).waitFor();assert.equal(await page.locator('#save').isDisabled(),true);assert.equal(await page.locator('#reconcile').isVisible(),true);
 forged=false;await page.locator('#reconcile').click();await page.locator('#feedback').filter({hasText:kind==='answer'?'已保存答案並建立第 1 版':'此確切版內容已確認'}).waitFor();assert.equal(await page.locator('#reconcile').isVisible(),false);assert.equal(posts,1);assert.ok(receipts.length>=2&&receipts.every(id=>id===op.p_request));await context.close();console.log(`PASS ${width} ${kind} POST200 -> ${failedRead}: pending retained, logout/login GET-only, mismatched receipt blocked, exact receipt recovers; one POST`);
 }}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
