-- A first-party business profile is authored and approved by the org owner.
-- The privileged writes live in a non-exposed schema; public RPC wrappers
-- have invoker privileges and never accept an actor ID from the client.
create or replace function private.save_business_profile_impl(
  p_organization_id uuid, p_site_id uuid, p_display_name text,
  p_audience_summary text, p_offering_summary text,
  p_primary_outcome text, p_target_market text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null or not private.has_org_role(p_organization_id, array['owner']::text[]) then
    raise exception 'Not authorized to save this profile' using errcode = '42501';
  end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 160
     or p_audience_summary is null or length(btrim(p_audience_summary)) not between 1 and 1000
     or p_offering_summary is null or length(btrim(p_offering_summary)) not between 1 and 1000
     or p_target_market is null or length(btrim(p_target_market)) not between 1 and 160
     or p_primary_outcome is null
     or p_primary_outcome not in ('order','qualified_lead','booking','subscription') then
    raise exception 'Invalid business profile' using errcode = '22023';
  end if;
  if p_site_id is not null and not exists (
    select 1 from public.sites where id = p_site_id
      and organization_id = p_organization_id and verified_at is not null
  ) then
    raise exception 'Site not verified for organization' using errcode = '23514';
  end if;

  insert into public.business_profiles
    (organization_id, site_id, display_name, audience_summary,
     offering_summary, primary_outcome, target_market)
  values
    (p_organization_id, p_site_id, btrim(p_display_name),
     btrim(p_audience_summary), btrim(p_offering_summary),
     p_primary_outcome, btrim(p_target_market))
  on conflict (organization_id) do update
    set site_id = excluded.site_id,
        display_name = excluded.display_name,
        audience_summary = excluded.audience_summary,
        offering_summary = excluded.offering_summary,
        primary_outcome = excluded.primary_outcome,
        target_market = excluded.target_market,
        review_status = 'draft', reviewed_by = null, reviewed_at = null,
        updated_at = now()
    where (business_profiles.site_id, business_profiles.display_name,
           business_profiles.audience_summary, business_profiles.offering_summary,
           business_profiles.primary_outcome, business_profiles.target_market)
      is distinct from
          (excluded.site_id, excluded.display_name,
           excluded.audience_summary, excluded.offering_summary,
           excluded.primary_outcome, excluded.target_market)
  returning id into v_id;

  if v_id is not null then
    insert into public.audit_events
      (organization_id,actor_user_id,event_type,object_type,object_id)
    values (p_organization_id,v_actor,'business_profile_saved','business_profile',v_id);
  else
    select id into v_id from public.business_profiles
     where organization_id = p_organization_id;
  end if;
  return v_id;
end;
$$;

create or replace function private.approve_business_profile_impl(p_organization_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_status text;
begin
  if v_actor is null or not private.has_org_role(p_organization_id, array['owner']::text[]) then
    raise exception 'Not authorized to approve this profile' using errcode = '42501';
  end if;
  select id, review_status into v_id, v_status from public.business_profiles
   where organization_id = p_organization_id for update;
  if not found then
    raise exception 'Business profile not found' using errcode = 'P0002';
  end if;
  if v_status <> 'draft' then
    raise exception 'Business profile already approved' using errcode = '23505';
  end if;
  update public.business_profiles
     set review_status = 'owner_approved', reviewed_by = v_actor,
         reviewed_at = now(), updated_at = now()
   where id = v_id and organization_id = p_organization_id;
  insert into public.audit_events
    (organization_id,actor_user_id,event_type,object_type,object_id)
  values (p_organization_id,v_actor,'business_profile_approved','business_profile',v_id);
  return v_id;
end;
$$;

create or replace function public.save_business_profile(
  p_organization_id uuid, p_site_id uuid, p_display_name text,
  p_audience_summary text, p_offering_summary text,
  p_primary_outcome text, p_target_market text
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.save_business_profile_impl($1,$2,$3,$4,$5,$6,$7);
$$;

create or replace function public.approve_business_profile(p_organization_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.approve_business_profile_impl($1);
$$;

revoke all on function private.save_business_profile_impl(uuid,uuid,text,text,text,text,text) from public,anon;
revoke all on function private.approve_business_profile_impl(uuid) from public,anon;
revoke all on function public.save_business_profile(uuid,uuid,text,text,text,text,text) from public,anon;
revoke all on function public.approve_business_profile(uuid) from public,anon;
grant execute on function private.save_business_profile_impl(uuid,uuid,text,text,text,text,text) to authenticated;
grant execute on function private.approve_business_profile_impl(uuid) to authenticated;
grant execute on function public.save_business_profile(uuid,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.approve_business_profile(uuid) to authenticated;
