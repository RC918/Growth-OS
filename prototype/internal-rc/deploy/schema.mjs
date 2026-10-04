// Build-only. Reuses the accepted migrations/candidate bodies; does not execute SQL.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {ids} from '../../../supabase/drafts/first_result_save/fixtures.mjs';
import {saveGrant,reviewGrant} from '../../../supabase/drafts/url_review/fixture.mjs';
export async function schema(){
 let sql='begin;\n';
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())sql+=await readFile('supabase/migrations/'+f,'utf8');
 for(const f of ['first_result_save/proposal.sql','first_result_save/disable_writes.sql','url_result/proposal.sql','url_review/proposal.sql'])sql+=await readFile('supabase/drafts/'+f,'utf8');
 sql+=`\n-- Real GoTrue users must already exist; no auth.users inserts or synthetic uid shim.\ndo $$ begin if (select count(*) from auth.users where id in ('${ids.owner}','${ids.viewer}','${ids.foreign}'))<>3 then raise exception 'Real RC Auth users missing'; end if; end $$;\n`;
 sql+=`insert into public.organizations(id,name,business_model) values('${ids.org}','Internal RC A','trade'),('${ids.other}','Internal RC B','trade');\ninsert into public.organization_members(organization_id,user_id,role) values('${ids.org}','${ids.owner}','owner'),('${ids.org}','${ids.viewer}','viewer'),('${ids.other}','${ids.foreign}','owner');\n`;
 // Only exposed read tables, no direct writes. Existing RLS is authoritative.
 sql+='grant usage on schema public to authenticated;grant select on all tables in schema public to authenticated;\n'+saveGrant+reviewGrant+'\ncommit;\nNOTIFY pgrst, \'reload schema\';\n';return sql;
}
if(process.argv[1]===new URL(import.meta.url).pathname)await writeFile(process.argv[2],await schema(),{flag:'wx',mode:0o600});
