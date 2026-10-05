// TEST RUNNER ONLY. Never imported by apps/web or a deployed API.
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {reviewGrant} from '../../supabase/drafts/url_review/fixture.mjs';
import {PGlite} from '@electric-sql/pglite';
import {bootstrapSQL,seedSQL,ids} from '../../supabase/drafts/first_result_save/fixtures.mjs';
export const mode='growth-os-isolated-regression',target='http://127.0.0.1:8791',backend='https://vhzryhibmpvglzcmfnaa.supabase.co';
const owned=new WeakMap(),actors=Object.freeze({owner:ids.owner,viewer:ids.viewer,foreign:ids.foreign});
export function validateOptions(options){if(options?.mode!==mode||options?.target!==target)throw Error('Isolated regression mode and exact runner target required');}
function requireIsolation(options){
 validateOptions(options);const r=owned.get(options.isolation);
 if(!r||!r.alive||!r.server.listening||r.server.address()?.address!=='127.0.0.1'||r.server.address()?.port!==8791||!r.db)throw Error('Runner-owned server and disposable DB identity required');
 return r;
}
export const redact=error=>String(error?.message??error).replace(/#access_token=[^\s"'<>]+/g,'#[redacted]').replace(/synthetic-session-[a-z0-9-]+/gi,'[redacted]').replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer [redacted]');
export async function createSessionRig(options){
 validateOptions(options); // Before listening, constructing DB, reading fixtures or doing any IO.
 const r={alive:false,server:null,db:null,tokens:new Map(),run:randomUUID(),chain:Promise.resolve(),sqlCalls:0,mutations:0,denied:0,lastSave:null,lastReview:null};
 const isolation=Object.freeze({});
 try{
  r.server=createServer(async(req,res)=>{
   res.setHeader('x-regression-run',r.run);
   try{const u=new URL(req.url,target);if(req.method!=='GET'||!/^\/[a-z0-9.-]+$/.test(u.pathname))throw Error('asset');
    const data=await readFile(new URL('../../apps/web'+u.pathname,import.meta.url));res.setHeader('content-type',u.pathname.endsWith('.mjs')?'text/javascript':u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.html')?'text/html':'application/octet-stream');res.end(data);
   }catch{res.writeHead(404);res.end();}
  });
  await new Promise((resolve,reject)=>{r.server.once('error',reject);r.server.listen(8791,'127.0.0.1',resolve);});
  r.db=await PGlite.create(); // Memory only: no URL/path/admin API parameter accepted.
  let sql=bootstrapSQL;for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())sql+=(await readFile('supabase/migrations/'+f,'utf8')).replace('create extension if not exists pgcrypto;','');
  sql+=seedSQL;for(const f of ['first_result_save/proposal.sql','first_result_save/disable_writes.sql','url_result/proposal.sql','url_review/proposal.sql'])sql+=await readFile('supabase/drafts/'+f,'utf8');
  await r.db.exec(sql+'grant execute on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated;'+reviewGrant);
  r.alive=true;owned.set(isolation,r);
  const config={...options,isolation};
  return {
   isolation,
   issue(role,{ttlMs=60000}={}){requireIsolation(config);if(!Object.hasOwn(actors,role)||!Number.isInteger(ttlMs)||ttlMs<1||ttlMs>120000)throw Error('Fixed fixture role and short TTL required');const value='synthetic-session-'+randomUUID();r.tokens.set(value,{actor:actors[role],expires:Date.now()+ttlMs});return value;},
   retire(value){requireIsolation(config);r.tokens.delete(value);}, // Runner lifecycle only; not product signOut/token revocation.
   async asset(path){requireIsolation(config);if(!/^\/[a-z0-9.-]+$/.test(path))throw Error('Unapproved local asset');const response=await fetch(target+path,{redirect:'error'});if(response.headers.get('x-regression-run')!==r.run)throw Error('Local server identity mismatch');return {status:response.status,contentType:response.headers.get('content-type'),body:Buffer.from(await response.arrayBuffer())};},
   async snapshot(){requireIsolation(config);const task=r.chain.then(async()=>{requireIsolation(config);await r.db.exec('reset role');const data={};for(const {tablename}of(await r.db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows){if(!/^[a-z_]+$/.test(tablename))throw Error('Unexpected relation');data[tablename]=(await r.db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') value from public.${tablename} t`)).rows[0].value;}return data;});r.chain=task.catch(()=>{});return task;},
   stats(){requireIsolation(config);return structuredClone({sqlCalls:r.sqlCalls,mutations:r.mutations,denied:r.denied,lastSave:r.lastSave,lastReview:r.lastReview});},
   async close(){if(r.closed)return;r.closed=true;r.alive=false;r.tokens.clear();try{await r.chain.catch(()=>{});if(r.db)await r.db.close();}finally{if(r.server.listening){r.server.closeAllConnections();await new Promise(resolve=>r.server.close(resolve));}}}
  };
 }catch(error){r.alive=false;if(r.db)await r.db.close();if(r.server?.listening){r.server.closeAllConnections();await new Promise(resolve=>r.server.close(resolve));}throw Error(redact(error));}
}
export function createAuthTransport(input){
 const options=Object.freeze({...input}),r=requireIsolation(options);
 const identity=headers=>{const value=(headers?.authorization??headers?.Authorization??'').replace(/^Bearer /,'');const identity=r.tokens.get(value);return identity&&Date.now()<identity.expires?identity:null;};
 return async({url,method='GET',headers={},body})=>{
  requireIsolation(options);const u=new URL(url);
  if(u.origin!==backend)throw Error('Unapproved Auth/data target'); // No fetch fallback exists.
  const actor=identity(headers);
  if(!actor)return {status:401,data:{}};
  if(u.pathname==='/auth/v1/user')return {status:method==='GET'?200:405,data:method==='GET'?{id:actor.actor}:{}};
  if(u.pathname.startsWith('/auth/'))return {status:403,data:{}}; // Never send even synthetic OTP mail.
  const task=r.chain.then(async()=>{
   requireIsolation(options);if(!identity(headers))return {status:401,data:{}};
   try{
    await r.db.exec('begin;set local role authenticated');await r.db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor.actor]);
    const who=(await r.db.query('select current_user as role,auth.uid() as actor')).rows[0];if(who.role!=='authenticated'||who.actor!==actor.actor)throw Error('Authenticated actor scope missing');r.sqlCalls++;
    let data;
    if(method==='POST'){
     if(u.pathname==='/rest/v1/rpc/review_url_result'){
      const p=body;if(!p||Object.keys(p).sort().join(',')!=='p_checks,p_content_digest,p_organization_id,p_request_id,p_source_digest,p_version_digest,p_version_id')throw Error('Invalid Review request shape');
      data=Object.values((await r.db.query('select public.review_url_result($1,$2,$3,$4,$5,$6,$7)',[p.p_organization_id,p.p_version_id,p.p_request_id,p.p_source_digest,p.p_content_digest,p.p_version_digest,JSON.stringify(p.p_checks)])).rows[0])[0];
      await r.db.exec('commit');r.mutations++;r.lastReview={id:data,request:structuredClone(p)};return {status:200,data};
     }
     if(u.pathname!=='/rest/v1/rpc/save_url_result_draft')throw Error('Unapproved mutation route');
     const p=body;if(!p||Object.keys(p).sort().join(',')!=='p_expected_version,p_opportunity_id,p_organization_id,p_payload,p_request_id')throw Error('Invalid Save request shape');
     data=Object.values((await r.db.query('select public.save_url_result_draft($1,$2,$3,$4,$5)',[p.p_organization_id,p.p_opportunity_id,p.p_request_id,p.p_expected_version,JSON.stringify(p.p_payload)])).rows[0])[0];
     await r.db.exec('commit');r.mutations++;r.lastSave={id:data,request:structuredClone(p)};return {status:200,data};
    }
    if(method!=='GET'||!/^\/rest\/v1\/[a-z_]+$/.test(u.pathname))throw Error('Unapproved read route');
    const table=u.pathname.split('/').at(-1),cols=u.searchParams.get('select');if(!/^[a-z_,]+$/.test(cols??''))throw Error('Invalid projection');
    const args=[],where=[];for(const [key,value]of u.searchParams)if(!['select','order','limit'].includes(key)){if(!/^[a-z_]+$/.test(key)||!value.startsWith('eq.'))throw Error('Invalid filter');args.push(value.slice(3));where.push(`${key}=$${args.length}`);}
    let sql=`select ${cols} from public.${table}`+(where.length?' where '+where.join(' and '):'');
    if(u.searchParams.has('order')){const parts=u.searchParams.get('order').split(',');if(!parts.every(p=>/^[a-z_]+\.(asc|desc)$/.test(p)))throw Error('Invalid order');sql+=' order by '+parts.map(p=>p.replace('.',' ')).join(',');}
    if(u.searchParams.has('limit')){const n=Number(u.searchParams.get('limit'));if(!Number.isSafeInteger(n)||n<1||n>501)throw Error('Invalid limit');sql+=' limit '+n;}
    data=(await r.db.query(sql,args)).rows;await r.db.exec('commit');return {status:200,data};
   }catch(error){await r.db.exec('rollback');if(error.code==='42501'){r.denied++;return {status:403,data:{}};}throw Error('Isolated SQL request rejected: '+(error.code??redact(error)));}
  });r.chain=task.catch(()=>{});return task;
 };
}
