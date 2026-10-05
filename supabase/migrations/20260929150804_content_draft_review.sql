-- Isolated Growth OS staging. A review is tied to one immutable draft version.
-- Review approval is internal intent only and never publishes anything.
create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved','rejected')),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  reviewed_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, version_id),
  foreign key (organization_id, version_id)
    references public.content_versions(organization_id, id) on delete cascade
);
create index content_reviews_version_idx on public.content_reviews (organization_id, version_id);
alter table public.content_reviews enable row level security;
create policy content_reviews_read_members on public.content_reviews for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
revoke all on public.content_reviews from public, anon, authenticated;
grant select on public.content_reviews to authenticated;

create function private.review_content_draft_impl(
  p_organization_id uuid, p_version_id uuid, p_decision text, p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_opportunity_id uuid;
  v_version_number integer;
  v_status text;
  v_review_id uuid;
begin
  if v_actor is null or not private.has_org_role(p_organization_id, array['owner']::text[]) then
    raise exception 'Not authorized to review content drafts' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved','rejected')
     or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'Invalid content decision or reason' using errcode = '22023';
  end if;
  select opportunity_id, version_number into v_opportunity_id, v_version_number
    from public.content_versions
   where organization_id = p_organization_id and id = p_version_id;
  if not found then
    raise exception 'Content version not found' using errcode = 'P0002';
  end if;
  -- Also used by draft creation, this parent lock serializes a review with new versions.
  select status into v_status from public.growth_opportunities
   where organization_id = p_organization_id and id = v_opportunity_id for update;
  if v_status <> 'approved' then
    raise exception 'Approved opportunity required' using errcode = '23514';
  end if;
  if exists (select 1 from public.content_reviews
             where organization_id = p_organization_id and version_id = p_version_id) then
    raise exception 'Content version already reviewed' using errcode = '23505';
  end if;
  if v_version_number <> (select max(version_number) from public.content_versions
                           where organization_id = p_organization_id and opportunity_id = v_opportunity_id) then
    raise exception 'Only the latest content version can be reviewed' using errcode = '23514';
  end if;
  insert into public.content_reviews (organization_id, version_id, actor_user_id, decision, reason)
  values (p_organization_id, p_version_id, v_actor, p_decision, btrim(p_reason))
  returning id into v_review_id;
  insert into public.audit_events
    (organization_id, actor_user_id, event_type, object_type, object_id, details)
  values (p_organization_id, v_actor, 'content_draft_reviewed', 'content_version', p_version_id,
          jsonb_build_object('decision', p_decision, 'review_id', v_review_id));
  return v_review_id;
end;
$$;

create function public.review_content_draft(
  p_organization_id uuid, p_version_id uuid, p_decision text, p_reason text
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.review_content_draft_impl($1,$2,$3,$4);
$$;
revoke all on function private.review_content_draft_impl(uuid,uuid,text,text) from public,anon;
revoke all on function public.review_content_draft(uuid,uuid,text,text) from public,anon;
grant execute on function private.review_content_draft_impl(uuid,uuid,text,text) to authenticated;
grant execute on function public.review_content_draft(uuid,uuid,text,text) to authenticated;
