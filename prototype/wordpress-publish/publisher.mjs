// Single WordPress adapter. Not deployed: a runner supplies its owned site, authenticated
// saved-version authority and run-local evidence sink. No credentials or URLs from clients.
import {assessPublication} from '../../apps/web/publication-measurement.mjs';
import {randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {canonical} from '../../apps/web/first-result-payload.mjs';
const keys=['title','meta_description','description'];
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export const contentHTML=text=>'<p>'+escape(text)+'</p>';
const textHTML=html=>{const dom=new JSDOM(html);try{return dom.window.document.body.textContent;}finally{dom.window.close();}};
const same=(a,b)=>canonical(a)===canonical(b);
const fields=p=>({title:p.title.raw,meta_description:p.meta.growth_meta_description,description:p.content.raw});
const untouched=p=>Object.fromEntries(['id','date','date_gmt','slug','status','type','link','author','excerpt','parent','menu_order','comment_status','ping_status','template','featured_media'].map(k=>[k,p[k]]));
export function createWordpressPublisher({site,authorize,authorizeRead=authorize,record=async()=>{}}){
 const intents=new Map();let busy=false;const ledger=[];
 async function page(){const r=await site.call(site.path(site.target));if(r.status!==200)throw Error('WordPress read denied ('+r.status+')');const p=r.json();if(p.id!==site.target||p.link!==site.targetURL)throw Error('WordPress page identity mismatch');return p;}
 async function authority(token,version){const a=await authorize(token,version);if(a.review_status!=='exact_version_confirmed'||!a.binding.review_id||a.target_url!==site.targetURL)throw Error('Exact reviewed version / candidate page required');return a;}
 async function owner(token,intent){const a=await authority(token,intent.version);if(!same(a.binding,intent.binding)||!same(keys.map(k=>a.fields[k].after),keys.map(k=>intent.values[k])))throw Error('Version/source/tenant changed');return a;}
 const publicIntent=i=>({id:i.id,version:i.version,binding:i.binding,page_id:site.target,target_url:site.targetURL,state:i.state,fields:Object.fromEntries(keys.map(k=>[k,{before:k==='description'?textHTML(i.before.content.raw):fields(i.before)[k],after:i.values[k]}])),first_published_at:i.before.date_gmt+'Z',modified_at:i.before.modified_gmt+'Z',preview_observed_at:i.observed,restore_started_at:i.restore_started_at??null,restore_observed_at:i.restore_observed_at??null,evidence:i.evidence??null});
 async function save(i){const value=publicIntent(i);ledger.push(structuredClone(value));await record(value);return value;}
 async function reconcile(i){
  const p=await page(),observed_at=new Date().toISOString();
  if(!same(untouched(p),untouched(i.before))){i.state='state_diverged';return save(i);}
  const applied=same(fields(p),i.after),before=same(fields(p),fields(i.before));
  if(!applied){const restoring=i.state.startsWith('restore');i.state=before?(restoring?'restored':'confirmed_not_applied'):'state_diverged';if(i.state==='restored')i.restore_observed_at=observed_at;return save(i);}
  const html=await site.call('/bolt/',{authenticated:false});if(html.status!==200)throw Error('HTML readback unavailable');
  const dom=new JSDOM(html.text),doc=dom.window.document;
  try{if(doc.title!==i.values.title||doc.querySelectorAll('meta[name="description"]').length!==1||doc.querySelector('meta[name="description"]').content!==i.values.meta_description||doc.querySelector('article')?.dataset.pageId!==String(site.target)||doc.querySelector('article p')?.textContent!==i.values.description)throw Error('HTML fields / page identity mismatch');}finally{dom.window.close();}
  i.state='confirmed_applied';i.appliedRevision=p.growth_revision;
  i.evidence={scope:'isolated_wordpress',binding:i.binding,page_id:p.id,target_url:p.link,first_published_at:p.date_gmt+'Z',modified_at:p.modified_gmt+'Z',observed_at,api_fields:fields(p),html_fields:{...i.values},before_revision:i.before.growth_revision,after_revision:p.growth_revision,traffic:'unknown',platform_grant:'run_only'};
  return save(i);
 }
 return {
  async dispatch(token,action,input){
   if(busy)throw Error('Operation in progress');busy=true;
   try{
    if(action==='preview'){
     const a=await authority(token,input.version_id);
     if([...intents.values()].some(i=>same(i.binding.organization_id,a.binding.organization_id)&&['submitting','unknown','restore_submitting','restore_unknown','state_diverged'].includes(i.state)))throw Error('Unresolved submission: readback only');
     const before=await page(),values=Object.fromEntries(keys.map(k=>[k,a.fields[k].after]));
     if(keys.some(k=>typeof values[k]!=='string'||!values[k].trim()))throw Error('Invalid fields');
     // WP sanitizes meta/title; this slice supports plain single-line metadata and text body.
     if(/[<>\r\n]/.test(values.title+values.meta_description))throw Error('WordPress metadata requires plain single-line text');
     const i={id:randomUUID(),version:input.version_id,binding:a.binding,values,before,after:{...values,description:contentHTML(values.description)},state:'preview',observed:new Date().toISOString()};intents.set(i.id,i);return publicIntent(i);
    }
    if(['history','measurement','measurement-save'].includes(action)) {
     const a=await authorizeRead(token,input.version_id);
     const history=ledger.filter(v=>!v.kind&&v.binding.organization_id===a.binding.organization_id&&v.version===input.version_id);
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
      await record(entry);ledger.push(entry);data=entry.data;
     }
     let assessment;try{assessment=assessPublication(publication,data);}catch(error){
      // Saved observations survive restoration, but their former applicability does not.
      try{assessment=assessPublication(publication,{baseline:data.baseline,followup:null});}catch{assessment=assessPublication(publication);}
      assessment.unknown.push('原保存觀測現已不適用：'+error.message);
     }
     return structuredClone({binding:a.binding,target_url:a.target_url,publication,publications,data,assessment});
    }
    const i=intents.get(input.intent_id);if(!i)throw Error('Unknown publication intent');await owner(token,i);
    if(action==='publish'){
     if(input.confirm!==true||input.page_id!==site.target||i.state!=='preview')throw Error('Independent target confirmation required / already attempted');
     const current=await page();if(current.growth_revision!==i.before.growth_revision)throw Error('Page changed since preview');
     await owner(token,i);i.state='submitting';await save(i); // No retry once dispatched, even on lost reply.
     try{const r=await site.call(site.path(site.target),{method:'POST',headers:{'x-growth-before':i.before.growth_revision},body:{title:i.values.title,content:i.after.description,meta:{growth_meta_description:i.values.meta_description}}});if(r.status!==200){i.state='unknown';await save(i);return reconcile(i);}return await reconcile(i);}catch{i.state='unknown';return save(i);}
    }
    if(action==='readback'){if(i.state==='preview')throw Error('Nothing submitted');return await reconcile(i);}
    if(action==='restore'){
     if(input.confirm!==true||i.state!=='confirmed_applied')throw Error('Verified publication and restore confirmation required');
     const current=await page();if(current.growth_revision!==i.appliedRevision||!same(fields(current),i.after)||!same(untouched(current),untouched(i.before)))throw Error('Restore blocked: current state diverged');
     i.state='restore_submitting';i.restore_started_at=new Date().toISOString();await save(i);
     try{const r=await site.call(site.path(site.target),{method:'POST',headers:{'x-growth-before':current.growth_revision},body:{title:i.before.title.raw,content:i.before.content.raw,meta:{growth_meta_description:i.before.meta.growth_meta_description}}});if(r.status!==200)throw Error('Restore reply failed');const after=await page();if(!same(fields(after),fields(i.before))||!same(untouched(after),untouched(i.before)))throw Error('Restore readback mismatch');i.state='restored';i.restore_observed_at=new Date().toISOString();return save(i);}catch{i.state='restore_unknown';return save(i);}
    }
    throw Error('Unsupported operation');
   }finally{busy=false;}
  }
 };
}
