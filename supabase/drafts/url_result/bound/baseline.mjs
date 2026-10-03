// Synthetic isolated baseline, not a remote clone or hosted migration runner.
import {readFile,readdir} from 'node:fs/promises';
import {bootstrapSQL,seedSQL,ids,parent} from '../../first_result_save/fixtures.mjs';
import {frozen} from './generate.mjs';
export const legacyParent='a6f7775d-501f-45e6-b15e-6e8d74a26c09';
export async function baselineSQL({pglite=false}={}){
 const {manifest:m}=await frozen();let sql=bootstrapSQL;
 for(const f of (await readdir(new URL('../../../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())sql+=await readFile(new URL('../../../migrations/'+f,import.meta.url),'utf8');
 sql+=seedSQL.replaceAll(ids.org,m.organization_id).replaceAll(ids.owner,m.actor_id).replaceAll(parent(1),legacyParent);
 sql+=await readFile(new URL('../../first_result_save/proposal.sql',import.meta.url),'utf8');
 sql+=await readFile(new URL('../../first_result_save/disable_writes.sql',import.meta.url),'utf8');
 sql+=`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);insert into supabase_migrations.schema_migrations select 'synthetic-'||n,'synthetic history',array['unchanged'] from generate_series(1,18)n;insert into supabase_migrations.schema_migrations values('20261003040602','first_result_closed_package',array['synthetic baseline marker, not copied remote SQL']);`;
 return pglite?sql.replace('create extension if not exists pgcrypto;',''):sql;
}
