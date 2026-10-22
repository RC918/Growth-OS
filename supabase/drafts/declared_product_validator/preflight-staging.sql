-- PREFLIGHT (read-only) for Staging vhzryhibmpvglzcmfnaa.
-- Run via authorized connector BEFORE forward-staging.sql.
-- Stop conditions: any unexpected value below blocks execution.
select version from supabase_migrations.schema_migrations
 order by version desc limit 3;                       -- record history head
select md5(pg_get_functiondef(oid)) as fr_valid_payload_md5,
       pg_get_functiondef(oid) as fr_valid_payload_def
  from pg_proc where oid='private.fr_valid_payload(jsonb)'::regprocedure;
-- Expected: definition contains ONLY
-- ('explicit_product_microdata','woocommerce_single_product')
select has_function_privilege('anon','private.fr_valid_payload(jsonb)','EXECUTE') as anon_exec,
       has_function_privilege('authenticated','private.fr_valid_payload(jsonb)','EXECUTE') as auth_exec,
       has_function_privilege('service_role','private.fr_valid_payload(jsonb)','EXECUTE') as service_exec;
select prosecdef, proconfig from pg_proc
 where oid='private.fr_valid_payload(jsonb)'::regprocedure;  -- security/search_path unchanged after
