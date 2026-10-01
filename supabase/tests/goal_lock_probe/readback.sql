-- Trusted admin READ ONLY, immediately before activation and after cleanup.
-- Save hash/count outputs, never raw answer text. Compare at the same UTC TZ.
SELECT jsonb_build_object(
 'observed_at',clock_timestamp(),
 'goal_id','5055ca31-40cc-435d-9f52-cdf19166440c',
 'goal_hash',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(g))::text,'[]'),'UTF8')),'hex')
   FROM public.growth_goals g WHERE g.id='5055ca31-40cc-435d-9f52-cdf19166440c'),
 'history_count',(SELECT count(*) FROM public.growth_goal_turns WHERE goal_id='5055ca31-40cc-435d-9f52-cdf19166440c'),
 'history_hash',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY version_number,id)::text,'[]'),'UTF8')),'hex')
   FROM public.growth_goal_turns t WHERE goal_id='5055ca31-40cc-435d-9f52-cdf19166440c'),
 'audit_count',(SELECT count(*) FROM public.audit_events WHERE object_type='growth_goal' AND object_id='5055ca31-40cc-435d-9f52-cdf19166440c'),
 'audit_hash',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) ORDER BY occurred_at,id)::text,'[]'),'UTF8')),'hex')
   FROM public.audit_events a WHERE object_type='growth_goal' AND object_id='5055ca31-40cc-435d-9f52-cdf19166440c'),
 'probe_roles',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'limit',rolconnlimit)),'[]'::jsonb)
   FROM pg_roles WHERE rolname IN ('growth_os_probe_login','growth_os_probe_owner')),
 'probe_schema_exists',EXISTS(SELECT FROM pg_namespace WHERE nspname='growth_os_probe'),
 'probe_sessions',(SELECT count(*) FROM pg_stat_activity WHERE usename='growth_os_probe_login')
) AS proof;
