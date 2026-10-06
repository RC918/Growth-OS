-- NEW empty-project candidate only. No role/Auth/default-ACL/extension changes.
-- Execute the complete file in one transaction. Never reuse historical RC schema.
begin;
set local search_path=public,pg_catalog;
do $preflight$
begin
 if current_user <> 'postgres' then raise exception 'Expected approved postgres creator'; end if;
 if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null then raise exception 'Native Auth prerequisite missing'; end if;
 if exists(select 1 from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p','f','v','m','S'))
  or exists(select 1 from pg_namespace where nspname='private') then raise exception 'New empty business schema required; stop, do not reset'; end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('save_url_result_draft','review_url_result')) then raise exception 'RPC already exists'; end if;
 if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
   where d.defaclrole='postgres'::regrole and d.defaclobjtype='r' and d.defaclnamespace in (0,'public'::regnamespace)
   and a.grantee in (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)) then raise exception 'Future table defaults must already be closed; separate correction approval required'; end if;
end $preflight$;
