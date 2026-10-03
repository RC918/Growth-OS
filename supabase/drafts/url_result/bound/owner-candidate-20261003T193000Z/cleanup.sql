-- Second approved migration candidate: keep rows and bound function body.
DO $bound_close$
BEGIN
 EXECUTE 'revoke all on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role';
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values('anon'),('authenticated'),('service_role')) r(role_name) where ((n.nspname='public' and p.proname='save_url_result_draft') or (n.nspname='private' and p.proname='save_url_result_draft_impl')) and has_function_privilege(r.role_name,p.oid,'EXECUTE')) then raise exception 'Save still executable'; end if;
END $bound_close$;
