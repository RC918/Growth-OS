// Derive only W1 definitions; never alter R7 or the accepted isolated candidate.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
let base=await readFile('supabase/drafts/product_fact/install.sql','utf8');
base=base.replace('begin;',()=>`begin;
do $$begin
 if current_user<>'postgres' or to_regclass('public.r7_members') is null or to_regprocedure('auth.uid()') is null then raise exception 'Verified pilot native Auth/membership required';end if;
 if not exists(select 1 from pg_class where oid='public.r7_members'::regclass and relkind='v' and relowner='postgres'::regrole and reloptions @> array['security_invoker=true']) or not exists(select 1 from pg_class where oid='r7_private.members'::regclass and relrowsecurity) then raise exception 'R7 membership catalog mismatch';end if;
 if not has_table_privilege('authenticated','public.r7_members','SELECT') or not has_table_privilege('authenticated','r7_private.members','SELECT') or not has_function_privilege('authenticated','auth.uid()','EXECUTE') then raise exception 'Existing membership readonly ACL required';end if;
 if exists(select 1 from r7_private.write_gate where enabled or expires_at>clock_timestamp()) or (select count(*) from r7_private.write_gate)<>1 then raise exception 'R7 must remain closed';end if;
 if exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid in ('public.r7_members'::regclass,'r7_private.members'::regclass) and a.grantee in (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole) and (a.privilege_type<>'SELECT' or a.grantee<>'authenticated'::regrole)) then raise exception 'Unexpected membership API ACL; stop without correction';end if;
 if to_regnamespace('w1_private') is not null or to_regclass('public.w1_products') is not null then raise exception 'W1 already exists; stop without reset';end if;
 if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclrole='postgres'::regrole and d.defaclobjtype='r' and d.defaclnamespace in (0,'public'::regnamespace) and a.grantee in (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)) then raise exception 'Unsafe future table defaults; no automatic correction';end if;
end$$;
create schema w1_private;
revoke all on schema w1_private from public,anon,authenticated,service_role;
create function w1_private.has_org_role(org uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.r7_members m where m.user_id=auth.uid() and m.organization_id=org and m.role=any(roles))$$;
revoke all on function w1_private.has_org_role(uuid,text[]) from public,anon,authenticated,service_role;
create table w1_private.gate(singleton boolean primary key default true check(singleton),enabled boolean not null default false,actor_id uuid references auth.users(id),organization_id uuid,product_id uuid,source_version integer,expires_at timestamptz not null default '-infinity',answers integer not null default 0 check(answers between 0 and 2),reviews integer not null default 0 check(reviews between 0 and 2));
alter table w1_private.gate enable row level security;
revoke all on w1_private.gate from public,anon,authenticated,service_role;
insert into w1_private.gate(singleton) values(true);
create function w1_private.admit(org uuid,product uuid,kind text) returns void language plpgsql security definer set search_path='' as $$declare g w1_private.gate;begin
 select * into g from w1_private.gate where singleton for update;
 if not g.enabled or g.expires_at<=clock_timestamp() or g.actor_id is distinct from auth.uid() or g.organization_id is distinct from org or g.product_id is distinct from product or not w1_private.has_org_role(org,array['owner'])
 or not exists(select 1 from public.w1_products p where p.id=product and p.organization_id=org and p.source_version=g.source_version)
 or (kind='answer' and g.answers>=2) or (kind='review' and g.reviews>=2) then raise exception 'W1 write gate closed or scope/quota expired' using errcode='42501';end if;
end$$;
revoke all on function w1_private.admit(uuid,uuid,text) from public,anon,authenticated,service_role;
`);
base=base.replaceAll('references public.organizations(id)','').replaceAll('private.has_org_role','w1_private.has_org_role').replaceAll('w1_w1_private.','w1_private.').replaceAll('private.w1_change_impl','w1_private.w1_change_impl').replaceAll('private.w1_review_impl','w1_private.w1_review_impl');
// Gate lock precedes request/product locks. Disable serializes on the same row.
base=base.replace("j:=jsonb_build_object('kind','answer'", "perform w1_private.admit(p_org,p_product,'answer');\n j:=jsonb_build_object('kind','answer'");
base=base.replace("j:=jsonb_build_object('kind','review'", "perform w1_private.admit(p_org,p_product,'review');\n j:=jsonb_build_object('kind','review'");
// Move admission before other locks, then final recheck before return including late DML waits.
for(const kind of ['answer','review']){
 const start=base.indexOf('create function w1_private.w1_'+(kind==='answer'?'change':'review')+'_impl');const end=base.indexOf('end $$;',start)+7;let part=base.slice(start,end);
 part=part.replace(`perform w1_private.admit(p_org,p_product,'${kind}');\n `,'');part=part.replace('perform pg_advisory_xact_lock',`perform w1_private.admit(p_org,p_product,'${kind}');\n perform pg_advisory_xact_lock`);
 part=part.replace('  return old.result;',`  perform w1_private.admit(p_org,p_product,'${kind}');\n  return old.result;`);
 part=part.replace(' return result;',` perform w1_private.admit(p_org,p_product,'${kind}');\n update w1_private.gate set ${kind==='answer'?'answers':'reviews'}=${kind==='answer'?'answers':'reviews'}+1 where singleton;\n return result;`);
 base=base.slice(0,start)+part+base.slice(end);
}
base=base.replace('ACL remains closed until isolated enable.sql.','Pilot candidate: installation grants no application access.');
await writeFile('supabase/drafts/product_fact/pilot/install.sql',base);
const names=['preflight.sql','postflight.sql','install.sql','enroll-readonly.sql','enable.sql','disable.sql'];const hashes={};for(const n of names)hashes[n]=createHash('sha256').update(await readFile('supabase/drafts/product_fact/pilot/'+n)).digest('hex');await writeFile('supabase/drafts/product_fact/pilot/SHA256.json',JSON.stringify(hashes,null,2)+'\n');
