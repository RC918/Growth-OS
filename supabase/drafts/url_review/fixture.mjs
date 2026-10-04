// Disposable test setup only: migrations + existing offline candidates, no remote.
import {readFile,readdir} from 'node:fs/promises';
import {bootstrapSQL,seedSQL} from '../first_result_save/fixtures.mjs';
export {ids,parent,request,fixtures} from '../first_result_save/fixtures.mjs';
export const checks={title:true,meta_description:true,description:true,source:true,blocking_facts_clear:true};
export const signature='(uuid,uuid,uuid,text,text,text,jsonb)';
export const reviewGrant=`grant execute on function public.review_url_result${signature},private.review_url_result_impl${signature} to authenticated;`;
export const saveGrant='grant execute on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated;';
export async function baseline(){
 let sql=bootstrapSQL;
 for(const file of (await readdir(new URL('../../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())sql+=(await readFile(new URL('../../migrations/'+file,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;','');
 sql+=seedSQL;
 for(const file of ['first_result_save/proposal.sql','first_result_save/disable_writes.sql','url_result/proposal.sql','url_review/proposal.sql'])sql+=await readFile(new URL('../'+file,import.meta.url),'utf8');
 return sql;
}
