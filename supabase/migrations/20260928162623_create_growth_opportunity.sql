-- Owner-submitted candidate with one explicitly self-reported source.
-- Do not use this path to claim measured search demand or GSC evidence.
create or replace function public.create_growth_opportunity(
  p_organization_id uuid,
  p_site_id uuid,
  p_channel text,
  p_audience_need text,
  p_proposed_action text,
  p_rationale text,
  p_source_kind text,
  p_evidence_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.create_growth_opportunity(uuid, uuid, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.create_growth_opportunity(uuid, uuid, text, text, text, text, text, text)
  to authenticated;
