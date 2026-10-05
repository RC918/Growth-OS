-- READ ONLY. Capture before opening and compare after cleanup. New review columns excluded only from original-row projection.
select 'actions' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.actions t
union all
select 'audit_events' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.audit_events t where not (event_type='url_result_reviewed' and organization_id='93a88055-0a0b-40c0-b22f-a6d312320001' and actor_user_id='e85f1a90-3565-4fc1-a7e0-3b7d08830d0e' and object_id='5802e838-8a06-46c6-934a-0a8c38ba1daa' and details->>'request_id' is not distinct from '1f3f43cb-a64c-4739-a4a7-772d5b2cb781')
union all
select 'business_profiles' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.business_profiles t
union all
select 'content_action_plans' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.content_action_plans t
union all
select 'content_reviews' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t)-array['url_review_request_id','url_review_source_digest','url_review_content_digest','url_review_version_digest','url_review_checks'] order by to_jsonb(t)-array['url_review_request_id','url_review_source_digest','url_review_content_digest','url_review_version_digest','url_review_checks']::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.content_reviews t where not (to_jsonb(t)->>'url_review_request_id' is not distinct from '1f3f43cb-a64c-4739-a4a7-772d5b2cb781' and organization_id='93a88055-0a0b-40c0-b22f-a6d312320001' and version_id='5802e838-8a06-46c6-934a-0a8c38ba1daa')
union all
select 'content_versions' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.content_versions t
union all
select 'findings' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.findings t
union all
select 'funnel_daily' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.funnel_daily t
union all
select 'growth_goal_turns' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.growth_goal_turns t
union all
select 'growth_goals' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.growth_goals t
union all
select 'growth_opportunities' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.growth_opportunities t
union all
select 'import_batches' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.import_batches t
union all
select 'opportunity_decisions' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.opportunity_decisions t
union all
select 'opportunity_sources' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.opportunity_sources t
union all
select 'organization_members' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.organization_members t
union all
select 'organizations' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.organizations t
union all
select 'recommendations' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.recommendations t
union all
select 'scans' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.scans t
union all
select 'search_observation_versions' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.search_observation_versions t
union all
select 'sites' as relation,count(*) as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') as sha256 from public.sites t
union all
select 'migration_history',count(*),encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by version)::text,'[]'),'UTF8')),'hex') from supabase_migrations.schema_migrations t where name not in ('url_review_bound_open_v2','url_review_bound_close_v2') order by relation;
-- Catalog allowlist: only five columns/two constraints/unique index and two bounded functions may be added. Existing metadata must match.
select jsonb_build_object('tables',(select jsonb_agg(to_jsonb(x) order by relname) from (select c.relname,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r')x),'policies',(select jsonb_agg(to_jsonb(x) order by schemaname,tablename,policyname) from pg_policies x),'functions',(select jsonb_agg(to_jsonb(x) order by signature) from (select p.oid::regprocedure::text signature,p.proowner,p.proacl::text,p.proconfig,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' and p.proname not in ('review_url_result','review_url_result_impl'))x),'columns',(select jsonb_agg(to_jsonb(x) order by table_name,ordinal_position) from information_schema.columns x where table_schema='public' and not(table_name='content_reviews' and column_name in ('url_review_request_id','url_review_source_digest','url_review_content_digest','url_review_version_digest','url_review_checks'))),'constraints',(select jsonb_agg(to_jsonb(x) order by relation,name) from (select conrelid::regclass::text relation,conname name,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='public'::regnamespace and conname not in ('content_reviews_url_request_unique','content_reviews_url_shape'))x),'defaults',(select jsonb_agg(to_jsonb(x) order by oid) from pg_default_acl x),'roles',(select jsonb_agg(to_jsonb(x) order by rolname) from (select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls from pg_roles)x)) as unchanged_catalog;
