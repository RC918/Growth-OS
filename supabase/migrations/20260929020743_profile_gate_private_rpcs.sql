-- A new candidate needs an owner-approved business profile. Keep privileged
-- mutations in the non-exposed schema and expose only invoker wrappers.
create or replace function private.create_growth_opportunity_impl(
  p_organization_id uuid, p_site_id uuid, p_channel text,
  p_audience_need text, p_proposed_action text, p_rationale text,
  p_source_kind text, p_evidence_note text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_opportunity_id uuid;
begin
  if v_actor is null or not private.has_org_role(p_organization_id, array['owner']::text[]) then
    raise exception 'Not authorized to create an opportunity' using errcode = '42501';
  end if;
  if p_channel is null or p_channel not in ('organic_search','ai_discovery','owned_content','distribution')
     or p_audience_need is null or length(btrim(p_audience_need)) not between 1 and 500
     or p_proposed_action is null or length(btrim(p_proposed_action)) not between 1 and 1000
     or p_rationale is null or length(btrim(p_rationale)) not between 1 and 1000
     or p_source_kind is null or p_source_kind not in ('owner_question','research_note')
     or p_evidence_note is null or length(btrim(p_evidence_note)) not between 1 and 1000 then
    raise exception 'Invalid candidate or self-reported source' using errcode = '22023';
  end if;
  if p_site_id is not null and not exists (
    select 1 from public.sites
     where organization_id = p_organization_id
       and id = p_site_id and verified_at is not null
  ) then
    raise exception 'Site not verified for organization' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.business_profiles
     where organization_id = p_organization_id and review_status = 'owner_approved'
  ) then
    raise exception 'Approved business profile required' using errcode = '23514';
  end if;

  insert into public.growth_opportunities
    (organization_id, site_id, channel, audience_need, proposed_action,
     rationale, status, evidence_confidence)
  values
    (p_organization_id, p_site_id, p_channel, btrim(p_audience_need),
     btrim(p_proposed_action), btrim(p_rationale), 'candidate', 'low')
  returning id into v_opportunity_id;
  insert into public.opportunity_sources
    (organization_id, opportunity_id, source_kind, evidence_note, observed_at)
  values (p_organization_id, v_opportunity_id, p_source_kind, btrim(p_evidence_note), now());
  insert into public.audit_events
    (organization_id, actor_user_id, event_type, object_type, object_id, details)
  values (p_organization_id, v_actor, 'growth_opportunity_created',
          'growth_opportunity', v_opportunity_id,
          jsonb_build_object('source_kind', p_source_kind));
  return v_opportunity_id;
end;
$$;

create or replace function private.review_growth_opportunity_impl(
  p_organization_id uuid, p_opportunity_id uuid,
  p_decision text, p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $$
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
  select status into v_status from public.growth_opportunities
   where organization_id = p_organization_id and id = p_opportunity_id for update;
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

create or replace function public.create_growth_opportunity(
  p_organization_id uuid, p_site_id uuid, p_channel text,
  p_audience_need text, p_proposed_action text, p_rationale text,
  p_source_kind text, p_evidence_note text
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.create_growth_opportunity_impl($1,$2,$3,$4,$5,$6,$7,$8);
$$;

create or replace function public.review_growth_opportunity(
  p_organization_id uuid, p_opportunity_id uuid,
  p_decision text, p_reason text
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.review_growth_opportunity_impl($1,$2,$3,$4);
$$;

revoke all on function private.create_growth_opportunity_impl(uuid,uuid,text,text,text,text,text,text) from public,anon;
revoke all on function private.review_growth_opportunity_impl(uuid,uuid,text,text) from public,anon;
revoke all on function public.create_growth_opportunity(uuid,uuid,text,text,text,text,text,text) from public,anon;
revoke all on function public.review_growth_opportunity(uuid,uuid,text,text) from public,anon;
grant execute on function private.create_growth_opportunity_impl(uuid,uuid,text,text,text,text,text,text) to authenticated;
grant execute on function private.review_growth_opportunity_impl(uuid,uuid,text,text) to authenticated;
grant execute on function public.create_growth_opportunity(uuid,uuid,text,text,text,text,text,text) to authenticated;
grant execute on function public.review_growth_opportunity(uuid,uuid,text,text) to authenticated;
