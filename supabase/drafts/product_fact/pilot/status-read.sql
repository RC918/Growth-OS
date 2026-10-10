-- Additive candidate only. Apply separately after review; never re-run install/enroll.
-- Reads the existing gate; does not enable, extend, consume quotas, or change Auth/R7.
begin;
do $$begin
 if current_user<>'postgres' or to_regclass('w1_private.gate') is null then raise exception 'Existing W1 installation required';end if;
 if (select count(*) from w1_private.gate where singleton and not enabled)<>1 then raise exception 'Install status reader only while W1 is closed';end if;
end$$;
create function w1_private.writer_status(p_product uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with stamp as (select clock_timestamp() as at), scoped as (
  select g.* from w1_private.gate g join public.w1_products p on p.id=g.product_id and p.organization_id=g.organization_id and p.source_version=g.source_version
  where g.singleton and g.product_id=p_product and g.actor_id=auth.uid() and w1_private.has_org_role(g.organization_id,array['owner'])
 )
 select jsonb_build_object('product_id',g.product_id,'server_time_ms',extract(epoch from s.at)*1000,
  'expires_at_ms',case when g.expires_at>'-infinity'::timestamptz then extract(epoch from g.expires_at)*1000 end,
  'answer_allowed',coalesce(g.enabled and g.expires_at>s.at and g.answers<2,false),
  'review_allowed',coalesce(g.enabled and g.expires_at>s.at and g.reviews<2,false),
  'answers_remaining',case when g.enabled and g.expires_at>s.at then 2-g.answers else 0 end,
  'reviews_remaining',case when g.enabled and g.expires_at>s.at then 2-g.reviews else 0 end)
 from stamp s left join scoped g on true
$$;
create function public.w1_writer_status(p_product uuid) returns jsonb language sql stable security invoker set search_path='' as $$select w1_private.writer_status(p_product)$$;
revoke all on function w1_private.writer_status(uuid),public.w1_writer_status(uuid) from public,anon,authenticated,service_role;
grant execute on function w1_private.writer_status(uuid),public.w1_writer_status(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
