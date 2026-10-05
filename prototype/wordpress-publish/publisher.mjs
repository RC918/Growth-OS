// Single WordPress adapter. Not deployed: a runner supplies its owned site, authenticated
// saved-version authority and run-local evidence sink. No credentials or URLs from clients.
import {assessPublication} from '../../apps/web/publication-measurement.mjs';
import {randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {canonical} from '../../apps/web/first-result-payload.mjs';
import {preservedFields,excerptObservation} from './preserved.mjs';
const keys=['title','meta_description','description'];
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export const contentHTML=text=>'<p>'+escape(text)+'</p>';
const textHTML=html=>{const dom=new JSDOM(html);try{return dom.window.document.body.textContent;}finally{dom.window.close();}};
const same=(a,b)=>canonical(a)===canonical(b);
const fields=p=>({title:p.title.raw,meta_description:p.meta.growth_meta_description,description:p.content.raw});
const unchanged=(a,b)=>{try{return same(preservedFields(a),preservedFields(b));}catch{return false;}};
export function createWordpressPublisher({site,authorize,authorizeRead=authorize,record=async()=>{},journal=null,profile=null,authorizeReconcile=null,beforeSubmit=async()=>{}}){
 const intents=new Map();let busy=false;const ledger=[];
 async function page(){const r=await site.call(site.path(site.target));if(r.status!==200)throw Error('WordPress read denied ('+r.status+')');const p=r.json();if(p.id!==site.target||p.link!==site.targetURL)throw Error('WordPress page identity mismatch');return p;}
 async function authority(token,version){const a=await authorize(token,version);if(a.review_status!=='exact_version_confirmed'||!a.binding.review_id||a.target_url!==site.targetURL)throw Error('Exact reviewed version / candidate page required');return a;}
 async function owner(token,intent){const a=await authority(token,intent.version);if(!same(a.binding,intent.binding)||!same(keys.map(k=>a.fields[k].after),keys.map(k=>intent.values[k])))throw Error('Version/source/tenant changed');return a;}
 const publicIntent=i=>({id:i.id,version:i.version,binding:i.binding,page_id:site.target,target_url:site.targetURL,state:i.state,fields:Object.fromEntries(keys.map(k=>[k,{before:k==='description'?textHTML(i.before.content.raw):fields(i.before)[k],after:i.values[k]}])),first_published_at:i.before.date_gmt+'Z',modified_at:i.before.modified_gmt+'Z',preview_observed_at:i.observed,restore_started_at:i.restore_started_at??null,restore_observed_at:i.restore_observed_at??null,restore_excerpt_readback:i.restore_excerpt_readback??null,evidence:i.evidence??null});
 async function save(i){const value=publicIntent(i);await journal?.append({kind:'operation',operation:structuredClone(i)});await record(value);ledger.push(structuredClone(value));return value;}
 // Reconstruct cold state exclusively from complete durable records; no credential is replayed.
 for(const event of journal?.entries??[]){
  if(event.kind==='operation'){
   const i=structuredClone(event.operation),old=intents.get(i?.id);
   const allowed=['id','version','binding','values','before','after','state','observed','appliedRevision','evidence','restore_started_at','restore_observed_at','restore_excerpt_readback'];
   if(!i||Object.keys(i).some(k=>!allowed.includes(k))||typeof i.id!=='string'||!i.id||i.version!==i.binding?.version_id||!i.binding?.organization_id||!i.binding?.review_id||!keys.every(k=>typeof i.values?.[k]==='string'&&typeof i.after?.[k]==='string')||i.before?.id!==site.target||i.before?.link!==site.targetURL||typeof i.before?.growth_revision!=='string'||!Number.isFinite(Date.parse(i.observed))||!['preview','submitting','unknown','confirmed_applied','confirmed_not_applied','state_diverged','restore_submitting','restore_unknown','restored'].includes(i.state))throw Error('Incomplete operation record');
   if(!same(i.after,{...i.values,description:contentHTML(i.values.description)})||(old&&!same([old.version,old.binding,old.values,old.before,old.after],[i.version,i.binding,i.values,i.before,i.after]))||(!old&&i.state!=='preview')||(old&&i.state==='preview'))throw Error('Operation binding / sequence mismatch');
   if(['confirmed_applied','restore_submitting','restore_unknown','restored'].includes(i.state)&&(!i.evidence||typeof i.appliedRevision!=='string'))throw Error('Incomplete applied evidence');
   if(i.state.startsWith('restore')&&!Number.isFinite(Date.parse(i.restore_started_at)))throw Error('Incomplete restore record');
   if(i.evidence&&(!same(i.evidence.binding,i.binding)||i.evidence.page_id!==site.target||i.evidence.target_url!==site.targetURL))throw Error('Evidence binding mismatch');
   preservedFields(i.before);
   intents.set(i.id,i);ledger.push(publicIntent(i));
  }else if(event.kind==='measurement'){
   const i=intents.get(event.publication_id);if(!i?.evidence||i.version!==event.version||!same(i.binding,event.binding)||!Number.isFinite(Date.parse(event.saved_at)))throw Error('Measurement binding mismatch');
   assessPublication(publicIntent(i),event.data,Date.parse(event.saved_at));ledger.push(structuredClone(event));
  }else throw Error('Unknown journal record');
 }
 for(const i of intents.values())if(['submitting','restore_submitting'].includes(i.state)){
  i.state=i.state==='submitting'?'unknown':'restore_unknown';
  // Projection only. The durable submitting record remains the evidence of an uncertain dispatch.
  ledger.push(publicIntent(i));
 }
 async function verifyHTML(values){
  const html=await site.call(new URL(site.targetURL).pathname,{authenticated:false});if(html.status!==200)throw Error('HTML readback unavailable');
  const dom=new JSDOM(html.text),doc=dom.window.document;
  try{if(doc.title!==values.title||doc.querySelectorAll('meta[name="description"]').length!==1||doc.querySelector('meta[name="description"]').content!==values.meta_description||doc.querySelector('article')?.dataset.pageId!==String(site.target)||doc.querySelector('article p')?.textContent!==values.description)throw Error('HTML fields / page identity mismatch');}finally{dom.window.close();}
 }
 async function reconcile(i){
  const p=await page(),observed_at=new Date().toISOString();
  if(!unchanged(p,i.before)){i.state='state_diverged';return save(i);}
  const applied=same(fields(p),i.after),before=same(fields(p),fields(i.before));
  if(!applied){
   const state=before?(i.state.startsWith('restore')?'restored':'confirmed_not_applied'):'state_diverged';
   if(state==='restored'){await verifyHTML({...fields(i.before),description:textHTML(i.before.content.raw)});i.restore_observed_at=observed_at;i.restore_excerpt_readback=excerptObservation(i.before,p);}
   i.state=state;return save(i);
  }
  await verifyHTML(i.values);
  i.state='confirmed_applied';i.appliedRevision=p.growth_revision;
  i.evidence={scope:profile?.scope??'isolated_wordpress',...(profile?{environment:profile.environment}:{}),binding:i.binding,page_id:p.id,target_url:p.link,first_published_at:p.date_gmt+'Z',modified_at:p.modified_gmt+'Z',observed_at,api_fields:fields(p),html_fields:{...i.values},excerpt_readback:excerptObservation(i.before,p),before_revision:i.before.growth_revision,after_revision:p.growth_revision,traffic:'unknown',platform_grant:profile?.platform_grant??'run_only'};
  return save(i);
 }
 return {
  async dispatch(token,action,input){
   journal?.assertHealthy();if(busy)throw Error('Operation in progress');busy=true;
   try{
    if(action==='preview'){
     const a=await authority(token,input.version_id);
     if([...intents.values()].some(i=>same(i.binding.organization_id,a.binding.organization_id)&&['submitting','unknown','restore_submitting','restore_unknown','state_diverged'].includes(i.state)))throw Error('Unresolved submission: readback only');
     const before=await page(),values=Object.fromEntries(keys.map(k=>[k,a.fields[k].after]));
     preservedFields(before); // Refuse incomplete baseline before any intent/POST.
     if(keys.some(k=>typeof values[k]!=='string'||!values[k].trim()))throw Error('Invalid fields');
     // WP sanitizes meta/title; this slice supports plain single-line metadata and text body.
     if(/[<>\r\n]/.test(values.title+values.meta_description))throw Error('WordPress metadata requires plain single-line text');
     const i={id:randomUUID(),version:input.version_id,binding:a.binding,values,before,after:{...values,description:contentHTML(values.description)},state:'preview',observed:new Date().toISOString()};intents.set(i.id,i);return save(i);
    }
    if(['history','measurement','measurement-save'].includes(action)) {
     if(profile&&action!=='history')throw Error('真資料量測尚未接入；目前效果未知');
     const a=await authorizeRead(token,input.version_id);
     const history=ledger.filter(v=>!v.kind&&v.state!=='preview'&&v.binding.organization_id===a.binding.organization_id&&v.version===input.version_id);
     if(history.some(v=>!same(v.binding,a.binding)||v.target_url!==a.target_url))throw Error('Historical publication binding changed');
     if(action==='history')return structuredClone(history);
     const all=[...new Map(ledger.filter(v=>!v.kind&&v.evidence&&v.binding.organization_id===a.binding.organization_id&&v.target_url===a.target_url).map(v=>[v.id,v])).values()];
     const publications=[...new Map(history.filter(v=>v.evidence).map(v=>[v.id,v])).values()].map(v=>{const next=all.slice(all.findIndex(x=>x.id===v.id)+1)[0];return {...v,superseded_at:next?.evidence.modified_at??null};});
     const publication=input.publication_id?publications.find(v=>v.id===input.publication_id):publications.at(-1)??null;
     if(input.publication_id&&!publication)throw Error('Publication not in this exact version');
     let data=publication?ledger.findLast(v=>v.kind==='measurement'&&v.publication_id===publication.id&&same(v.binding,a.binding))?.data??{baseline:null,followup:null}:{baseline:null,followup:null};
     if(action==='measurement-save'){
      if(!publication)throw Error('Verified publication required');
      if(!input.data||Object.keys(input.data).sort().join(',')!=='baseline,followup'||JSON.stringify(input.data).length>2100000)throw Error('Invalid observation envelope');
      assessPublication(publication,input.data); // Recompute before persistence; never accept supplied totals.
      const entry={kind:'measurement',version:input.version_id,publication_id:publication.id,binding:a.binding,data:structuredClone(input.data),saved_at:new Date().toISOString()};
      await journal?.append(entry);await record(entry);ledger.push(entry);data=entry.data;
     }
     let assessment;try{assessment=assessPublication(publication,data);}catch(error){
      // Saved observations survive restoration, but their former applicability does not.
      try{assessment=assessPublication(publication,{baseline:data.baseline,followup:null});}catch{assessment=assessPublication(publication);}
      assessment.unknown.push('原保存觀測現已不適用：'+error.message);
     }
     return structuredClone({binding:a.binding,target_url:a.target_url,publication,publications,data,assessment});
    }
    const i=intents.get(input.intent_id);if(!i)throw Error('Unknown publication intent');if((input.version_id!==undefined&&input.version_id!==i.version)||(input.page_id!==undefined&&input.page_id!==site.target))throw Error('Operation version / page mismatch');
    if(action==='readback'&&authorizeReconcile){const a=await authorizeReconcile(token,i.version);if(!same(a.binding,i.binding)||a.target_url!==site.targetURL)throw Error('Reconciliation binding changed');}else await owner(token,i);
    if(action==='publish'){
     if([...intents.values()].some(other=>other.id!==i.id&&['submitting','unknown','restore_submitting','restore_unknown','state_diverged'].includes(other.state)))throw Error('Unresolved submission: readback only');
     if(input.confirm!==true||input.page_id!==site.target||i.state!=='preview')throw Error('Independent target confirmation required / already attempted');
     const current=await page();if(current.growth_revision!==i.before.growth_revision)throw Error('Page changed since preview');
     await owner(token,i);await beforeSubmit('publish',i);i.state='submitting';await save(i); // No retry once dispatched, even on lost reply.
     try{const r=await site.call(site.path(site.target),{method:'POST',headers:{'x-growth-before':i.before.growth_revision},body:{title:i.values.title,content:i.after.description,meta:{growth_meta_description:i.values.meta_description}}});if(r.status!==200){i.state='unknown';await save(i);return reconcile(i);}return await reconcile(i);}catch{i.state='unknown';return save(i);}
    }
    if(action==='readback'){if(i.state==='preview')throw Error('Nothing submitted');return await reconcile(i);}
    if(action==='restore'){
     if(input.confirm!==true||i.state!=='confirmed_applied'||i.restore_started_at)throw Error('Verified publication and restore confirmation required');
     const current=await page();if(current.growth_revision!==i.appliedRevision||!same(fields(current),i.after)||!unchanged(current,i.before))throw Error('Restore blocked: current state diverged');
     await beforeSubmit('restore',i);i.state='restore_submitting';i.restore_started_at=new Date().toISOString();await save(i);
     try{const r=await site.call(site.path(site.target),{method:'POST',headers:{'x-growth-before':current.growth_revision},body:{title:i.before.title.raw,content:i.before.content.raw,meta:{growth_meta_description:i.before.meta.growth_meta_description}}});if(r.status!==200)throw Error('Restore reply failed');const after=await page();if(!same(fields(after),fields(i.before))||!unchanged(after,i.before))throw Error('Restore readback mismatch');await verifyHTML({...fields(i.before),description:textHTML(i.before.content.raw)});i.restore_excerpt_readback=excerptObservation(i.before,after);i.state='restored';i.restore_observed_at=new Date().toISOString();return save(i);}catch{i.state='restore_unknown';return save(i);}
    }
    throw Error('Unsupported operation');
   }finally{busy=false;}
  }
 };
}
