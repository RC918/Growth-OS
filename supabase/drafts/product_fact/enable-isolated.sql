-- ISOLATED RUNNER ONLY; no hosted activation authorized.
begin;
grant select on public.w1_products,public.w1_facts,public.w1_drafts,public.w1_reviews,public.w1_requests,public.w1_state to authenticated;
grant execute on function public.w1_change(uuid,uuid,uuid,integer,integer,text),public.w1_review(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function private.w1_change_impl(uuid,uuid,uuid,integer,integer,text),private.w1_review_impl(uuid,uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
