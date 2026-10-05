// Explicit disposable regression only: same pinned WP/plugin/RC theme, tmpfs,
// original 900s grant, no persistent RC root/window or native identity creation.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createSite} from './site.mjs';
import {createPublicationService} from './service.mjs';
if(process.argv.slice(2).join(' ')!=='--mode growth-os-isolated-regression')throw Error('Explicit isolated regression mode required');
for(const excerpt of ['','Keep this excerpt']){
 let site,service;
 try{
  site=await createSite({sourceFixture:true,excerpt});assert.equal(site.target,1001);assert.equal(site.control,1002);
  const dir='/tmp/'+site.run+'-evidence';await mkdir(dir,{mode:0o700});
  const controlBefore=site.controlSnapshot(),initial=(await site.call(site.path(1001))).json();
  assert.equal(initial.excerpt.raw,excerpt);let loseReply=true,killedPid,posts=0,readbackDrift=null;
  const wrapped={...site,call:async(path,options={})=>{
   const result=await site.call(path,options);
   if(options.method==='POST'){posts++;if(loseReply){loseReply=false;killedPid=service.pid();await service.stop();throw Error('Synthetic lost response after WordPress commit');}}
   if(readbackDrift&&(options.method??'GET')==='GET'&&path===site.path(1001)){
    const page=result.json();readbackDrift(page);const text=JSON.stringify(page);return {...result,text,json:()=>JSON.parse(text)};
   }
   return result;
  }};
  const authority={review_status:'exact_version_confirmed',binding:{organization_id:'synthetic-org',version_id:'synthetic-version',review_id:'synthetic-review'},target_url:site.targetURL,fields:{title:{after:'Reviewed bolt'},meta_description:{after:'Reviewed description'},description:{after:'Reviewed steel bolt body'}}};
  const authorize=async(token,version)=>{assert.equal(token,'fixture-owner');assert.equal(version,'synthetic-version');return structuredClone(authority);};
  service=await createPublicationService({path:dir+'/journal.json',auditPath:dir+'/events.jsonl',site:wrapped,organization_id:'synthetic-org',authorize,authorizeRead:authorize});
  const dispatch=(action,input)=>service.dispatch('fixture-owner',action,input),intent=await dispatch('preview',{version_id:'synthetic-version'}),input={version_id:'synthetic-version',intent_id:intent.id,page_id:1001,confirm:true};
  await assert.rejects(dispatch('publish',input));assert.equal(posts,1);
  const pending=JSON.parse(await readFile(service.path,'utf8')).events.at(-1).value.operation;assert.equal(pending.id,intent.id);assert.equal(pending.state,'submitting');
  const restart=await service.startAfterCrash(killedPid);assert.notEqual(restart.new_pid,killedPid);
  assert.equal((await dispatch('history',{version_id:'synthetic-version'})).at(-1).state,'unknown');
  await assert.rejects(dispatch('publish',input));await assert.rejects(dispatch('preview',{version_id:'synthetic-version'}));
  const applied=await dispatch('readback',input);assert.equal(applied.id,intent.id);assert.equal(applied.state,'confirmed_applied');assert.equal(posts,1,'cold reconciliation GET only');
  assert.deepEqual(applied.evidence.excerpt_readback.before,initial.excerpt);assert.equal(applied.evidence.excerpt_readback.mode,excerpt?'explicit_strict':'empty_raw_derived');
  if(excerpt)assert.deepEqual(applied.evidence.excerpt_readback.after,initial.excerpt);else assert.notEqual(applied.evidence.excerpt_readback.after.rendered,initial.excerpt.rendered);
  const controlAfterPublish=site.controlSnapshot();assert.deepEqual(controlAfterPublish,controlBefore);
  // Corrupt only the received edit-context response, never the WP store or grant.
  // These are transport fault injections on real WP data, not native extra writes.
  const denials=[];
  for(const [name,mutate]of [['raw',p=>p.excerpt.raw='unexpected'],['protected',p=>p.excerpt.protected=true],['missing',p=>delete p.excerpt.raw],['type',p=>p.excerpt.rendered=0],['slug',p=>p.slug='drift'],...(excerpt?[['explicit-rendered',p=>p.excerpt.rendered='drift']]:[])]){
   readbackDrift=mutate;await assert.rejects(dispatch('restore',input));assert.equal(posts,1);denials.push(name);
  }
  readbackDrift=null;
  const restored=await dispatch('restore',input);assert.equal(restored.state,'restored');assert.equal(posts,2);assert.deepEqual(restored.restore_excerpt_readback.after,initial.excerpt);assert.deepEqual(restored.evidence,applied.evidence);
  const final=(await site.call(site.path(1001))).json();assert.deepEqual(final.excerpt,initial.excerpt);assert.equal(final.title.raw,initial.title.raw);assert.equal(final.content.raw,initial.content.raw);assert.deepEqual(final.meta,initial.meta);
  const controlAfterRestore=site.controlSnapshot();assert.deepEqual(controlAfterRestore,controlBefore);
  assert.deepEqual(site.requestKeys,Array.from({length:2},()=>({method:'POST',keys:['content','meta','title'],meta_keys:['growth_meta_description']})));
  const proof={result:'PASS',scope:'short-lived real WordPress; synthetic authority; not persistent RC A/B',excerpt_mode:excerpt?'explicit':'empty',run:site.run,expires_at:site.expires_at,operation_id:intent.id,restart,posts,receiver_request_keys:site.requestKeys,injected_readback_denials:denials,control_before:controlBefore,control_after_publish:controlAfterPublish,control_after_restore:controlAfterRestore,publication:applied.evidence,restore_excerpt_readback:restored.restore_excerpt_readback};
  await writeFile(dir+'/excerpt-proof.json',JSON.stringify(proof,null,2),{mode:0o600});
  console.log('PASS real WordPress '+proof.excerpt_mode+' excerpt: lost response → SIGKILL/new process → original ID GET-only → API/HTML confirmed → restore; 2 POST; control1002 full page/meta equal; receiver keys only; '+dir);
 }finally{await service?.close();await site?.close();}
}
