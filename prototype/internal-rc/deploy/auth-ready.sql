-- Read-only post-migration gate, before native users/business schema/WP grant.
-- GoTrue is the sole owner of Auth definitions, not the product fixture/bootstrap.
do $$ begin
 if (select pg_get_userbyid(nspowner) from pg_namespace where nspname='auth') is distinct from 'supabase_auth_admin'
 or (select pg_get_userbyid(proowner) from pg_proc where oid=to_regprocedure('auth.uid()')) is distinct from 'supabase_auth_admin'
 or to_regclass('auth.users') is null then
  raise exception 'Native Auth migrations/ownership incomplete';
 end if;
 if exists(select 1 from pg_roles where rolname in ('supabase_auth_admin','authenticator','anon','authenticated','service_role') and (rolsuper or rolcreaterole or rolcreatedb or rolbypassrls)) then
  raise exception 'RC roles exceed approved privileges';
 end if;
end $$;
