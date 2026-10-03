-- OFFLINE CANDIDATE ONLY. Data-preserving stop after typed records exist.
-- Deliberately retains columns, readable history and typed-review rejection.
revoke execute on function public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb) from authenticated;
revoke execute on function private.save_first_result_draft_impl(uuid,uuid,uuid,integer,jsonb) from authenticated;
