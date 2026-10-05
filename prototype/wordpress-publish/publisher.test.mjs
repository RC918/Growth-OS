import test from 'node:test';
import assert from 'node:assert/strict';
import {createWordpressPublisher,contentHTML} from './publisher.mjs';
const authority={review_status:'exact_version_confirmed',binding:{organization_id:'org',version_id:'v1',review_id:'r1'},target_url:'https://127.0.0.1:443/bolt/',fields:{title:{after:'Bolt'},meta_description:{after:'Meta'},description:{after:'Body'}}};
function fixture(){let post=0;const a=structuredClone(authority),p={date:'2026-01-01T00:00:00',slug:'bolt',status:'publish',type:'page',author:2,parent:0,menu_order:0,comment_status:'closed',ping_status:'closed',template:'',featured_media:0,excerpt:{raw:'',rendered:'<p>Old</p>\n',protected:false},id:4,link:a.target_url,title:{raw:'Old'},content:{raw:'<p>Old</p>'},meta:{growth_meta_description:'Old meta'},growth_revision:'before',date_gmt:'2026-01-01T00:00:00',modified_gmt:'2026-01-01T00:00:00'};const site={target:4,targetURL:a.target_url,path:()=>'/page',call:async(path,o={})=>{if(o.method==='POST'){post++;throw Error('lost');}return {status:200,json:()=>structuredClone(p)};}};return {a,p,posts:()=>post,run:createWordpressPublisher({site,authorize:async(token)=>{if(token!=='owner')throw Error('denied');return structuredClone(a);}}).dispatch};}
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

function readbackFixture({explicit=false,drift=()=>{},htmlWrong=false}={}){
 const base=fixture(),p=base.p;let posts=0;
 if(explicit)p.excerpt={raw:'Kept',rendered:'<p>Kept</p>\n',protected:false};
 const before=structuredClone(p),site={target:4,targetURL:authority.target_url,path:()=>'/page',call:async(path,o={})=>{
  if(o.method==='POST'){
   posts++;p.title.raw=o.body.title;p.content.raw=o.body.content;p.meta=o.body.meta;p.growth_revision='revision-'+posts;
   if(!explicit)p.excerpt.rendered=p.content.raw+'\n';drift(p);
  }
  return {status:200,json:()=>structuredClone(p),text:`<title>${htmlWrong?'WRONG':p.title.raw}</title><meta name="description" content="${p.meta.growth_meta_description}"><article data-page-id="4">${p.content.raw}</article>`};
 }};
 return {p,before,setHTMLWrong:value=>htmlWrong=value,posts:()=>posts,run:createWordpressPublisher({site,authorize:async()=>structuredClone(authority)}).dispatch};
}
test('empty raw derived excerpt and explicit excerpt publish/restore preserve raw/protected with readback evidence',async()=>{
 for(const explicit of [false,true]){
  const f=readbackFixture({explicit}),i=await f.run('owner','preview',{version_id:'v1'}),input={intent_id:i.id,page_id:4,confirm:true};
  const applied=await f.run('owner','publish',input);assert.equal(applied.state,'confirmed_applied');assert.deepEqual(applied.evidence.excerpt_readback.before,f.before.excerpt);assert.deepEqual(applied.evidence.excerpt_readback.after,f.p.excerpt);assert.equal(applied.evidence.excerpt_readback.mode,explicit?'explicit_strict':'empty_raw_derived');
  const restored=await f.run('owner','restore',input);assert.equal(restored.state,'restored');assert.deepEqual(restored.restore_excerpt_readback.after,f.before.excerpt);assert.deepEqual(restored.evidence,applied.evidence,'publication evidence stays immutable');assert.equal(f.posts(),2);
 }
});
test('raw/protected/explicit rendering or any preserved-field drift cannot confirm, restore or create another intent',async()=>{
 const cases=[p=>p.excerpt.raw='unexpected',p=>p.excerpt.protected=true,p=>p.excerpt.rendered=4,p=>delete p.excerpt.raw,p=>delete p.excerpt,p=>p.excerpt={raw:'',rendered:'',protected:null},p=>p.excerpt.extra='unknown',
  ...['id','date','date_gmt','slug','status','type','link','author','parent','menu_order','comment_status','ping_status','template','featured_media'].flatMap(k=>[p=>p[k]=typeof p[k]==='number'?p[k]+1:p[k]+'drift',p=>delete p[k]])];
 for(const drift of cases){const f=readbackFixture({drift}),i=await f.run('owner','preview',{version_id:'v1'}),input={intent_id:i.id,page_id:4,confirm:true};const result=await f.run('owner','publish',input);assert.ok(['state_diverged','unknown'].includes(result.state));await assert.rejects(f.run('owner','restore',input));await assert.rejects(f.run('owner','preview',{version_id:'v1'}));assert.equal(f.posts(),1);}
 const f=readbackFixture({explicit:true,drift:p=>p.excerpt.rendered='<p>changed</p>'}),i=await f.run('owner','preview',{version_id:'v1'});assert.equal((await f.run('owner','publish',{intent_id:i.id,page_id:4,confirm:true})).state,'state_diverged');
});
test('missing/malformed baseline fails before POST; automatic excerpt never bypasses target fields or HTML',async()=>{
 for(const change of [p=>delete p.excerpt,p=>p.excerpt.raw=null,p=>p.excerpt.protected=0,p=>delete p.slug,p=>p.author='2']){const f=readbackFixture();change(f.p);await assert.rejects(f.run('owner','preview',{version_id:'v1'}));assert.equal(f.posts(),0);}
 for(const options of [{htmlWrong:true},{drift:p=>p.title.raw='wrong'},{drift:p=>p.content.raw='<p>wrong</p>'},{drift:p=>p.meta.growth_meta_description='wrong'}]){const f=readbackFixture(options),i=await f.run('owner','preview',{version_id:'v1'});assert.notEqual((await f.run('owner','publish',{intent_id:i.id,page_id:4,confirm:true})).state,'confirmed_applied');assert.equal(f.posts(),1);}
});

