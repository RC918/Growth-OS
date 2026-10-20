-- POSTFLIGHT (read-only) for Staging vhzryhibmpvglzcmfnaa.
-- Run AFTER forward-staging.sql. All checks must hold.
select md5(pg_get_functiondef(oid)) as fr_valid_payload_md5_after,
       pg_get_functiondef(oid) like '%declared_product_dom%' as allows_declared_product
  from pg_proc where oid='private.fr_valid_payload(jsonb)'::regprocedure;
select has_function_privilege('anon','private.fr_valid_payload(jsonb)','EXECUTE') as anon_exec,
       has_function_privilege('authenticated','private.fr_valid_payload(jsonb)','EXECUTE') as auth_exec,
       has_function_privilege('service_role','private.fr_valid_payload(jsonb)','EXECUTE') as service_exec;
-- ACL/security values must equal the preflight record exactly.
select version, name from supabase_migrations.schema_migrations
 order by version desc limit 1;  -- new forward migration recorded
