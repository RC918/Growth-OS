-- New tracked cleanup; preserve all parent/version/audit rows and the bounded body.
DO $revision_close$
BEGIN
 REVOKE ALL ON FUNCTION public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in ('public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb)'::regprocedure,'private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb)'::regprocedure) and a.grantee=0 and a.privilege_type='EXECUTE') or exists(select 1 from (values('anon'),('authenticated'),('service_role')) r(name) cross join (values('public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb)'::regprocedure),('private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb)'::regprocedure)) f(id) where has_function_privilege(r.name,f.id,'EXECUTE')) then raise exception 'Save ACL must be closed'; end if;
END $revision_close$;
