-- Atomic owner decision for a sourced Growth OS opportunity.
-- The authenticated caller's auth.uid() is authoritative; no actor ID input.
-- Approval records intent only; publication and external execution are separate.
create or replace function public.review_growth_opportunity(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_decision text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_decision_id uuid;
begin
  if v_actor is null or not private.has_org_role(p_organization_id, array['owner']::text[]) then
    raise exception 'Not authorized to review this opportunity' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('approved', 'rejected')
     or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'Invalid decision or reason' using errcode = '22023';
  end if;

  select status into v_status
    from public.growth_opportunities
   where organization_id = p_organization_id and id = p_opportunity_id
   for update;

  if not found then
    raise exception 'Opportunity not found' using errcode = 'P0002';
  end if;
  if v_status not in ('candidate', 'in_review') then
    raise exception 'Opportunity already reviewed' using errcode = '23505';
  end if;
  if not exists (
    select 1 from public.opportunity_sources
     where organization_id = p_organization_id and opportunity_id = p_opportunity_id
  ) then
    raise exception 'Opportunity requires a source' using errcode = '23514';
  end if;

  update public.growth_opportunities
     set status = p_decision, updated_at = now()
   where organization_id = p_organization_id and id = p_opportunity_id;

  insert into public.opportunity_decisions
    (organization_id, opportunity_id, actor_user_id, decision, reason)
  values (p_organization_id, p_opportunity_id, v_actor, p_decision, btrim(p_reason))
  returning id into v_decision_id;

  insert into public.audit_events
    (organization_id, actor_user_id, event_type, object_type, object_id, details)
  values (p_organization_id, v_actor, 'growth_opportunity_reviewed',
          'growth_opportunity', p_opportunity_id,
          jsonb_build_object('decision', p_decision, 'decision_id', v_decision_id));

  return v_decision_id;
end;
$$;

revoke all on function public.review_growth_opportunity(uuid, uuid, text, text) from public, anon;
grant execute on function public.review_growth_opportunity(uuid, uuid, text, text) to authenticated;
