// Undeployed single-site candidate. Configuration and transport are server-only.
import {createWordpressPublisher} from '../wordpress-publish/publisher.mjs';
import {publicationAuthority} from '../internal-rc/authority.mjs';
import {canonical} from '../../apps/web/first-result-payload.mjs';
import {openStore} from './store.mjs';
export function validateBinding(b){
 if(!b||Object.keys(b).sort().join(',')!=='organization_id,page_id,pilot_id,target_url'||!['organization_id','pilot_id'].every(k=>typeof b[k]==='string'&&b[k].trim())||!Number.isSafeInteger(b.page_id)||b.page_id<1)throw Error('Single-site binding required');
 const u=new URL(b.target_url);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.href!==b.target_url||u.pathname==='/')throw Error('Exact HTTPS page required');
 return structuredClone(b);
}
export function createPilotService({config,site,fetchImpl,now=Date.now}){
 config=structuredClone(config);
 if(config?.enabled!==true)throw Error('Pilot candidate closed');
 const binding=validateBinding(config.binding);
 if(!['isolated_fixture','owner_site'].includes(config.evidence_environment))throw Error('Explicit evidence environment required');
 if(site.target!==binding.page_id||site.targetURL!==binding.target_url||typeof fetchImpl!=='function')throw Error('Server transport / binding required');
 const authority=publicationAuthority({...config.authority,fetchImpl,includeVersionCutoff:config.gsc_measurement_enabled===true});
 const store=openStore(config.storage_directory,binding);
 const grant=(kind)=>{
  const g=config[kind+'_grant'];
  if(!g||g.pilot_id!==binding.pilot_id||typeof g.approval_reference!=='string'||!g.approval_reference.trim()||!Number.isSafeInteger(g.starts_at)||!Number.isSafeInteger(g.expires_at)||now()<g.starts_at||now()>=g.expires_at)throw Error('Explicit '+kind+' grant unavailable or expired');
 };
 const authorized=async(token,id,readonly)=>{
  const a=await authority(token,id,readonly);
  if(a.binding.organization_id!==binding.organization_id||a.target_url!==binding.target_url)throw Error('Pilot workspace / page denied');
  return a;
 };
 const write=()=>{store.journal.assertHealthy();if(store.restored)throw Error('Recovered archive is readonly');grant('write');};
 const path=site.path(binding.page_id),htmlPath=new URL(binding.target_url).pathname;
 const constrainedSite={target:binding.page_id,targetURL:binding.target_url,path:id=>{if(id!==binding.page_id)throw Error('Page denied');return path;},call:async(p,o={})=>{
  const method=o.method??'GET';if(![path,htmlPath].includes(p)||!['GET','POST'].includes(method)||method==='POST'&&p!==path)throw Error('Route denied');
  if(method==='POST'){
   write();if(Object.keys(o.body??{}).sort().join(',')!=='content,meta,title'||Object.keys(o.body.meta??{}).join(',')!=='growth_meta_description')throw Error('Fields denied');
  }else grant('read');
  return site.call(p,o);
 }};
 try{
  const publisher=createWordpressPublisher({site:constrainedSite,journal:store.journal,
   profile:{scope:'single_site_wordpress',platform_grant:'explicit_single_site',environment:config.evidence_environment,gsc_enabled:config.gsc_measurement_enabled===true},
   authorize:async(t,id)=>{const a=await authorized(t,id,false);write();return a;},
   authorizeRead:(t,id)=>authorized(t,id,true),authorizeReconcile:(t,id)=>authorized(t,id,true),
   beforeMeasurementSave:async(t,id,a)=>{write();const fresh=await authorized(t,id,true);write();if(canonical(fresh)!==canonical(a))throw Error('Measurement authority changed');},
   beforeSubmit:async(kind)=>{write();const consumed=new Set(store.entries().filter(e=>e.kind==='operation'&&e.operation.state===(kind==='publish'?'submitting':'restore_submitting')).map(e=>e.operation.id));if(consumed.size>=1)throw Error('Single pilot '+kind+' attempt already consumed');}
  });
  return {binding,backup:destination=>store.backup(destination),close:()=>store.close(),
   async dispatch(token,action,input){
    if(!['preview','publish','readback','restore','history','measurement','measurement-save'].includes(action))throw Error('Unsupported operation');
    if(store.restored&&!['history','measurement'].includes(action))throw Error('Recovered archive supports historical reads only');
    if(!input||typeof input.version_id!=='string')throw Error('Exact version required');
    // Client fields cannot replace the server's target or grant.
    const allowed=['version_id','intent_id','page_id','confirm',...(['measurement','measurement-save'].includes(action)?['publication_id']:[]),...(action==='measurement-save'?['data']:[])];if(Object.keys(input).some(k=>!allowed.includes(k)))throw Error('Unexpected publication input');
    const result=await publisher.dispatch(token,action,input);
    if(['measurement','measurement-save'].includes(action)){let writable=false;try{write();writable=true;}catch{}return {...result,measurement_write_available:writable};}
    return result;
   },
   async handle(request){
    if(request.method!=='POST')return Response.json({error:'POST required'},{status:405});
    const u=new URL(request.url);if(!/^\/api\/wordpress-publication\/[a-z-]+$/.test(u.pathname)||u.search)return Response.json({error:'Route denied'},{status:404});
    const header=request.headers.get('authorization')??'';if(!/^Bearer \S+$/.test(header))return Response.json({error:'Authentication required'},{status:401});
    try{const limit=u.pathname.endsWith('/measurement-save')&&config.gsc_measurement_enabled===true?2100000:4096;const reader=request.body?.getReader();let size=0;const chunks=[];if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('Input too large');}chunks.push(value);}const bytes=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));const result=await this.dispatch(header.slice(7),u.pathname.split('/').at(-1),JSON.parse(bytes));return Response.json(result,{headers:{'cache-control':'no-store'}});}catch(error){return Response.json({error:error.message},{status:403,headers:{'cache-control':'no-store'}});}
   }
  };
 }catch(e){store.close();throw e;}
}
