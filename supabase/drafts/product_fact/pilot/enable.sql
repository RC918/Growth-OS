-- Separate approval required. Fixed upper limits: one verified actor/product, <=1h, 2 answers + 2 reviews.
begin;
do $$declare e timestamptz:=current_setting('w1.expires_at')::timestamptz;g w1_private.gate;begin
 select * into g from w1_private.gate where singleton for update;
 if g.enabled or g.expires_at<>'-infinity'::timestamptz or g.answers<>0 or g.reviews<>0 then raise exception 'Window already consumed; no re-enable';end if;
 if e<=clock_timestamp() or e>clock_timestamp()+interval '1 hour' or g.actor_id is null or g.product_id is null or not exists(select 1 from public.r7_members m where m.user_id=g.actor_id and m.organization_id=g.organization_id and m.role='owner') then raise exception 'Invalid verified scope or <=1h expiry';end if;
 update w1_private.gate set enabled=true,expires_at=e where singleton;
end$$;
grant execute on function public.w1_change(uuid,uuid,uuid,integer,integer,text),public.w1_review(uuid,uuid,uuid,uuid),w1_private.w1_change_impl(uuid,uuid,uuid,integer,integer,text),w1_private.w1_review_impl(uuid,uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
