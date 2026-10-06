// Pure build only: explicitly selected accepted definitions, no RC builder/identity imports.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const migration='supabase/migrations/';
const sources={
 initial:migration+'202609280001_initial.sql',rls:migration+'202609280002_tenant_rls.sql',
 opportunities:migration+'20260928160322_growth_opportunities_v1.sql',versions:migration+'20260929143139_content_draft_versions.sql',
 reviews:migration+'20260929150804_content_draft_review.sql',plans:migration+'20260929162849_content_action_plans.sql',
 observations:migration+'20260930023345_search_observation_versions.sql',goals:migration+'20260930112010_growth_goal_intake.sql',
 payload:'supabase/drafts/first_result_save/proposal.sql',save:'supabase/drafts/url_result/proposal.sql',review:'supabase/drafts/url_review/proposal.sql'
};
export const tables=['organizations','organization_members','sites','audit_events','business_profiles','growth_opportunities','opportunity_sources','opportunity_decisions','content_versions','content_reviews','content_action_plans','search_observation_versions','growth_goals','growth_goal_turns'];
export const writers=['public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb)','private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb)','public.review_url_result(uuid,uuid,uuid,text,text,text,jsonb)','private.review_url_result_impl(uuid,uuid,uuid,text,text,text,jsonb)'];
const hash=s=>createHash('sha256').update(s).digest('hex');
const between=(s,start,end)=>{const a=s.indexOf(start),b=end?s.indexOf(end,a+start.length):s.length;if(a<0||b<0)throw Error('Source boundary changed');return s.slice(a,b);};
const noTransaction=s=>s.replace(/^\s*(begin|commit);\s*$/gmi,'');
export async function build(){
 const s={},sourceHashes={};for(const [key,path] of Object.entries(sources)){s[key]=await readFile(path,'utf8');sourceHashes[path]=hash(s[key]);}
 let sql=await readFile(new URL('./preconditions.sql',import.meta.url),'utf8');
 sql+='\ncreate schema private;\nrevoke all on schema private from public,anon,authenticated,service_role;\ngrant usage on schema private,public to authenticated;\n';
 // Read-compatible tables required by the existing UI. No old business writers.
 for(const table of tables){const matches=Object.values(s).flatMap(text=>[...text.matchAll(/create table (?:public\.)?([a-z_]+)\s*\([\s\S]*?\n\);/g)].filter(m=>m[1]===table));if(matches.length!==1)throw Error('Unexpected table source '+table);if(table==='search_observation_versions')sql+=between(s.observations,'create function private.observation_keys','create table public.search_observation_versions');sql+=matches[0][0].replace(/^create table (?!public\.)/,'create table public.')+'\n';}
 for(const text of Object.values(s))for(const m of text.matchAll(/create index [\s\S]*?;/g)){const target=/ on (?:public\.)?([a-z_]+)/.exec(m[0])?.[1];if(tables.includes(target))sql+=m[0]+'\n';}
 sql+=between(s.rls,'create or replace function private.has_org_role','-- No direct client INSERT');
 const policies=[];
 for(const text of Object.values(s))for(const m of text.matchAll(/create policy ([a-z_]+) on (?:public\.)?([a-z_]+)[\s\S]*?;/g))if(tables.includes(m[2])){sql+=m[0]+'\n';policies.push({name:m[1],table:m[2]});}
 if(policies.length!==tables.length)throw Error('Each table requires its original SELECT policy');
 // Keep the accepted payload validators/columns/checks byte-for-byte; omit legacy writer bodies.
 sql+=between(s.payload,'create function private.fr_require','create function private.save_first_result_draft_impl');
 sql+=noTransaction(between(s.save,'alter table public.growth_opportunities','-- Add a fail-closed subtype guard'));
 // Legacy RPCs do not exist in this package, so the old-RPC patch block is unnecessary.
 sql+=noTransaction(between(s.save,'create function private.save_url_result_draft_impl'));
 sql+=s.review;
 const signatures=[...sql.matchAll(/create (?:or replace )?function ([a-z_]+\.[a-z0-9_]+)\(([^)]*)\)/g)].map(m=>m[1]+'('+m[2].split(',').map(p=>p.trim().split(/\s+/).slice(1).join(' ')).join(',')+')');
 if(new Set(signatures).size!==signatures.length)throw Error('Duplicate function');
 for(const table of tables)sql+=`\nalter table public.${table} enable row level security;\nrevoke all on table public.${table} from public,anon,authenticated,service_role;\ngrant select on table public.${table} to authenticated;\n`;
 for(const signature of signatures)sql+=`revoke all on function ${signature} from public,anon,authenticated,service_role;\n`;
 sql+='grant execute on function private.has_org_role(uuid,text[]) to authenticated;\ncommit;\nNOTIFY pgrst, \'reload schema\';\n';
 const enable='-- Separate future activation: operator approval + RLS/native validation required. No table writes.\nbegin;\n'+writers.map(p=>'grant execute on function '+p+' to authenticated;').join('\n')+"\ncommit;\nNOTIFY pgrst, 'reload schema';\n";
 const disable='begin;\n'+writers.map(p=>'revoke all on function '+p+' from public,anon,authenticated,service_role;').join('\n')+"\ncommit;\nNOTIFY pgrst, 'reload schema';\n";
 const manifest={version:1,scope:'new-empty-project-only; build candidate, never remote authorization',creator:'postgres',tables:tables.map(name=>({schema:'public',name,rls:true,authenticated:['SELECT'],anon:[],service_role:[],direct_writes:[]})),policies,functions:signatures.map(signature=>({signature,authenticated:signature==='private.has_org_role(uuid,text[])'?['EXECUTE']:[],activation_execute:writers.includes(signature),public:[],anon:[],service_role:[]})),schemas:{private:{authenticated:['USAGE'],expose_in_data_api:false},public:{authenticated:['USAGE']}},default_privileges:'assert existing postgres future-table defaults closed; change none',identities:'none; Auth users and owner membership initialized only under separate approval',sources:sourceHashes,hashes:{'install.sql':hash(sql),'enable-save-review.sql':hash(enable),'disable-save-review.sql':hash(disable)}};
 return {sql,enable,disable,manifest};
}
if(process.argv[1]===new URL(import.meta.url).pathname){const b=await build();for(const [name,value] of Object.entries({'install.sql':b.sql,'enable-save-review.sql':b.enable,'disable-save-review.sql':b.disable,'manifest.json':JSON.stringify(b.manifest,null,2)+'\n'}))await writeFile(new URL('./'+name,import.meta.url),value);}
