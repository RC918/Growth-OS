// Browser UI acceptance uses a synthetic Auth/Data API transport. Real PostgreSQL
// authorization is separately tested by search_observation_versions_staging.sql.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {preview} from '../../apps/web/search-baseline.mjs';
import {saveSnapshot} from '../../apps/web/baseline-snapshot.mjs';
const orgA='93a88055-0a0b-40c0-b22f-a6d312320001',orgB='93a88055-0a0b-40c0-b22f-a6d312320002';
const origin='http://127.0.0.1:8766';
const meta={origin:'https://shop.example',type:'web',start:'2026-09-01',end:'2026-09-03',exported:'2026-09-07T00:00:00Z'};
const payload=saveSnapshot(preview('date,clicks,impressions\n2026-09-01,2,10',meta),null,{a:true},[{date:'2026-09-04',path:'/product-comparison',note:'Synthetic update'}]);
const server=spawn('python3',['-m','http.server','8766','--bind','127.0.0.1','--directory','apps/web'],{stdio:'ignore'});
let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch(origin+'/workspace.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();
 for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),errors=[],versions=[],saves=[];
  let role='owner',failNext=true,loginSequence=0;
  page.on('pageerror',error=>errors.push(error.message));
  // Observation fixtures have their own synthetic identities and legacy schema.
  await context.route(origin+'/url-result-config.mjs',route=>route.fulfill({contentType:'text/javascript',body:'export const urlSaveEnabled=false;export const urlResultSchemaEnabled=false;export const urlSaveTrial=null;'}));
  await context.route('https://vhzryhibmpvglzcmfnaa.supabase.co/**',async route=>{
   const request=route.request(),url=new URL(request.url()),org=role==='owner'?orgA:orgB;
   const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(url.pathname==='/auth/v1/user')return respond({id:'synthetic-'+role});
   if(url.pathname.endsWith('/organization_members'))return respond([{organization_id:org,role}]);
   if(url.pathname.endsWith('/organizations'))return respond([{id:org,name:'Synthetic workspace'}]);
   if(url.pathname.endsWith('/rpc/save_search_observation')){
    const body=request.postDataJSON();saves.push(body);
    assert.equal(body.p_organization_id,orgA);assert.equal(role,'owner');
    if(failNext){failNext=false;return respond({},503);}
    let saved=versions.find(v=>v.request_id===body.p_request_id);
    if(!saved){saved={id:crypto.randomUUID(),request_id:body.p_request_id,payload:body.p_payload,created_at:new Date().toISOString()};versions.unshift(saved);}
    return respond(saved.id);
   }
   if(url.pathname.endsWith('/search_observation_versions')){
    assert.equal(url.searchParams.get('organization_id'),`eq.${org}`);
    const data=role==='owner'?versions:[];
    return respond(url.searchParams.has('id')?data.filter(v=>`eq.${v.id}`===url.searchParams.get('id')):data.map(v=>({id:v.id,created_at:v.created_at})));
   }
   return respond([]);
  });
  async function login({empty=true}={}){await page.goto(origin+'/workspace.html?test_session='+ ++loginSequence+'#access_token=synthetic-'+role+'&token_type=bearer&expires_in=3600');await page.locator('#workspace').waitFor({state:'visible'});if(empty)await page.getByText('工作區尚未保存觀測版本。').waitFor({state:'visible'});}
  await login();assert.ok(!page.url().includes('access_token'));
  await page.locator('#observation-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});
  await page.waitForFunction(()=>document.getElementById('observation-feedback').textContent.includes('欄位'));
  assert.equal(await page.locator('#save-observation').isDisabled(),true);
  await page.locator('#observation-file').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(payload)});
  await page.locator('#save-observation').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.getElementById('save-observation').disabled);
  assert.match(await page.locator('#observation-preview').innerText(),/先補齊基線資料/);
  await page.locator('#save-observation').click();
  await page.waitForFunction(()=>document.getElementById('observation-feedback').textContent.includes('HTTP 503'));
  await page.locator('#save-observation').click();
  await page.waitForFunction(()=>document.getElementById('observation-feedback').textContent.includes('已保存版本'));
  assert.equal(saves[0].p_request_id,saves[1].p_request_id);assert.equal(versions.length,1);
  await page.locator('#observation-list button').click();
  await page.waitForFunction(()=>document.getElementById('observation-feedback').textContent.includes('重新驗證'));
  assert.match(await page.locator('#observation-preview').innerText(),/已保存版本/);
  assert.match(await page.locator('#observation-preview').innerText(),/不是真實成長證據/);
  await page.locator('#sign-out').click();assert.equal(await page.locator('#observation-preview').isVisible(),false);
  await login({empty:false});
  await page.locator('#workspace').waitFor({state:'visible'});await page.locator('#observation-list button').waitFor();
  await page.locator('#observation-list button').click();await page.locator('#observation-preview').waitFor({state:'visible'});
  assert.match(await page.locator('#observation-preview').innerText(),new RegExp(versions[0].id));
  await page.locator('#observation-file').setInputFiles({name:'second.json',mimeType:'application/json',buffer:Buffer.from(payload)});
  await page.waitForFunction(()=>!document.getElementById('save-observation').disabled);await page.locator('#save-observation').click();
  await page.waitForFunction(()=>document.querySelectorAll('#observation-list button').length===2);
  assert.equal(versions.length,2);assert.deepEqual(versions[1].payload,JSON.parse(payload));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
  await page.locator('#sign-out').click();role='viewer';await login();
  assert.equal(await page.locator('#observation-form').isVisible(),false);assert.equal(await page.locator('#observation-list button').count(),0);
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}px: synthetic login transport, snapshot validation, retry identity, version reload, immutable history, viewer UI, signout, overflow`);
 }
}finally{if(browser)await browser.close();server.kill();}
