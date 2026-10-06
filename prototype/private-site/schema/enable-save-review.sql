-- Separate future activation: operator approval + RLS/native validation required. No table writes.
begin;
grant execute on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb) to authenticated;
grant execute on function private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.review_url_result(uuid,uuid,uuid,text,text,text,jsonb) to authenticated;
grant execute on function private.review_url_result_impl(uuid,uuid,uuid,text,text,text,jsonb) to authenticated;
commit;
NOTIFY pgrst, 'reload schema';
