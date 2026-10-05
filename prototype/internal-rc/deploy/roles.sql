-- Only a newly created, isolated RC PostgreSQL database. Never the hosted project.
-- Read secret from the existing container environment; never materialize it in a host SQL file.
\set ECHO none
set log_statement = 'none';
set log_min_error_statement = 'panic';
\getenv password POSTGRES_PASSWORD
begin;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role authenticator login noinherit password :'password';
grant anon,authenticated to authenticator;
create role supabase_auth_admin login noinherit password :'password';
create schema auth authorization supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
alter role supabase_auth_admin set search_path=auth,public;
-- GoTrue alone creates and updates auth tables/functions; no fixture uid shim.
grant usage on schema auth to anon,authenticated;
commit;
