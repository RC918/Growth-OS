// Candidate only: one controlled site, original Auth/RLS authority, one durable journal.
// No test-session issuer, Auth implementation, database admin or credential writer here.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {openRunJournal} from '../wordpress-publish/journal.mjs';
import {createWordpressPublisher} from '../wordpress-publish/publisher.mjs';
import {publicationAuthority} from './authority.mjs';
const actions=new Set(['preview','publish','readback','restore','history','measurement','measurement-save']);
const tables=new Set(['organization_members','organizations','business_profiles','sites','growth_opportunities','opportunity_sources','opportunity_decisions','content_versions','content_reviews','content_action_plans','search_observation_versions','growth_goals','growth_goal_turns','audit_events']);
const send=(res,status,value,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(type==='application/json'?JSON.stringify(value):value);};
async function body(req){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>3_000_000)throw Error('Request limit');parts.push(part);}return JSON.parse(Buffer.concat(parts).toString());}
export function validateConfig(c){
 const u=new URL(c.listen_origin);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.pathname!=='/'||!u.port)throw Error('Candidate listener must be explicit loopback HTTP behind approved TLS');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.backend_origin)||!c.public_key?.startsWith('sb_publishable_'))throw Error('Invalid logical workspace backend');
 if(!c.bound?.run||!c.bound.journal_id||!c.bound.organization_id||!Number.isInteger(c.bound.page_id)||!Number.isFinite(c.bound.expires_at)||!c.journal_path?.startsWith('/'))throw Error('Missing fixed durable binding');
 if(c.backend_origin==='https://vhzryhibmpvglzcmfnaa.supabase.co'&&!c.isolated_transport)throw Error('Existing hosted project is outside RC candidate');
 const p=new URL(c.bound.target_url);if(p.protocol!=='https:'||p.username||p.password||p.pathname!=='/bolt/'||p.search||p.hash)throw Error('Single controlled HTTPS page required');
 return c;
}
export async function createRcServer({config,site,upstreamFetch,scan,record=async()=>{},onError=()=>{}}){
 const c=validateConfig(config),journal=openRunJournal(c.journal_path,c.bound);
 if(site.target!==c.bound.page_id||site.targetURL!==c.bound.target_url)throw Error('Original site binding changed');
 const authority=publicationAuthority({origin:c.backend_origin,key:c.public_key,redirectOrigin:c.public_origin??c.listen_origin,fetchImpl:upstreamFetch});
 async function authorize(token,id,readonly){
  if(Date.now()>=c.bound.expires_at)throw Error('Original grant expired');
  const a=await authority(token,id,readonly);if(a.binding.organization_id!==c.bound.organization_id||a.target_url!==c.bound.target_url)throw Error('RC tenant / page mismatch');
  const r=await site.call(site.path(site.target));if(r.status!==200||r.json().id!==site.target||r.json().link!==site.targetURL)throw Error('Original platform grant unavailable');return a;
 }
 const publisher=createWordpressPublisher({site,journal,record,authorize:(t,id)=>authorize(t,id,false),authorizeRead:(t,id)=>authorize(t,id,true)});
 const server=createServer(async(req,res)=>{
  try{
   const u=new URL(req.url,c.listen_origin);if(u.origin!==c.listen_origin||req.headers.host!==new URL(c.listen_origin).host)throw Error('Host mismatch');
   if(req.headers.origin&&req.headers.origin!==(c.public_origin??c.listen_origin))throw Error('Origin mismatch');
   if(Date.now()>=c.bound.expires_at)throw Error('RC window closed');
   if(req.method==='GET'&&u.pathname==='/health')return send(res,200,{run:c.bound.run,journal:c.bound.journal_id});
   if(req.method==='POST'&&u.pathname.startsWith('/api/wordpress-publication/')){
    const action=u.pathname.slice('/api/wordpress-publication/'.length);if(!actions.has(action)||u.search)throw Error('Unknown publication route');
    const token=/^Bearer ([^\s]+)$/.exec(req.headers.authorization??'')?.[1];if(!token)throw Error('Bearer required');
    return send(res,200,await publisher.dispatch(token,action,await body(req)));
   }
   if(req.method==='POST'&&u.pathname==='/api/product-source'&&!u.search){
    const input=await body(req);if(Object.keys(input).join(',')!=='url'||input.url!==c.bound.target_url)throw Error('Only approved source page');
    return send(res,200,await scan(input.url));
   }
   if(u.pathname.startsWith('/backend/')){
    const path=u.pathname.slice('/backend'.length);let allowed=req.method==='GET'&&(path==='/auth/v1/user'||tables.has(path.replace(/^\/rest\/v1\//,''))&&path.startsWith('/rest/v1/'));
    allowed ||=req.method==='POST'&&['/rest/v1/rpc/save_url_result_draft','/rest/v1/rpc/review_url_result'].includes(path);
    if(!allowed)throw Error('Backend route denied'); // no signup, OTP, token mint, admin or arbitrary RPC proxy
    const token=/^Bearer ([^\s]+)$/.exec(req.headers.authorization??'')?.[1];if(!token)throw Error('Bearer required');
    const value=req.method==='POST'?await body(req):undefined;
    const r=await upstreamFetch(c.backend_origin+path+u.search,{method:req.method,redirect:'error',headers:{authorization:'Bearer '+token,apikey:c.public_key,'content-type':'application/json'},...(value?{body:JSON.stringify(value)}:{})});
    return send(res,r.status,await r.json());
   }
   if(req.method!=='GET'||u.search||!/^\/[a-z0-9.-]+$/.test(u.pathname))return send(res,404,{});
   if(u.pathname==='/workspace-runtime.mjs')return send(res,200,`export const workspaceRuntime=${JSON.stringify({origin:c.backend_origin,key:c.public_key})};\nexport const workspaceFetch=(url,options)=>{const u=new URL(url,location.origin);if(u.origin===location.origin&&u.pathname.startsWith('/api/wordpress-publication/'))return fetch(u.href,options);if(u.origin!==workspaceRuntime.origin)throw Error('Backend mismatch');return fetch('/backend'+u.pathname+u.search,options);};`,'text/javascript');
   if(u.pathname==='/url-result-config.mjs')return send(res,200,'export const urlSaveEnabled=true,urlResultSchemaEnabled=true,urlSaveTrial=null,urlReviewEnabled=true,urlReviewSchemaEnabled=true,urlReviewTrial=null;','text/javascript');
   if(u.pathname==='/wordpress-publication-config.mjs')return send(res,200,'export const wordpressPublicationEnabled=true;','text/javascript');
   const data=await readFile(new URL('../../apps/web'+u.pathname,import.meta.url));return send(res,200,data,u.pathname.endsWith('.mjs')?'text/javascript':u.pathname.endsWith('.css')?'text/css':'text/html');
  }catch(error){onError(error);if(!res.headersSent)send(res,403,{error:'RC request denied; uncertain mutations require readback, never automatic retry'});else res.destroy();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(new URL(c.listen_origin).port),'127.0.0.1',resolve);});
 return {close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));},address:c.listen_origin};
}
