-- Internal publication preparation in isolated Growth OS Staging.
-- A proposed path is not a live URL; this migration never publishes content.
create table public.content_action_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  proposed_path text not null check (proposed_path ~ '^/[a-z0-9][a-z0-9/_-]{0,199}$'),
  success_signal text not null check (length(btrim(success_signal)) between 1 and 1000),
  rollback_plan text not null check (length(btrim(rollback_plan)) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, version_id),
  foreign key (organization_id, version_id)
    references public.content_versions(organization_id, id) on delete cascade
);
create index content_action_plans_version_idx on public.content_action_plans (organization_id, version_id);
alter table public.content_action_plans enable row level security;
create policy content_action_plans_read_members on public.content_action_plans for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
revoke all on public.content_action_plans from public, anon, authenticated;
grant select on public.content_action_plans to authenticated;

create function private.plan_content_action_impl(
  p_organization_id uuid, p_version_id uuid, p_proposed_path text,
  p_success_signal text, p_rollback_plan text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_opportunity_id uuid;
  v_number integer;
  v_status text;
  v_plan_id uuid;
begin
  if v_actor is null or not private.has_org_role(p_organization_id, array['owner']::text[]) then
    raise exception 'Not authorized to plan content actions' using errcode = '42501';
  end if;
  if p_proposed_path is null or p_proposed_path !~ '^/[a-z0-9][a-z0-9/_-]{0,199}$'
     or p_success_signal is null or length(btrim(p_success_signal)) not between 1 and 1000
     or p_rollback_plan is null or length(btrim(p_rollback_plan)) not between 1 and 1000 then
    raise exception 'Invalid action plan' using errcode = '22023';
  end if;
  select opportunity_id, version_number into v_opportunity_id, v_number
    from public.content_versions
   where organization_id = p_organization_id and id = p_version_id;
  if not found then
    raise exception 'Content version not found' using errcode = 'P0002';
  end if;
  -- The same parent lock serializes new versions, review, and action planning.
  select status into v_status from public.growth_opportunities
   where organization_id = p_organization_id and id = v_opportunity_id for update;
  if v_status <> 'approved' then
    raise exception 'Approved opportunity required' using errcode = '23514';
  end if;
  if v_number <> (select max(version_number) from public.content_versions
                   where organization_id = p_organization_id and opportunity_id = v_opportunity_id)
     or not exists (select 1 from public.content_reviews
                     where organization_id = p_organization_id and version_id = p_version_id
                       and decision = 'approved') then
    raise exception 'Latest approved content version required' using errcode = '23514';
  end if;
  if exists (select 1 from public.content_action_plans
             where organization_id = p_organization_id and version_id = p_version_id) then
    raise exception 'Action already planned for version' using errcode = '23505';
  end if;
  insert into public.content_action_plans
    (organization_id, version_id, actor_user_id, proposed_path, success_signal, rollback_plan)
  values (p_organization_id, p_version_id, v_actor, p_proposed_path,
          btrim(p_success_signal), btrim(p_rollback_plan))
  returning id into v_plan_id;
  insert into public.audit_events
    (organization_id, actor_user_id, event_type, object_type, object_id, details)
  values (p_organization_id, v_actor, 'content_action_planned', 'content_version', p_version_id,
          jsonb_build_object('plan_id', v_plan_id, 'proposed_path', p_proposed_path));
  return v_plan_id;
end;
$$;

create function public.plan_content_action(
  p_organization_id uuid, p_version_id uuid, p_proposed_path text,
  p_success_signal text, p_rollback_plan text
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.plan_content_action_impl($1,$2,$3,$4,$5);
$$;
revoke all on function private.plan_content_action_impl(uuid,uuid,text,text,text) from public,anon;
revoke all on function public.plan_content_action(uuid,uuid,text,text,text) from public,anon;
grant execute on function private.plan_content_action_impl(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.plan_content_action(uuid,uuid,text,text,text) to authenticated;
