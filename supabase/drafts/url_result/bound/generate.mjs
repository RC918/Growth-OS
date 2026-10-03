// OFFLINE renderer only: no database/network calls, no default UTC window or target.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {canonical,validateReport} from '../../../../apps/web/first-result-payload.mjs';
const root=new URL('./',import.meta.url),sha=s=>createHash('sha256').update(s).digest('hex');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
export async function frozen(){
 const text=await readFile(new URL('synthetic-export.json',root),'utf8'),manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8')),payload=JSON.parse(text);
 await validateReport(payload);
 if(sha(text)!==manifest.payload_file_sha256||sha(canonical(payload))!==manifest.payload_canonical_sha256||payload.snapshot.content_fingerprint!==manifest.source_digest||payload.review.content_digest!==manifest.content_digest)throw Error('Frozen payload/hash mismatch');
 for(const key of ['actor_id','organization_id','opportunity_id','request_id'])if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(manifest[key]))throw Error('Invalid fixed identity');
 if(manifest.expected_version!==0||!/^pg-jsonb-sha256:[0-9a-f]{64}$/.test(manifest.request_digest))throw Error('Invalid bound request');
 return {manifest,payload,text};
}
function once(text,from,to){if(text.split(from).length!==2)throw Error('Unexpected reviewed SQL anchor: '+from);return text.replace(from,()=>to);}
export async function renderBound({expiresAt,previewURL}){
 if(typeof expiresAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(expiresAt)||!Number.isFinite(Date.parse(expiresAt)))throw Error('An explicit absolute UTC deadline is required');
 const deadline=new Date(expiresAt).toISOString();if(deadline.slice(0,19)!==expiresAt.slice(0,19))throw Error('Invalid UTC date');
 const url=new URL(previewURL);if(url.protocol!=='https:'||url.pathname!=='/workspace.html'||url.search||url.hash||url.username||url.password)throw Error('An exact existing HTTPS branch-alias workspace.html URL is required');
 const {manifest:m}=await frozen();const base=await readFile(new URL('../proposal.sql',root),'utf8');
 const start=base.indexOf('create function private.save_url_result_draft_impl('),end=base.indexOf('create function public.save_url_result_draft(',start);
 if(start<0||end<0)throw Error('Missing reviewed implementation');
 let impl=base.slice(start,end);
 impl=once(impl,'declare actor uuid:=auth.uid();',`declare cutoff constant timestamptz := ${quote(deadline)}; actor uuid:=auth.uid();`);
 const expire="if clock_timestamp()>=cutoff then raise exception 'URL acceptance expired' using errcode='42501'; end if;";
 const scope=`if actor is distinct from '${m.actor_id}'::uuid or p_organization_id is distinct from '${m.organization_id}'::uuid or not private.has_org_role(p_organization_id,array['owner']) then raise exception 'Bound owner required' using errcode='42501'; end if;\n if p_opportunity_id is distinct from '${m.opportunity_id}'::uuid or p_request_id is distinct from '${m.request_id}'::uuid or p_expected_version is distinct from 0 then raise exception 'Bound request required' using errcode='42501'; end if;`;
 impl=once(impl,'begin\n',`begin\n ${scope}\n ${expire}\n`);
 impl=once(impl,'where id=p_organization_id for no key update;','where id=p_organization_id for no key update;\n '+expire);
 impl=once(impl,"if not found then raise exception 'Owner membership changed' using errcode='42501'; end if;","if not found then raise exception 'Owner membership changed' using errcode='42501'; end if;\n "+expire);
 const fingerprint='fingerprint:=private.fr_request_digest(p_organization_id,p_opportunity_id,actor,p_request_id,p_expected_version,p_payload);';
 impl=once(impl,fingerprint,fingerprint+`\n if fingerprint is distinct from '${m.request_digest}' then raise exception 'Bound payload required' using errcode='22023'; end if;`);
 impl=once(impl,'  return old.id;','  '+expire+'\n  return old.id;');
 impl=once(impl,'and id=p_opportunity_id for update;','and id=p_opportunity_id for update;\n '+expire);
 for(const table of ['growth_opportunities','content_versions','audit_events'])impl=once(impl,'insert into public.'+table,' '+expire+'\n insert into public.'+table);
 impl=once(impl,' return result_id;',' '+expire+'\n return result_id;');
 let ddl=base.replace(base.slice(start,end),()=>impl).replace(/^begin;\n/m,'').replace(/^commit;\n/m,'');
 ddl+=`\ngrant execute on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated;\n`;
 const opening=`-- OFFLINE CANDIDATE. Not approved. Absolute cutoff: ${deadline}\n-- Authenticated callers remain bound inside the existing private implementation.\nDO $bound_open$\nBEGIN\n if (select count(*) from supabase_migrations.schema_migrations)<>19 or not exists(select 1 from supabase_migrations.schema_migrations where version='20261003040602') then raise exception 'Expected 19-record closed-schema baseline'; end if;\n if exists(select 1 from public.growth_opportunities where id='${m.opportunity_id}') or exists(select 1 from public.content_versions where first_result_request_id='${m.request_id}') then raise exception 'Fixed parent/request already exists'; end if;\n EXECUTE $url_ddl$\n${ddl}$url_ddl$;\nEND $bound_open$;\n`;
 const cleanup=`-- Second approved migration candidate: keep rows and bound function body.\nDO $bound_close$\nBEGIN\n EXECUTE 'revoke all on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role';\n if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values('anon'),('authenticated'),('service_role')) r(role_name) where ((n.nspname='public' and p.proname='save_url_result_draft') or (n.nspname='private' and p.proname='save_url_result_draft_impl')) and has_function_privilege(r.role_name,p.oid,'EXECUTE')) then raise exception 'Save still executable'; end if;\nEND $bound_close$;\n`;
 const config={...m,expires_at:deadline,workspace_url:url.href};
 const configSource=enabled=>`// CANDIDATE ONLY; never copied into apps/web without separate approval.\nexport const urlResultSchemaEnabled = true;\nexport const urlSaveEnabled = ${enabled};\nexport const urlSaveTrial = Object.freeze(${JSON.stringify(config,null,2)});\n`;
 return {opening,cleanup,implementation:impl.replace('create function private.','create or replace function private.'),openConfig:configSource(true),closedConfig:configSource(false),config,hashes:{opening_sha256:sha(opening),cleanup_sha256:sha(cleanup),open_config_sha256:sha(configSource(true)),closed_config_sha256:sha(configSource(false))}};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const [expiresAt,previewURL,out]=process.argv.slice(2);if(!out)throw Error('Usage: node generate.mjs ABSOLUTE_UTC EXISTING_HTTPS_WORKSPACE_URL OUTPUT_DIRECTORY');
 const target=resolve(out),repo=fileURLToPath(new URL('../../../../',root));
 if(!target.startsWith(fileURLToPath(root))&&!target.startsWith('/tmp/'))throw Error('Output must be a bound draft subdirectory or /tmp; never a served web root');
 const pack=await renderBound({expiresAt,previewURL});await mkdir(target,{recursive:true});
 for(const [name,body] of [['opening.sql',pack.opening],['cleanup.sql',pack.cleanup],['preview-open-config.mjs',pack.openConfig],['preview-closed-config.mjs',pack.closedConfig],['hashes.json',JSON.stringify({...pack.hashes,expires_at:pack.config.expires_at,workspace_url:pack.config.workspace_url},null,2)+'\n']])await writeFile(resolve(target,name),body);
 console.log(JSON.stringify(pack.hashes,null,2));
}
