// Offline candidate only. No remote client, clock default, served config or migration runner.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {restoreResultReview,reviewFields} from '../../../../apps/web/first-result-review.mjs';
import {canonical,validateReport} from '../../../../apps/web/first-result-payload.mjs';
import {frozen} from '../bound/generate.mjs';
export const root=new URL('./',import.meta.url);
export const sha=text=>createHash('sha256').update(text).digest('hex');
export const requestId='a326f6ce-03c7-4d3e-9fce-c22b2849cb48';
export const baseId='4595e34a-0b2d-4a73-984b-d7439b52325c';
export const cutoffToken='__OWNER_APPROVED_UTC_CUTOFF__';
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const signature='private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb)';
const entries="public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb)";
export async function source(){
 const old=await frozen(),review=await restoreResultReview(old.payload);
 // One edit, no invented fact; preserve old suggestions, source and every other field.
 review.edit('title','Bolt A — steel bolt for workshop assembly');
 for(const field of reviewFields)review.check(field,true);
 await review.confirm();const payload=await review.export();await validateReport(payload);
 const opening=await readFile(new URL('../bound/owner-candidate-20261003T193000Z/opening.sql',root),'utf8');
 const start=opening.indexOf('create function private.save_url_result_draft_impl('),end=opening.indexOf('create function public.save_url_result_draft(',start);
 const implementation=opening.slice(start,end).trimEnd();
 const body=implementation.slice(implementation.indexOf('as $$')+5,implementation.lastIndexOf('$$;'));
 return {old,payload,implementation,body};
}
export async function render(manifest,{cutoff=cutoffToken}={}){
 if(cutoff!==cutoffToken&&(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(cutoff)||!Number.isFinite(Date.parse(cutoff))||new Date(cutoff).toISOString()!==cutoff))throw Error('Explicit canonical UTC cutoff required');
 const {old,payload,implementation,body}=await source(),m=manifest;
 if(m.actor_id!==old.manifest.actor_id||m.organization_id!==old.manifest.organization_id||m.opportunity_id!==old.manifest.opportunity_id||m.expected_version!==1||m.request_id!==requestId||m.base_version_id!==baseId||m.payload_canonical_sha256!==sha(canonical(payload))||!/^pg-jsonb-sha256:[a-f0-9]{64}$/.test(m.request_digest))throw Error('Candidate binding mismatch');
 let impl=implementation.replace('create function private.','create or replace function private.');
 const once=(from,to)=>{if(impl.split(from).length!==2)throw Error('Unexpected SQL anchor');impl=impl.replace(from,()=>to);};
 once('2026-10-03T19:30:00.000Z',cutoff);
 once(old.manifest.request_id,requestId);once('p_expected_version is distinct from 0','p_expected_version is distinct from 1');
 once(old.manifest.request_digest,m.request_digest);
 const baseCheck=`if not exists(select 1 from public.content_versions where id='${baseId}' and organization_id='${m.organization_id}' and opportunity_id='${m.opportunity_id}' and version_number=1 and status='draft' and created_by='${m.actor_id}' and first_result_expected_version=0 and first_result_request_id='${old.manifest.request_id}' and first_result_request_digest='${old.manifest.request_digest}' and first_result_payload=${quote(JSON.stringify(old.payload))}::jsonb and title=first_result_payload#>>'{preview,fields,title,suggested}' and draft_body=first_result_payload#>>'{preview,fields,description,suggested}') then raise exception 'Exact saved v1 required'; end if;`;
 once('fingerprint:=private.fr_request_digest(',baseCheck+'\n fingerprint:=private.fr_request_digest(');
 const aclCheck=`if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in ('public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb)'::regprocedure,'${signature}'::regprocedure) and a.grantee=0 and a.privilege_type='EXECUTE') or exists(select 1 from (values('anon'),('authenticated'),('service_role')) r(name) cross join (values('public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb)'::regprocedure),('${signature}'::regprocedure)) f(id) where has_function_privilege(r.name,f.id,'EXECUTE')) then raise exception 'Save ACL must be closed'; end if;`;
 const preflight=`if (select count(*) from supabase_migrations.schema_migrations)<>21 then raise exception 'Expected 21-record deployed closed baseline'; end if;\n ${aclCheck}\n if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='${signature}'::regprocedure)<> '${sha(body)}' then raise exception 'Existing private implementation drift'; end if;\n ${baseCheck}\n if not exists(select 1 from public.growth_opportunities where id='${m.opportunity_id}' and organization_id='${m.organization_id}' and entry_kind='url_result' and status='url_pending_review' and source_identity=private.url_source_identity(${quote(JSON.stringify(old.payload))}::jsonb)) then raise exception 'Exact existing URL parent required'; end if;\n if (select count(*) from public.content_versions where organization_id='${m.organization_id}' and opportunity_id='${m.opportunity_id}')<>1 or exists(select 1 from public.content_versions where first_result_request_id='${requestId}') or exists(select 1 from public.audit_events where details->>'request_id'='${requestId}') then raise exception 'Expected only v1 and unused revision request'; end if;\n if not exists(select 1 from public.organization_members where organization_id='${m.organization_id}' and user_id='${m.actor_id}' and role='owner') then raise exception 'Expected Owner membership'; end if;`;
 const opening=`-- UNAPPROVED OFFLINE V2 CANDIDATE. Bind cutoff and review final hashes before any remote action.\n-- No schema installation, fixture, new function signature, RLS change or first-save replay.\nDO $revision_open$\nBEGIN\n ${preflight}\n if clock_timestamp()>=${quote(cutoff)}::timestamptz then raise exception 'Cutoff not in future'; end if;\n EXECUTE $revision_ddl$\n${impl}\n$revision_ddl$;\n REVOKE ALL ON FUNCTION ${entries} FROM PUBLIC,anon,authenticated,service_role;\n GRANT EXECUTE ON FUNCTION ${entries} TO authenticated;\nEND $revision_open$;\n`;
 const cleanup=`-- New tracked cleanup; preserve all parent/version/audit rows and the bounded body.\nDO $revision_close$\nBEGIN\n REVOKE ALL ON FUNCTION ${entries} FROM PUBLIC,anon,authenticated,service_role;\n ${aclCheck}\nEND $revision_close$;\n`;
 return {opening,cleanup,implementation:impl,preflight,bodySHA:sha(body)};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const {PGlite}=await import('@electric-sql/pglite');const {baselineSQL}=await import('../bound/baseline.mjs');
 const {old,payload}=await source(),db=await PGlite.create();let requestDigest;
 try{await db.exec(await baselineSQL({pglite:true}));requestDigest=(await db.query('select private.fr_request_digest($1,$2,$3,$4,1,$5) value',[old.manifest.organization_id,old.manifest.opportunity_id,old.manifest.actor_id,requestId,JSON.stringify(payload)])).rows[0].value;}finally{await db.close();}
 const text=JSON.stringify(payload,null,2)+'\n';
 const m={schema_version:1,state:'UNAPPROVED_OFFLINE_CANDIDATE',project_ref:'vhzryhibmpvglzcmfnaa',actor_id:old.manifest.actor_id,organization_id:old.manifest.organization_id,opportunity_id:old.manifest.opportunity_id,base_version_id:baseId,base_request_id:old.manifest.request_id,base_request_digest:old.manifest.request_digest,base_payload_file_sha256:old.manifest.payload_file_sha256,base_payload_canonical_sha256:old.manifest.payload_canonical_sha256,request_id:requestId,expected_version:1,result_version:2,result_state:'draft',parent_state:'url_pending_review',payload_file_sha256:sha(text),payload_canonical_sha256:sha(canonical(payload)),source_digest:payload.snapshot.content_fingerprint,content_digest:payload.review.content_digest,request_digest:requestDigest,review_revision:payload.review.revision,intent_digest:'sha256:'+sha(canonical({binding:{actor_id:old.manifest.actor_id,base_version_id:baseId,base_request_digest:old.manifest.request_digest},request:{organization_id:old.manifest.organization_id,opportunity_id:old.manifest.opportunity_id,request_id:requestId,expected_version:1,payload}})),cutoff:null,opening_migration_name:'url_revision_bound_open_v2',cleanup_migration_name:'url_revision_bound_close_v2',budget:{parent_inserts:0,version_inserts:1,audit_inserts:1,save_post_attempts:1,login_requests:2,tracked_migrations:2,config_transitions:2},workspace_url:old.manifest.workspace_url??'https://growth-os-preview-git-feat-passwordless-workspace-morning-ai.vercel.app/workspace.html'};
 const pack=await render(m);m.expected_private_prosrc_sha256=pack.bodySHA;
 for(const [name,body]of [['v2-payload.json',text],['manifest.json',JSON.stringify(m,null,2)+'\n'],['opening.sql.template',pack.opening],['cleanup.sql',pack.cleanup],['preflight.sql','-- Read-only assertions; exact closed baseline required.\nDO $preflight$ BEGIN\n '+pack.preflight+'\nEND $preflight$;\n']])await writeFile(new URL(name,root),body);
 const files=['v2-payload.json','manifest.json','opening.sql.template','cleanup.sql','preflight.sql','postflight.sql'];const hashes={};for(const name of files)hashes[name]=sha(await readFile(new URL(name,root)));await writeFile(new URL('hashes.json',root),JSON.stringify(hashes,null,2)+'\n');
 console.log(JSON.stringify(m,null,2));
}
