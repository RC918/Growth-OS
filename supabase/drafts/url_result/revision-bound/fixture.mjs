// Disposable offline reconstruction only; not a migration or remote execution path.
import {readFile} from 'node:fs/promises';
import {baselineSQL} from '../bound/baseline.mjs';
import {source,render,root,baseId} from './candidate.mjs';
export async function revisionBaseline({pglite=false}={}){
 const s=await source(),m=JSON.parse(await readFile(new URL('manifest.json',root),'utf8')),p=await render(m);
 const old=await readFile(new URL('../bound/owner-candidate-20261003T193000Z/opening.sql',root),'utf8');
 const payload="'"+JSON.stringify(s.old.payload).replaceAll("'","''")+"'::jsonb";
 return await baselineSQL({pglite})+old.replaceAll('2026-10-03T19:30:00.000Z','2099-01-01T00:00:00.000Z')+`set role authenticated;select set_config('request.jwt.claim.sub','${m.actor_id}',false);select public.save_url_result_draft('${m.organization_id}','${m.opportunity_id}','${m.base_request_id}',0,${payload});reset role;update public.audit_events set object_id='${baseId}' where object_id=(select id from public.content_versions where first_result_request_id='${m.base_request_id}');update public.content_versions set id='${baseId}' where first_result_request_id='${m.base_request_id}';`+s.implementation.replace('create function private.','create or replace function private.')+p.cleanup+"insert into supabase_migrations.schema_migrations values('synthetic-old-open','old opening',array['local only']),('synthetic-old-close','old cleanup',array['local only']);";
}
