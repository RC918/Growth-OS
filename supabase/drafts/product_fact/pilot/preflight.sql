-- READ ONLY: run before any separately approved mutation. Never infer approval from these results.
select current_user, current_setting('server_version') server_version, pg_database_size(current_database()) db_bytes,
 to_regnamespace('w1_private') existing_w1_schema,
 (select coalesce(jsonb_agg(c.relname order by c.relname),'[]') from pg_class c where c.relnamespace='public'::regnamespace and c.relname like 'w1_%') existing_w1_relations,
 (select coalesce(jsonb_agg(p.proname order by p.proname),'[]') from pg_proc p where p.proname like 'w1_%') existing_w1_functions,
 (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'options',c.reloptions,'acl',c.relacl::text) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname='r7_private' and c.relkind='r') or c.oid='public.r7_members'::regclass) r7_relations,
 (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text) order by n.nspname,p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='r7_private' or (n.nspname='public' and p.proname in ('save_r7_intro','confirm_r7_intro'))) r7_functions,
 (select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='r7_private') r7_policies,
 (select jsonb_build_object('enabled',enabled,'expired',expires_at<=clock_timestamp()) from r7_private.write_gate) r7_gate,
 (select count(*) from r7_private.versions) r7_versions,(select count(*) from r7_private.confirmations) r7_confirmations,(select count(*) from r7_private.audit) r7_audit,
 (select count(*) from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclrole='postgres'::regrole and d.defaclobjtype='r' and d.defaclnamespace in (0,'public'::regnamespace) and a.grantee in (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)) unsafe_future_table_grants;
