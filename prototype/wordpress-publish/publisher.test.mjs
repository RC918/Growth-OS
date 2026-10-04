import test from 'node:test';
import assert from 'node:assert/strict';
import {createWordpressPublisher,contentHTML} from './publisher.mjs';
const authority={review_status:'exact_version_confirmed',binding:{organization_id:'org',version_id:'v1',review_id:'r1'},target_url:'https://127.0.0.1:443/bolt/',fields:{title:{after:'Bolt'},meta_description:{after:'Meta'},description:{after:'Body'}}};
function fixture(){let post=0;const a=structuredClone(authority),p={id:4,link:a.target_url,title:{raw:'Old'},content:{raw:'<p>Old</p>'},meta:{growth_meta_description:'Old meta'},growth_revision:'before',date_gmt:'2026-01-01T00:00:00',modified_gmt:'2026-01-01T00:00:00'};const site={target:4,targetURL:a.target_url,path:()=>'/page',call:async(path,o={})=>{if(o.method==='POST'){post++;throw Error('lost');}return {status:200,json:()=>structuredClone(p)};}};return {a,p,posts:()=>post,run:createWordpressPublisher({site,authorize:async(token)=>{if(token!=='owner')throw Error('denied');return structuredClone(a);}}).dispatch};}
test('server gates exact Review, target, tenant/version binding and explicit page confirmation before writes',async()=>{
 const f=fixture();f.a.review_status='review_required';await assert.rejects(f.run('owner','preview',{version_id:'v1'}));f.a.review_status='exact_version_confirmed';await assert.rejects(f.run('foreign','preview',{version_id:'v1'}));const i=await f.run('owner','preview',{version_id:'v1'});
 await assert.rejects(f.run('owner','publish',{intent_id:i.id,page_id:5,confirm:true}));await assert.rejects(f.run('owner','publish',{intent_id:i.id,page_id:4,confirm:false}));f.a.binding.version_id='v2';await assert.rejects(f.run('owner','publish',{intent_id:i.id,page_id:4,confirm:true}));assert.equal(f.posts(),0);
});
test('unknown submission is consumed; repeated publish and new preview cannot cause a second write; only GET reconciliation',async()=>{
 const f=fixture(),i=await f.run('owner','preview',{version_id:'v1'}),input={intent_id:i.id,page_id:4,confirm:true};assert.equal((await f.run('owner','publish',input)).state,'unknown');await assert.rejects(f.run('owner','publish',input));await assert.rejects(f.run('owner','preview',{version_id:'v1'}));assert.equal((await f.run('owner','readback',input)).state,'confirmed_not_applied');assert.equal(f.posts(),1);
});
test('changed baseline blocks publish; unknown divergent content never allows restore/new write',async()=>{
 const f=fixture(),i=await f.run('owner','preview',{version_id:'v1'});f.p.growth_revision='drift';await assert.rejects(f.run('owner','publish',{intent_id:i.id,page_id:4,confirm:true}));assert.equal(f.posts(),0);f.p.growth_revision='before';await f.run('owner','publish',{intent_id:i.id,page_id:4,confirm:true});f.p.title.raw='Third party';assert.equal((await f.run('owner','readback',{intent_id:i.id})).state,'state_diverged');await assert.rejects(f.run('owner','restore',{intent_id:i.id,confirm:true}));await assert.rejects(f.run('owner','preview',{version_id:'v1'}));assert.equal(f.posts(),1);
});
test('text to WordPress content escapes markup and retains Unicode/newlines',()=>{assert.equal(contentHTML('é 🧪\n<script>&'),'<p>é 🧪\n&lt;script&gt;&amp;</p>');});

test('publication UI clears confirmation on edit and ignores a response from a replaced session',async()=>{
 const {JSDOM}=await import('jsdom'),{wordpressPublication}=await import('../../apps/web/wordpress-publication.mjs');const dom=new JSDOM('<main></main>');globalThis.document=dom.window.document;
 try{let session={role:'owner'},release;const panel=wordpressPublication({api:{context:()=>session,wordpressPublication:()=>new Promise(r=>release=r)},version:{id:'v1'},latest:true,isCurrent:()=>true});document.querySelector('main').append(panel.root);const root=panel.root,tick=()=>new Promise(r=>setTimeout(r,0));
  root.querySelector('.wp-preview').click();session={role:'owner'};release({});await tick();assert.equal(root.querySelector('.wp-diff').textContent,'');assert.equal(root.querySelector('.wp-publish').disabled,true);
  panel.setEditing(true);assert.equal(root.querySelector('.wp-confirm').checked,false);assert.equal(root.querySelector('.wp-publish').disabled,true);
 }finally{delete globalThis.document;dom.window.close();}
});
