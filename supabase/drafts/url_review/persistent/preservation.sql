-- READ ONLY: baseline all public rows; only PUBLIC/anon/authenticated audit INSERT/UPDATE/DELETE/TRUNCATE are excluded from catalog comparison, verified exactly by audit-postflight.sql. Full migration history is separate and must reconcile the newly approved exact statement. After user Review, reconcile exact appended review/audit rows separately; no broad exclusion.
select 'actions' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.actions t
union all
select 'audit_events' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.audit_events t
union all
select 'business_profiles' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.business_profiles t
union all
select 'content_action_plans' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.content_action_plans t
union all
select 'content_reviews' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t)-array['url_review_request_id','url_review_source_digest','url_review_content_digest','url_review_version_digest','url_review_checks'] order by to_jsonb(t)-array['url_review_request_id','url_review_source_digest','url_review_content_digest','url_review_version_digest','url_review_checks']::text)::text,'[]'),'UTF8')),'hex') sha256 from public.content_reviews t
union all
select 'content_versions' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.content_versions t
union all
select 'findings' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.findings t
union all
select 'funnel_daily' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.funnel_daily t
union all
select 'growth_goal_turns' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.growth_goal_turns t
union all
select 'growth_goals' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.growth_goals t
union all
select 'growth_opportunities' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.growth_opportunities t
union all
select 'import_batches' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.import_batches t
union all
select 'opportunity_decisions' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.opportunity_decisions t
union all
select 'opportunity_sources' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.opportunity_sources t
union all
select 'organization_members' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.organization_members t
union all
select 'organizations' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.organizations t
union all
select 'recommendations' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.recommendations t
union all
select 'scans' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.scans t
union all
select 'search_observation_versions' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.search_observation_versions t
union all
select 'sites' relation,count(*) count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') sha256 from public.sites t order by relation;
select jsonb_build_object('tables',(select jsonb_agg(to_jsonb(x) order by relname) from (select c.relname,c.relowner,c.relrowsecurity,c.relforcerowsecurity,case when c.relname='audit_events' then (select coalesce(jsonb_agg(to_jsonb(x) order by grantee,privilege),'[]') from (select case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end grantee,pg_get_userbyid(a.grantor) grantor,a.privilege_type privilege,a.is_grantable grantable from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid='public.audit_events'::regclass and not (a.grantee in (0,'anon'::regrole,'authenticated'::regrole) and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE'))) x)::text else c.relacl::text end as relacl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r')x),'policies',(select jsonb_agg(to_jsonb(x) order by schemaname,tablename,policyname) from pg_policies x),'functions',(select jsonb_agg(to_jsonb(x) order by signature) from (select p.oid::regprocedure::text signature,p.proowner,p.proacl::text,p.proconfig,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' and p.proname not in ('review_url_result','review_url_result_impl'))x),'columns',(select jsonb_agg(to_jsonb(x) order by table_name,ordinal_position) from information_schema.columns x where table_schema='public' and not(table_name='content_reviews' and column_name in ('url_review_request_id','url_review_source_digest','url_review_content_digest','url_review_version_digest','url_review_checks'))),'constraints',(select jsonb_agg(to_jsonb(x) order by relation,name) from (select conrelid::regclass::text relation,conname name,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='public'::regnamespace and conname not in ('content_reviews_url_request_unique','content_reviews_url_shape'))x),'defaults',(select jsonb_agg(to_jsonb(x) order by oid) from pg_default_acl x),'roles',(select jsonb_agg(to_jsonb(x) order by rolname) from (select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls from pg_roles)x)) as preserved_catalog_except_audit_write_revoke;

select * from pg_auth_members order by roleid,member;
select version,name,statements from supabase_migrations.schema_migrations order by version;
