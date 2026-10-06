begin;
revoke all on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.review_url_result(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.review_url_result_impl(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
commit;
NOTIFY pgrst, 'reload schema';
