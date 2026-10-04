import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRunJournal,openRunJournal} from './journal.mjs';
import {createWordpressPublisher} from './publisher.mjs';
import {createPublicationService} from './service.mjs';
const bound={run:'fixture',journal_id:'fixed',organization_id:'org',page_id:4,target_url:'https://127.0.0.1/bolt/',expires_at:Date.now()+60000};
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'growth-journal-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'journal.json');createRunJournal(path,bound);
 const a={review_status:'exact_version_confirmed',binding:{organization_id:'org',version_id:'v1',review_id:'r1'},target_url:bound.target_url,fields:{title:{after:'Bolt'},meta_description:{after:'Meta'},description:{after:'Body'}}};
 const page={id:4,link:a.target_url,title:{raw:'Old'},content:{raw:'<p>Old</p>'},meta:{growth_meta_description:'Old meta'},growth_revision:'before',date_gmt:'2026-01-01T00:00:00',modified_gmt:'2026-01-01T00:00:00'};
 let posts=0,status=200;
 const site={run:bound.run,expires_at:bound.expires_at,target:4,targetURL:a.target_url,path:id=>'/?rest_route=/wp/v2/pages/'+id+'&context=edit',call:async(route,o={})=>{if(o.method==='POST'){posts++;throw Error('lost');}return {status,text:JSON.stringify(page),json:()=>structuredClone(page)};}};
 const authorize=async(token,id)=>{if(token!=='fresh-owner'||id!=='v1')throw Error('Denied session/version');return structuredClone(a);};
 return {dir,path,a,page,site,authorize,status:s=>status=s,posts:()=>posts,open:()=>openRunJournal(path,bound),publisher:()=>createWordpressPublisher({site,authorize,journal:openRunJournal(path,bound)}),coldPending:async()=>{const pub=createWordpressPublisher({site,authorize,journal:openRunJournal(path,bound)}),intent=await pub.dispatch('fresh-owner','preview',{version_id:'v1'});const journal=openRunJournal(path,bound),operation=journal.entries.at(-1).operation;journal.append({kind:'operation',operation:{...operation,state:'submitting'}});return intent;}};
}
test('durable snapshot retains exact records, restrictive mode and original run binding',t=>{
 const f=fixture(t),j=f.open();j.append({kind:'test',payload:'Unicode 🧪'});assert.deepEqual(f.open().entries,[{kind:'test',payload:'Unicode 🧪'}]);assert.equal(statSync(f.path).mode&0o777,0o600);
 for(const key of ['run','journal_id','organization_id','page_id','target_url','expires_at'])assert.throws(()=>openRunJournal(f.path,{...bound,[key]:'changed'}),/binding/);
});
test('missing, truncated, corrupt and partial commit journals fail closed without repair',t=>{
 const f=fixture(t),original=readFileSync(f.path,'utf8');
 for(const bytes of [original.slice(0,-1),original.replace('fixture','changed'),'{broken\n']){writeFileSync(f.path,bytes);assert.throws(()=>f.open());assert.equal(readFileSync(f.path,'utf8'),bytes);}
 writeFileSync(f.path,original);writeFileSync(f.path+'.next','partial');assert.throws(()=>f.open(),/Incomplete journal commit/);rmSync(f.path+'.next');rmSync(f.path);assert.throws(()=>f.open(),/ENOENT/);
});
test('intent commit failure prohibits POST and poisons further dispatch',async t=>{
 const f=fixture(t),pub=f.publisher(),i=await pub.dispatch('fresh-owner','preview',{version_id:'v1'});writeFileSync(f.path+'.next','incomplete');
 await assert.rejects(pub.dispatch('fresh-owner','publish',{intent_id:i.id,page_id:4,confirm:true}));assert.equal(f.posts(),0);await assert.rejects(pub.dispatch('fresh-owner','history',{version_id:'v1'}),/commit uncertain/);
});
test('cold pending operation retains ID, denies stale authorization/replay/other preview, GET reconciles before without POST',async t=>{
 const f=fixture(t),old=f.publisher(),preview=await old.dispatch('fresh-owner','preview',{version_id:'v1'}),i=await f.coldPending(),pub=f.publisher();
 const input={version_id:'v1',intent_id:i.id,page_id:4,confirm:true};assert.equal((await pub.dispatch('fresh-owner','history',{version_id:'v1'})).at(-1).id,i.id);
 for(const [token,action,args] of [['retired','readback',input],['fresh-owner','readback',{...input,version_id:'v2'}],['fresh-owner','readback',{...input,page_id:5}],['fresh-owner','preview',{version_id:'v1'}],['fresh-owner','publish',input],['fresh-owner','publish',{...input,intent_id:preview.id}]])await assert.rejects(pub.dispatch(token,action,args));
 assert.equal((await pub.dispatch('fresh-owner','readback',input)).state,'confirmed_not_applied');assert.equal(f.posts(),0);assert.equal(f.publisher()!==pub,true);
});
test('cold pending operation detects drift and remains unable to publish or restore',async t=>{
 const f=fixture(t),i=await f.coldPending();f.page.title.raw='Changed independently';const pub=f.publisher();assert.equal((await pub.dispatch('fresh-owner','readback',{intent_id:i.id})).state,'state_diverged');
 await assert.rejects(pub.dispatch('fresh-owner','restore',{intent_id:i.id,confirm:true}));await assert.rejects(pub.dispatch('fresh-owner','preview',{version_id:'v1'}));assert.equal(f.posts(),0);
});
test('checksum-valid but incomplete operation evidence also fails cold startup',async t=>{
 const f=fixture(t);await f.coldPending();const j=f.open(),operation=j.entries.at(-1).operation;j.append({kind:'operation',operation:{...operation,state:'confirmed_applied'}});assert.throws(()=>f.publisher(),/Incomplete applied evidence/);
});
test('actual service PID replacement rechecks session, native grant and original expiration; corrupt startup stops',async t=>{
 const f=fixture(t),path=join(f.dir,'service.json'),service=await createPublicationService({path,auditPath:join(f.dir,'audit.jsonl'),site:f.site,organization_id:'org',authorize:f.authorize,authorizeRead:f.authorize});t.after(()=>service.close());
 await service.dispatch('fresh-owner','preview',{version_id:'v1'});const proof=await service.restart();assert.notEqual(proof.previous_pid,proof.new_pid);assert.equal(proof.exit_signal,'SIGKILL');await assert.rejects(service.dispatch('retired','history',{version_id:'v1'}),/Denied/);
 f.status(401);await assert.rejects(service.dispatch('fresh-owner','history',{version_id:'v1'}),/grant revoked/);f.status(200);
 const bytes=readFileSync(path,'utf8');assert.ok(!bytes.includes('fresh-owner'));assert.ok(!/password|Bearer|synthetic-session/.test(bytes));
 writeFileSync(path,bytes.slice(0,-1));await assert.rejects(service.restart(),/Incomplete journal/);assert.equal(service.pid(),undefined);assert.equal(f.posts(),0);
 const expired=await createPublicationService({path:join(f.dir,'expired.json'),auditPath:join(f.dir,'expired-audit'),site:{...f.site,expires_at:Date.now()-1},organization_id:'org',authorize:f.authorize,authorizeRead:f.authorize});try{await expired.restart();await assert.rejects(expired.dispatch('fresh-owner','history',{version_id:'v1'}),/expired/);}finally{await expired.close();}
});
