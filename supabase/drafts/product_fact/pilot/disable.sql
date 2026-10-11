-- Close only W1. Preserve history and readonly ACL; R7 untouched. Expiry remains a consumed-window marker.
begin;
update w1_private.gate set enabled=false,expires_at=least(expires_at,clock_timestamp()) where singleton;
revoke all on function public.w1_change(uuid,uuid,uuid,integer,integer,text),public.w1_review(uuid,uuid,uuid,uuid),w1_private.w1_change_impl(uuid,uuid,uuid,integer,integer,text),w1_private.w1_review_impl(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
