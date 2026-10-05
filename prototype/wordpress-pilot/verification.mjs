// Runner-only: actual WordPress HTTP, actual product Auth/Review authority over isolated SQL.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createStore,restoreBackup} from './store.mjs';
import {createPilotService} from './service.mjs';
import {scanOwnedSite} from '../internal-rc/source-fixture.mjs';
import {ids} from '../../supabase/drafts/first_result_save/fixtures.mjs';
import {backend} from '../owner-workspace/auth-session-fixture.mjs';
export async function verification({site,transport,rig,width}){
 const dir='/tmp/'+site.run+'-pilot-evidence';mkdirSync(dir,{mode:0o700,recursive:true});
 const binding={organization_id:ids.org,page_id:site.target,pilot_id:site.run+'-'+width,target_url:site.targetURL};
 let clock=Date.now(),posts=0,gets=0,lose=true,service;
 const grant={pilot_id:binding.pilot_id,approval_reference:'synthetic-isolated-fixture',starts_at:clock-1,expires_at:clock+120000};
 const config={enabled:true,evidence_environment:'isolated_fixture',binding,write_grant:grant,read_grant:{...grant,expires_at:clock+240000},storage_directory:dir+'/'+width,authority:{origin:backend,key:'sb_publishable_synthetic',redirectOrigin:'http://127.0.0.1:8791'}};
 createStore(config.storage_directory,binding);
 const fetchImpl=async(url,o={})=>{const r=await transport({url,method:o.method??'GET',headers:o.headers,body:o.body?JSON.parse(o.body):undefined});return {ok:r.status>=200&&r.status<300,status:r.status,json:async()=>JSON.parse(JSON.stringify(r.data))};};
 const wrapped={...site,call:async(p,o={})=>{if(o.method==='POST')posts++;else gets++;const r=await site.call(p,o);if(o.method==='POST'&&lose){lose=false;throw Error('Lost reply after WordPress commit');}return r;}};
 const start=()=>createPilotService({config,site:wrapped,fetchImpl,now:()=>clock});service=start();
 const dispatch=(t,a,i)=>service.dispatch(t,a,i),control=site.controlSnapshot();let last;
 return {
  async route(req){const u=new URL(req.url());
   if(u.pathname.startsWith('/api/wordpress-publication/')){const response=await service.handle(new Request(req.url(),{method:req.method(),headers:req.headers(),body:req.postData()}));const body=await response.text();if(response.status!==200)console.log('Pilot fixture request denied',u.pathname,body);return {status:response.status,contentType:'application/json',body};}
   if(u.pathname.startsWith('/backend/')){const r=await transport({url:backend+u.pathname.slice(8)+u.search,method:req.method(),headers:req.headers(),body:req.method()==='POST'?req.postDataJSON():undefined});return {status:r.status,contentType:'application/json',body:JSON.stringify(r.data)};}
   if(u.pathname==='/api/product-source')return {status:200,contentType:'application/json',body:JSON.stringify(await scanOwnedSite(site,dir+'/'+width+'-source.sqlite'))};
   const assets={
    '/workspace-runtime.mjs':`export const workspaceRuntime=${JSON.stringify({origin:backend,key:'sb_publishable_synthetic'})};export const workspaceFetch=(url,options)=>{const u=new URL(url,location.origin);if(u.origin===location.origin&&u.pathname.startsWith('/api/wordpress-publication/'))return fetch(u.href,options);if(u.origin!==workspaceRuntime.origin)throw Error('Backend mismatch');return fetch('/backend'+u.pathname+u.search,options);};`,
    '/url-result-config.mjs':'export const urlSaveEnabled=true,urlResultSchemaEnabled=true,urlSaveTrial=null,urlReviewEnabled=true,urlReviewSchemaEnabled=true,urlReviewTrial=null;',
    '/wordpress-publication-config.mjs':"export const wordpressPublicationEnabled=true,wordpressPublicationProfile='single_site_wordpress';"
   };
   if(assets[u.pathname])return {status:200,contentType:'text/javascript',body:assets[u.pathname]};return rig.asset(u.pathname);
  },
  async run({page,view,token,version_id,fresh,open}){
   const db=await rig.snapshot(),p=()=>view.locator('.wordpress-publication'),status=text=>p().locator('.wp-status').filter({hasText:text}).waitFor();
   assert.ok(await p().locator('.wp-preview').evaluate(b=>b.getBoundingClientRect().height>=44));await p().locator('.wp-preview').focus();await page.keyboard.press('Enter');await status('尚未發布；請核對');assert.equal(await p().locator('[data-wp-field]').count(),3);assert.equal(await p().locator('.wp-publish').isDisabled(),true);
   await p().locator('.wp-confirm').focus();await page.keyboard.press('Space');await p().locator('.wp-publish').focus();await page.keyboard.press('Enter');await status('提交結果未知');assert.equal(posts,1);
   const original=(await dispatch(token,'history',{version_id})).at(-1);assert.equal(original.state,'unknown');
   service.close();service=start();await page.locator('#sign-out').click();({page,token}=await fresh());view=await open(version_id);
   await p().locator('.wp-history').click();await status('提交結果未知');assert.equal((await dispatch(token,'history',{version_id})).at(-1).id,original.id);
   const input={version_id,intent_id:original.id,page_id:site.target,confirm:true};await assert.rejects(dispatch(token,'publish',input));
   await p().locator('.wp-readback').click();await status('已發布並由 API');assert.equal(posts,1);const evidence=JSON.parse(await p().locator('.wp-evidence').textContent());assert.equal(evidence.scope,'single_site_wordpress');assert.equal(evidence.binding.version_id,version_id);assert.equal(evidence.target_url,site.targetURL);
   const extra=await dispatch(token,'preview',{version_id});await assert.rejects(dispatch(token,'publish',{...input,intent_id:extra.id}),/consumed/);assert.equal(posts,1);
   lose=true;assert.equal(await p().locator('.wp-restore').isDisabled(),true);await p().locator('.wp-restore-confirm').focus();await page.keyboard.press('Space');await p().locator('.wp-restore').focus();await page.keyboard.press('Enter');await status('恢復結果未知');assert.equal(posts,2);service.close();clock=config.write_grant.expires_at+1;service=start();await p().locator('.wp-readback').click();await status('已恢復發布前內容');assert.equal(posts,2);last=await dispatch(token,'history',{version_id});assert.equal(last.at(-1).state,'restored');
   for(const role of ['viewer','foreign']){const t=rig.issue(role),journal=readFileSync(config.storage_directory+'/journal.json');for(const action of ['history','preview','readback','restore'])await assert.rejects(dispatch(t,action,input));assert.deepEqual(readFileSync(config.storage_directory+'/journal.json'),journal);rig.retire(t);}
   const nativeBefore=site.snapshot(),nativePage=(await site.call(site.path(site.target))).json();
   for(const [page_id,body]of [[site.control,{title:'denied',content:'denied',meta:{growth_meta_description:'denied'}}],[site.target,{title:'denied',content:'denied',meta:{growth_meta_description:'denied'},slug:'denied'}],[site.target,{title:'denied',content:'denied',meta:{growth_meta_description:'denied'}}]])assert.equal((await site.call(site.path(page_id),{method:'POST',headers:{'x-growth-before':nativePage.growth_revision},body})).status,403);
   assert.deepEqual(site.snapshot(),nativeBefore,'control, extra field and third native attempt deny without page/meta changes');
   assert.deepEqual(await rig.snapshot(),db);assert.deepEqual(site.controlSnapshot(),control);assert.match(await view.locator('.pilot-measurement').innerText(),/未知（不是零）/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p().screenshot({path:dir+'/'+width+'.png'});
   const archive=dir+'/'+width+'-backup.json';const backup=service.backup(archive);const restored=dir+'/'+width+'-recovered';assert.equal(restoreBackup(archive,restored,binding).mode,'readonly');
   service.close();clock=config.write_grant.expires_at+1;service=start();const getBefore=gets;assert.deepEqual(await dispatch(token,'history',{version_id}),last);assert.equal(gets,getBefore,'history needs no WordPress grant/GET');await assert.rejects(dispatch(token,'preview',{version_id}));
   const recovered=createPilotService({config:{...config,storage_directory:restored},site:wrapped,fetchImpl,now:()=>clock});try{assert.deepEqual(await recovered.dispatch(token,'history',{version_id}),last);await assert.rejects(recovered.dispatch(token,'publish',input));await assert.rejects(recovered.dispatch(token,'readback',input));}finally{recovered.close();}
   writeFileSync(dir+'/'+width+'-proof.json',JSON.stringify({binding,width,posts,evidence,backup,history_after_write_expiry:true,recovered_history_exact:true,control_unchanged:true,denied_journal_delta:0,denied_sql_delta:0,scope:'synthetic SQL sessions + ephemeral real WordPress; no live site'},null,2));
   console.log(`PASS pilot ${width}px: URL/Save/fresh Review → exact diff → lost actual WP reply → reopen + fresh session original operation GET only → confirmed restore; 2 POST; single-attempt cap; tenant zero delta; expiry history without WP GET; readonly backup restore; ${dir}`);
   return {page,view,token};
  },
  async stale(token,version_id,{view}){const count=posts;await view.locator('.wp-history').click();await view.locator('.wp-status').filter({hasText:'已恢復'}).waitFor();assert.deepEqual(await dispatch(token,'history',{version_id}),last);assert.equal(posts,count);await assert.rejects(dispatch(token,'preview',{version_id}));console.log('PASS pilot historical v1 record retained after saved v2; no write grant required');},
  async grantChecks(version_id){const t=rig.issue('owner');try{await site.expire();assert.equal((await site.call(site.path(site.target))).status,200,'independent read lease');await site.revoke();const before=gets;assert.deepEqual(await dispatch(t,'history',{version_id}),last);assert.equal(gets,before);}finally{rig.retire(t);}},
  async finish(){service.close();assert.deepEqual(site.controlSnapshot(),control);}
 };
}