test('publication UI clears confirmation on edit and ignores a response from a replaced session',async()=>{
 const {JSDOM}=await import('jsdom'),{wordpressPublication}=await import('../../apps/web/wordpress-publication.mjs');const dom=new JSDOM('<main></main>');globalThis.document=dom.window.document;
 try{let session={role:'owner'},release;const panel=wordpressPublication({api:{context:()=>session,wordpressPublication:()=>new Promise(r=>release=r)},version:{id:'v1'},latest:true,isCurrent:()=>true});document.querySelector('main').append(panel.root);const root=panel.root,tick=()=>new Promise(r=>setTimeout(r,0));
  root.querySelector('.wp-preview').click();session={role:'owner'};release({});await tick();assert.equal(root.querySelector('.wp-diff').textContent,'');assert.equal(root.querySelector('.wp-publish').disabled,true);
  panel.setEditing(true);assert.equal(root.querySelector('.wp-confirm').checked,false);assert.equal(root.querySelector('.wp-publish').disabled,true);
 }finally{delete globalThis.document;dom.window.close();}
});

test('restore cannot succeed if API matches but HTML does not',async()=>{
 const f=readbackFixture(),i=await f.run('owner','preview',{version_id:'v1'}),input={intent_id:i.id,page_id:4,confirm:true};assert.equal((await f.run('owner','publish',input)).state,'confirmed_applied');f.setHTMLWrong(true);assert.equal((await f.run('owner','restore',input)).state,'restore_unknown');await assert.rejects(f.run('owner','restore',input));await assert.rejects(f.run('owner','readback',input));await assert.rejects(f.run('owner','preview',{version_id:'v1'}));assert.equal(f.posts(),2);
});
