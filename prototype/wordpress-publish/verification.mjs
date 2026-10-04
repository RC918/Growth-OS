import assert from 'node:assert/strict';
import {mkdir,writeFile,appendFile,readFile} from 'node:fs/promises';
import {createWorkspaceApi} from '../../apps/web/workspace-api.mjs';
import {createWordpressPublisher} from './publisher.mjs';
import {backend} from '../owner-workspace/auth-session-fixture.mjs';
export async function verification({site,transport,rig,width}){
 const dir='/tmp/'+site.run+'-evidence';await mkdir(dir,{mode:0o700,recursive:true});
 const journal=dir+'/'+width+'.jsonl';let fault=null,posts=0,staleIntent=null,holdMeasurement=false,measurementStarted=null,releaseMeasurement=null;
 const baseline=site.snapshot(),control=()=>site.snapshot().posts.find(p=>Number(p.ID)===site.control);
 const controlBefore=control();
 const wrapped={...site,call:async(path,options={})=>{
  if(options.method==='POST'){
   if(fault==='before'){fault=null;throw Error('Synthetic failure before submit');}
   posts++;const result=await site.call(path,options);
   if(fault==='after'){fault=null;throw Error('Synthetic response lost after actual commit');}
   return result;
  }return site.call(path,options);
 }};
 const authorize=async(token,id,readonly=false)=>{
  const api=createWorkspaceApi({origin:backend,key:'sb_publishable_synthetic',redirectOrigin:'http://127.0.0.1:8791',urlResultSchemaEnabled:true,urlReviewSchemaEnabled:true,reviewMarker:{read:()=>null},fetchImpl:async(url,o)=>{const r=await transport({url,method:o.method,headers:o.headers,body:o.body?JSON.parse(o.body):undefined});return {ok:r.status>=200&&r.status<300,status:r.status,json:async()=>JSON.parse(JSON.stringify(r.data))};}});
  await api.completeMagicLink('#access_token='+token+'&token_type=bearer&expires_in=60');
  const dashboard=await api.dashboard(),metadata=dashboard.versions.find(v=>v.id===id);if(!metadata)throw Error('Version not visible');
  const row=await api.readContentVersion(metadata);
  if(readonly){
   if(api.context()?.role!=='owner')throw Error('Publication record requires Owner');
   const latest=!dashboard.versions.some(v=>v.opportunity_id===row.opportunity_id&&v.version_number>row.version_number);
   const d=await api.readSavedUrlDelivery(row,{latest,isCurrent:()=>true}),review=await api.readUrlReview(row);
   return {binding:{organization_id:d.version.organization_id,version_id:d.version.id,version_number:d.version.number,review_id:review?.id??null,source_digest:d.source.source_digest,content_digest:d.content_digest,version_digest:d.version.version_digest},target_url:d.source.candidate_url,position:d.version.position};
  }
  return api.previewUrlPublication(row,{isCurrent:()=>true});
 };
 const publisher=createWordpressPublisher({site:wrapped,authorize,authorizeRead:(token,id)=>authorize(token,id,true),record:v=>appendFile(journal,JSON.stringify(v)+'\n',{mode:0o600})});
 const dispatch=(token,action,input)=>publisher.dispatch(token,action,input);
 return {
  async route(req){const action=new URL(req.url()).pathname.split('/').at(-1);try{if(req.method()!=='POST')throw Error('method');const body=JSON.stringify(await dispatch(req.headers().authorization?.replace(/^Bearer /,''),action,req.postDataJSON()));if(action==='measurement'&&holdMeasurement){holdMeasurement=false;measurementStarted?.();await new Promise(r=>releaseMeasurement=r);}return {status:200,contentType:'application/json',body};}catch(error){console.error('WordPress gate:',error.message);return {status:403,contentType:'application/json',body:'{"error":"Publication denied"}'};}},
  async run({page,view,token,version_id,fresh,open}){
   const dbBefore=await rig.snapshot();
   const panel=()=>view.locator('.wordpress-publication');
   async function preview(){await panel().locator('.wp-preview').click();await panel().locator('.wp-status').filter({hasText:'尚未發布；請核對'}).waitFor();}
   async function measureRead(){const m=view.locator('.publication-measurement');await m.locator('.measurement-read').click();await m.locator('.measurement-status').filter({hasText:'量測已讀回'}).waitFor();return m;}
   async function measureSave(m){await m.locator('.measure-save').click();await m.locator('.measurement-status').filter({hasText:'觀測已保存'}).waitFor();}
   async function publish(){await panel().locator('.wp-confirm').check();await panel().locator('.wp-publish').click();}
   async function restore(){await panel().locator('.wp-restore').click();await panel().locator('.wp-status').filter({hasText:'已恢復發布前内容'.replace('内容','內容')}).waitFor();assert.deepEqual(control(),controlBefore);}
   await preview();assert.equal(posts,0);assert.equal(await panel().locator('.wp-publish').isDisabled(),true);assert.equal(await panel().locator('[data-wp-field]').count(),3);
   assert.ok((await panel().locator('.wp-diff').innerText()).includes(site.targetURL));
   await publish();await panel().locator('.wp-status').filter({hasText:'已發布並由 API 與網頁讀回核對'}).waitFor();assert.equal(posts,1);
   const evidence=JSON.parse(await panel().locator('.wp-evidence').textContent());assert.equal(evidence.binding.version_id,version_id);assert.equal(evidence.target_url,site.targetURL);assert.equal(evidence.first_published_at,'2026-01-01T00:00:00Z');assert.notEqual(evidence.modified_at,evidence.first_published_at);assert.ok(Date.parse(evidence.observed_at)>=Date.parse(evidence.modified_at));
   assert.deepEqual(control(),controlBefore);assert.deepEqual(await rig.snapshot(),dbBefore);await panel().screenshot({path:dir+'/'+width+'.png'});
   let m=await measureRead();assert.match(await m.locator('.measurement-outcome').innerText(),/未知/);
   const day=n=>new Date(Date.parse(evidence.observed_at.slice(0,10)+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
   const csv=(kind,missing=false)=>'date,clicks,impressions\n'+(kind==='baseline'?`${day(-2)},0,0${missing?'':`\n${day(-1)},0,0`}`:`${day(1)},2,10\n${day(2)},3,20`);
   const file=async(kind,missing=false)=>m.locator('.measure-'+kind+'-file').setInputFiles({name:kind+'.csv',mimeType:'text/csv',buffer:Buffer.from(csv(kind,missing))});
   await m.locator('.measure-source_name').fill('Synthetic measurement fixture');await m.locator('.measure-filter').fill('page exact; country all; device all');
   for(const kind of ['baseline','followup']){await file(kind);await m.locator('.measure-'+kind+'-start').fill(day(kind==='baseline'?-2:1));await m.locator('.measure-'+kind+'-end').fill(day(kind==='baseline'?-1:2));await m.locator('.measure-'+kind+'-exported').fill(day(kind==='baseline'?0:3)+'T00:00:00Z');}
   await m.locator('.measure-page_url').fill(site.origin+'/wrong/');await m.locator('.measure-save').click();await m.locator('.measurement-status').filter({hasText:'頁面不吻合'}).waitFor();assert.equal(posts,1);
   await m.locator('.measure-page_url').fill(site.targetURL);await m.locator('.measure-followup-start').fill(day(0));await m.locator('.measure-save').click();await m.locator('.measurement-status').filter({hasText:'後續期間不在'}).waitFor();assert.equal(posts,1);await m.locator('.measure-followup-start').fill(day(1));await file('baseline',true);await measureSave(m);assert.match(await m.locator('.measure-baseline-result').innerText(),/覆蓋 1\/2 天/);assert.match(await m.locator('.measurement-outcome').innerText(),/未知/);
   await file('baseline');await measureSave(m);assert.match(await m.locator('.measurement-outcome').innerText(),/合成情境差異：點擊 5、曝光 30/);assert.match(await m.locator('.measure-baseline-result').innerText(),/CTR 未知（曝光為零）/);assert.match(await m.locator('.measure-followup-result').innerText(),/未來合成日期/);await m.screenshot({path:dir+'/'+width+'-measurement.png'});
   assert.equal(posts,1);assert.deepEqual(await rig.snapshot(),dbBefore);
   await page.locator('#sign-out').click();const freshState=await fresh();page=freshState.page;token=freshState.token;view=await open(version_id);
   const persisted=(await readFile(journal,'utf8')).trim().split('\n').map(JSON.parse);assert.ok(persisted.some(v=>v.state==='confirmed_applied'&&v.evidence.binding.version_id===version_id));const history=await dispatch(token,'history',{version_id});assert.ok(history.some(v=>v.state==='confirmed_applied'&&v.evidence.binding.version_id===version_id));
   await panel().locator('.wp-history').click();await panel().locator('.wp-status').filter({hasText:'已發布並由 API 與網頁讀回核對'}).waitFor();assert.deepEqual(JSON.parse(await panel().locator('.wp-evidence').textContent()),evidence);m=await measureRead();assert.match(await m.locator('.measurement-outcome').innerText(),/合成情境差異：點擊 5、曝光 30/);await restore();assert.equal(posts,2);m=await measureRead();assert.match(await m.locator('.measurement-publication').innerText(),/已恢復/);assert.match(await m.locator('.measurement-body').innerText(),/原保存觀測現已不適用/);assert.match(await m.locator('.measure-followup-result').innerText(),/未知/);
   // An independent direct WordPress request cannot edit the control or extra fields.
   const targetBefore=site.snapshot();
   assert.equal((await site.call(site.path(site.control),{method:'POST',body:{title:'DENIED',content:'DENIED',meta:{growth_meta_description:'DENIED'}}})).status,403);
   const target=(await site.call(site.path(site.target))).json();assert.equal((await site.call(site.path(site.target),{method:'POST',headers:{'x-growth-before':target.growth_revision},body:{title:'DENIED',content:'DENIED',meta:{growth_meta_description:'DENIED'},slug:'wrong'}})).status,403);
   assert.equal((await site.call(site.path(site.target),{method:'POST',headers:{'x-growth-before':'wrong'},body:{title:'DENIED',content:'DENIED',meta:{growth_meta_description:'DENIED'}}})).status,409);assert.deepEqual(site.snapshot(),targetBefore);
   for(const role of ['viewer','foreign']){const deniedToken=rig.issue(role);await assert.rejects(dispatch(deniedToken,'preview',{version_id}));rig.retire(deniedToken);}assert.equal(posts,2);
   const wrong=await dispatch(token,'preview',{version_id});await assert.rejects(dispatch(token,'publish',{intent_id:wrong.id,page_id:site.control,confirm:true}));assert.equal(posts,2);
   await preview();fault='before';await publish();await panel().locator('.wp-status').filter({hasText:'提交結果未知'}).waitFor();assert.equal(posts,2);assert.equal(await panel().locator('.wp-publish').isDisabled(),true);await panel().locator('.wp-readback').click();await panel().locator('.wp-status').filter({hasText:'讀回仍是發布前內容'}).waitFor();assert.equal(posts,2);
   await preview();fault='after';await publish();await panel().locator('.wp-status').filter({hasText:'提交結果未知'}).waitFor();assert.equal(posts,3);assert.equal(await panel().locator('.wp-publish').isDisabled(),true);await panel().locator('.wp-readback').click();await panel().locator('.wp-status').filter({hasText:'已發布並由 API 與網頁讀回核對'}).waitFor();assert.equal(posts,3,'readback never resubmits');await restore();assert.equal(posts,4);
   assert.deepEqual(await rig.snapshot(),dbBefore);assert.deepEqual(control(),controlBefore);
   const after=site.snapshot();for(const p of after.posts){const original=baseline.posts.find(x=>x.ID===p.ID);for(const k of Object.keys(p))if(!['post_modified','post_modified_gmt'].includes(k))assert.equal(p[k],original[k],'restored '+k);}assert.deepEqual(after.meta,baseline.meta);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await writeFile(dir+'/'+width+'-proof.json',JSON.stringify({...(await site.proof()),width,evidence,posts,checks:['UI confirmation','API/HTML','fresh session history','wrong page','viewer/foreign','extra field denied','before failure','after lost response GET only','verified restore','control/non-target unchanged','SQL no delta']},null,2));
   console.log(`PASS WordPress ${width}px: real HTTPS App Password → current diff → separate confirmation → API+HTML → fresh-session evidence → before/after failure readback/no resend → verified restore; control/non-target/SQL unchanged; ${posts} writes (2 publish + 2 restore); evidence ${dir}`);
   staleIntent=await dispatch(token,'preview',{version_id});return {page,view,token};
  },
  async stale(token,version_id,{page,view,newer}={}){const before=site.snapshot();await assert.rejects(dispatch(token,'publish',{intent_id:staleIntent.id,page_id:site.target,confirm:true}));assert.deepEqual(site.snapshot(),before);await assert.rejects(dispatch(token,'preview',{version_id}));const historical=await dispatch(token,'measurement',{version_id});assert.equal(historical.publication.state,'restored');assert.ok(historical.publications.length>=2);
   for(const role of ['viewer','foreign']){const t=rig.issue(role);await assert.rejects(dispatch(t,'measurement',{version_id}));rig.retire(t);}
   const m=view.locator('.publication-measurement');await m.locator('.measurement-read').click();await m.locator('.measurement-status').filter({hasText:'量測已讀回'}).waitFor();assert.match(await m.locator('.measurement-version').innerText(),/歷史第 1 版/);assert.match(await m.locator('.measurement-publication').innerText(),/已恢復/);
   await view.locator('.wp-history').click();await view.locator('.wp-status').filter({hasText:'已恢復'}).waitFor();assert.equal(await view.locator('.wp-publish').isDisabled(),true);
   const first=historical.publications[0];await m.locator('.measure-publication').selectOption(first.id);await m.locator('.measurement-status').filter({hasText:'量測已讀回'}).waitFor();assert.match(await m.locator('.measure-baseline-result').innerText(),/點擊 0、曝光 0/);assert.match(await m.locator('.measure-followup-result').innerText(),/未知/);await m.screenshot({path:dir+'/'+width+'-historical-restored.png'});
   const next=newer.locator('.publication-measurement');await next.locator('.measurement-read').click();await next.locator('.measurement-status').filter({hasText:'量測已讀回'}).waitFor();assert.match(await next.locator('.measurement-outcome').innerText(),/尚無此版本發布證據/);assert.deepEqual(site.snapshot(),before);
   holdMeasurement=true;const started=new Promise(r=>measurementStarted=r);await m.locator('.measurement-read').click();await started;await page.locator('#sign-out').click();const response=page.waitForResponse(r=>r.url().endsWith('/api/wordpress-publication/measurement'));releaseMeasurement();await response;await page.waitForTimeout(30);assert.equal(await page.locator('.publication-measurement .measurement-body').count(),0,'late measurement response cannot repopulate logged-out workspace');
   console.log('PASS version measurement '+width+'px: real publication → synthetic before/after → saved journal → fresh UI readback → restored followup excluded → historical v1 retained / v2 unknown; wrong page/period/missing days, viewer/foreign, late logout response rejected, zero WP/SQL measurement writes');
   console.log('PASS WordPress stale reviewed version denied');},
  async finish(){releaseMeasurement?.();assert.deepEqual(control(),controlBefore);}
 };
}
