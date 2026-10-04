-- Only a newly created, isolated RC PostgreSQL database. Never the hosted project.
\getenv password POSTGRES_PASSWORD
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role authenticator login noinherit password :'password';
grant anon,authenticated to authenticator;
create role supabase_auth_admin login noinherit password :'password';
create schema auth authorization supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
alter role supabase_auth_admin set search_path=auth,public;
create function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
