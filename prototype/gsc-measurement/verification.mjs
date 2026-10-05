import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pacificDate,pacificDayBounds} from '../../apps/web/gsc-date-contract.mjs';
export async function verification({dispatch,rig,site,width,dir,config,restart,counts}){
 let loseSave=false,holdRead=null,saved=null;const journal=()=>readFileSync(config.storage_directory+'/journal.json');
 const measurement=(token,id,extra={})=>dispatch(token,'measurement',{version_id:id,...extra});
 const inputFor=(id,pid,data)=>({version_id:id,publication_id:pid,data});
 return {
  async response(req,status,body){const action=new URL(req.url()).pathname.split('/').at(-1);if(action==='measurement-save'&&loseSave&&status===200){loseSave=false;return {status:503,contentType:'application/json',body:'{"error":"Synthetic lost measurement reply"}'};}if(action==='measurement'&&holdRead){const hold=holdRead;holdRead=null;hold.started();await hold.wait;}return null;},
  async beforeRestore({page,view,token,version_id,evidence,fresh,open}){
   const database=await rig.snapshot(),siteBefore=site.snapshot(),writes=counts().posts,reads=counts().gets;
   let m=view.locator('.gsc-measurement');const read=async()=>{await m.locator('.measurement-read').click();await m.locator('.measurement-status').filter({hasText:'量測已讀回'}).waitFor();};
   await read();assert.match(await m.locator('.measurement-outcome').innerText(),/未知/);assert.equal(await m.locator('.measure-timezone').inputValue(),'America/Los_Angeles');
   const day=pacificDate(Date.parse(evidence.observed_at)),offset=n=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
   const csv=(kind,missing=false)=>'date,clicks,impressions\n'+(kind==='baseline'?`${offset(-2)},0,0${missing?'':`\n${offset(-1)},0,0`}`:`${offset(1)},2,10\n${offset(2)},3,20`);
   const file=async(kind,missing=false)=>m.locator('.measure-'+kind+'-file').setInputFiles({name:kind+'.csv',mimeType:'text/csv',buffer:Buffer.from(csv(kind,missing))});
   await m.locator('.measure-source_name').fill('Synthetic GSC-style fixture');await m.locator('.measure-property').fill('sc-domain:rc-source.example');await m.locator('.measure-filter').fill('page equals '+site.targetURL+'; country/device all');
   for(const kind of ['baseline','followup']){await file(kind);await m.locator('.measure-'+kind+'-start').fill(offset(kind==='baseline'?-2:1));await m.locator('.measure-'+kind+'-end').fill(offset(kind==='baseline'?-1:2));await m.locator('.measure-'+kind+'-exported').fill(new Date(pacificDayBounds(offset(kind==='baseline'?-1:2)).end).toISOString());}
   const original=await measurement(token,version_id),pid=original.publication.id;
   await m.locator('.measure-page_url').fill('https://rc-source.example/wrong/');const bytes=journal();await m.locator('.measure-save').click();await m.locator('.measurement-status').filter({hasText:'頁面不吻合'}).waitFor();assert.deepEqual(journal(),bytes);await m.locator('.measure-page_url').fill(site.targetURL);
   await file('baseline',true);await m.locator('.measure-save').focus();await page.keyboard.press('Enter');await m.locator('.measurement-status').filter({hasText:'觀測已保存'}).waitFor();assert.match(await m.locator('.measure-baseline-result').innerText(),/覆蓋 1\/2 天/);assert.match(await m.locator('.measurement-outcome').innerText(),/未知/);
   await file('baseline');loseSave=true;await m.locator('.measure-save').click();await m.locator('.measurement-status').filter({hasText:'保存結果未知'}).waitFor();assert.equal(await m.locator('.measure-save').isDisabled(),true);const afterUnknown=journal();await read();assert.deepEqual(journal(),afterUnknown,'unknown save uses read only');assert.match(await m.locator('.measurement-outcome').innerText(),/合成情境差異：點擊 5、曝光 30/);
   saved=await measurement(token,version_id);assert.equal(saved.publication.evidence.environment,'isolated_fixture');assert.equal(saved.assessment.traffic_verified,false);assert.equal(saved.assessment.indexing_status,'unknown');assert.equal(saved.assessment.baseline.timezone,'America/Los_Angeles');assert.equal(saved.assessment.followup.simulated_future,true);assert.equal(saved.assessment.baseline.ctr,null);
   await dispatch(token,'measurement-save',inputFor(version_id,pid,saved.data));assert.deepEqual(journal(),afterUnknown,'identical normalized data does not append a second event');
   for(const change of [d=>d.baseline.timezone='UTC',d=>d.baseline.property='sc-domain:other.example',d=>d.baseline.meta.source='verified',d=>d.baseline.meta.page_url='https://rc-source.example/other/',d=>d.followup.meta.start=offset(0)]){const d=structuredClone(saved.data);change(d);await assert.rejects(dispatch(token,'measurement-save',inputFor(version_id,pid,d)));assert.deepEqual(journal(),afterUnknown);}
   for(const role of ['viewer','foreign']){const t=rig.issue(role);for(const action of ['measurement','measurement-save'])await assert.rejects(dispatch(t,action,action==='measurement'?{version_id}:inputFor(version_id,pid,saved.data)));rig.retire(t);assert.deepEqual(journal(),afterUnknown);}
   assert.equal(counts().posts,writes);assert.equal(counts().gets,reads);assert.deepEqual(site.snapshot(),siteBefore);assert.deepEqual(await rig.snapshot(),database);
   const oldToken=token;restart();await page.locator('#sign-out').click();({page,token}=await fresh());view=await open(version_id);await assert.rejects(measurement(oldToken,version_id));m=view.locator('.gsc-measurement');await read();const exact=await measurement(token,version_id);assert.deepEqual(exact,saved);assert.deepEqual(JSON.parse(await m.locator('.gsc-observation-evidence').textContent()).data,saved.data);
   assert.ok(await m.locator('.measure-save').evaluate(b=>b.getBoundingClientRect().height>=44));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await m.screenshot({path:dir+'/'+width+'-gsc.png'});
   await view.locator('.wp-history').click();await view.locator('.wp-status').filter({hasText:'已發布並由 API'}).waitFor();
   writeFileSync(dir+'/'+width+'-gsc-proof.json',JSON.stringify({width,publication_id:pid,binding:saved.binding,data:saved.data,assessment:saved.assessment,exact_fresh_readback:true,unknown_save_get_only:true,denied_journal_delta:0,denied_sql_delta:0,measurement_wordpress_posts:0,measurement_wordpress_gets:0},null,2));
   console.log(`PASS GSC ${width}px: Pacific CSV → missing/zero distinction → save lost reply/read only → exact durable fresh session → 5 clicks/30 impressions synthetic difference; source/property/page/filter and tenant refusals zero delta; no WordPress calls`);
   return {page,view,token};
  },
  async afterRestore({view,token,version_id}){
   const before=journal(),calls=counts(),v=await measurement(token,version_id);assert.deepEqual(v.data,saved.data);assert.equal(v.assessment.followup,null);assert.equal(v.assessment.comparison,null);assert.equal(v.measurement_write_available,false);assert.ok(v.assessment.unknown.some(s=>s.includes('不適用')));
   await assert.rejects(dispatch(token,'measurement-save',inputFor(version_id,v.publication.id,{baseline:saved.data.baseline,followup:null})),/expired/);assert.deepEqual(journal(),before);assert.deepEqual(counts(),calls);
   const m=view.locator('.gsc-measurement');await m.locator('.measurement-read').click();await m.locator('.measurement-status').filter({hasText:'量測已讀回'}).waitFor();assert.equal(await m.locator('.measure-save').isDisabled(),true);assert.match(await m.locator('.measurement-outcome').innerText(),/未知/);
  },
  async recovered(service,token,version_id){const out=await service.dispatch(token,'measurement',{version_id});assert.deepEqual(out.data,saved.data);assert.equal(out.measurement_write_available,false);await assert.rejects(service.dispatch(token,'measurement-save',inputFor(version_id,out.publication.id,saved.data)),/historical reads only/);},
  async stale({token,version_id,view,page,newer}){
   const before=journal(),v=await measurement(token,version_id);assert.ok(v.publication.version_superseded_at);assert.deepEqual(v.data,saved.data);assert.equal(v.assessment.comparison,null);assert.equal(v.measurement_write_available,false);
   const n=newer.locator('.gsc-measurement');await n.locator('.measurement-read').click();await n.locator('.measurement-status').filter({hasText:'量測已讀回'}).waitFor();assert.match(await n.locator('.measurement-outcome').innerText(),/尚無此版本發布證據/);
   let signal,release;const started=new Promise(r=>signal=r),wait=new Promise(r=>release=r);holdRead={started:signal,wait};const m=view.locator('.gsc-measurement');await m.locator('.measurement-read').click();await started;await page.locator('#sign-out').click();const response=page.waitForResponse(r=>r.url().endsWith('/api/wordpress-publication/measurement'));release();await response;await page.waitForTimeout(30);assert.equal(await page.locator('.gsc-measurement').count(),0);assert.deepEqual(journal(),before);
   console.log(`PASS GSC ${width}px: restore/new-version cutoff, write-expired historical/backup reads, denied expired save, v2 unknown, late logout response discarded; journal unchanged`);
  }
 };
}
