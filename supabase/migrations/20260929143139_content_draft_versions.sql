-- Isolated Growth OS staging. Append-only drafts; there is no publishing action.
create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null,
  version_number integer not null check (version_number > 0),
  title text not null check (length(btrim(title)) between 1 and 160),
  draft_body text not null check (length(btrim(draft_body)) between 1 and 10000),
  status text not null default 'draft' check (status = 'draft'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, opportunity_id, version_number),
  foreign key (organization_id, opportunity_id)
    references public.growth_opportunities(organization_id, id) on delete cascade
);

create index content_versions_parent_idx on public.content_versions
  (organization_id, opportunity_id, version_number desc);
alter table public.content_versions enable row level security;
create policy content_versions_read_members on public.content_versions for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
revoke all on public.content_versions from public, anon, authenticated;
grant select on public.content_versions to authenticated;

create function private.create_content_draft_impl(
  p_organization_id uuid, p_opportunity_id uuid, p_title text, p_draft_body text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_version integer;
  v_id uuid;
begin
  if v_actor is null or not private.has_org_role(p_organization_id, array['owner']::text[]) then
    raise exception 'Not authorized to create content drafts' using errcode = '42501';
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 160
     or p_draft_body is null or length(btrim(p_draft_body)) not between 1 and 10000 then
    raise exception 'Invalid draft content' using errcode = '22023';
  end if;
  -- The parent lock serializes version numbers for this opportunity.
  select status into v_status from public.growth_opportunities
   where organization_id = p_organization_id and id = p_opportunity_id for update;
  if not found then
    raise exception 'Opportunity not found' using errcode = 'P0002';
  end if;
  if v_status <> 'approved' or not exists (
    select 1 from public.opportunity_sources
     where organization_id = p_organization_id and opportunity_id = p_opportunity_id
  ) or not exists (
    select 1 from public.opportunity_decisions
     where organization_id = p_organization_id and opportunity_id = p_opportunity_id and decision = 'approved'
  ) then
    raise exception 'Approved opportunity with source and decision required' using errcode = '23514';
  end if;
  select coalesce(max(version_number), 0) + 1 into v_version from public.content_versions
   where organization_id = p_organization_id and opportunity_id = p_opportunity_id;
  insert into public.content_versions
    (organization_id, opportunity_id, version_number, title, draft_body, created_by)
  values (p_organization_id, p_opportunity_id, v_version, btrim(p_title), btrim(p_draft_body), v_actor)
  returning id into v_id;
  insert into public.audit_events
    (organization_id, actor_user_id, event_type, object_type, object_id, details)
  values (p_organization_id, v_actor, 'content_draft_created', 'content_version', v_id,
          jsonb_build_object('opportunity_id', p_opportunity_id, 'version_number', v_version));
  return v_id;
end;
$$;

create function public.create_content_draft(
  p_organization_id uuid, p_opportunity_id uuid, p_title text, p_draft_body text
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.create_content_draft_impl($1,$2,$3,$4);
$$;
revoke all on function private.create_content_draft_impl(uuid,uuid,text,text) from public,anon;
revoke all on function public.create_content_draft(uuid,uuid,text,text) from public,anon;
grant execute on function private.create_content_draft_impl(uuid,uuid,text,text) to authenticated;
grant execute on function public.create_content_draft(uuid,uuid,text,text) to authenticated;
