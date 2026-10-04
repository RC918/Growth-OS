begin;
-- Commerce Growth v0.1: starting schema for Postgres/Supabase.
-- Design artifact, not yet applied to a production database.
create extension if not exists pgcrypto;

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_model text not null check (business_model in ('ecommerce','trade')),
  created_at timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  primary key (organization_id, user_id)
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  origin text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, origin)
);

create table scans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  site_id uuid,
  requested_url text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  error_code text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, site_id) references sites(organization_id, id)
);

create table findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  scan_id uuid not null references scans(id) on delete cascade,
  rule_code text not null,
  severity text not null check (severity in ('info','low','medium','high')),
  evidence_url text not null,
  evidence_excerpt text,
  observed_at timestamptz not null,
  confidence text not null check (confidence in ('low','medium','high')),
  limitations text,
  unique (scan_id, rule_code, evidence_url),
  unique (organization_id, id),
  foreign key (organization_id, scan_id) references scans(organization_id, id)
);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid not null,
  source text not null check (source in ('ga4','ad_platform','store','crm','gsc')),
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  coverage_start date,
  coverage_end date,
  error_summary jsonb,
  imported_at timestamptz not null default now(),
  unique (organization_id, source, idempotency_key),
  unique (organization_id, id),
  foreign key (organization_id, site_id) references sites(organization_id, id),
  check (coverage_end is null or coverage_start is null or coverage_end >= coverage_start)
);

-- Distinct counts must be computed from consented, de-identified source data before writing this table.
-- A missing metric is NULL, not zero. Date boundaries use the organization's configured reporting timezone.
create table funnel_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid not null,
  import_batch_id uuid not null,
  report_date date not null,
  source text not null,
  medium text not null,
  campaign text not null default '',
  landing_path text not null default '/',
  device text not null default 'unknown',
  currency char(3),
  ad_clicks integer check (ad_clicks >= 0),
  landing_sessions integer check (landing_sessions >= 0),
  engaged_sessions integer check (engaged_sessions >= 0),
  form_starts integer check (form_starts >= 0),
  leads integer check (leads >= 0),
  qualified_leads integer check (qualified_leads >= 0),
  checkouts integer check (checkouts >= 0),
  purchases integer check (purchases >= 0),
  refunds integer check (refunds >= 0),
  gross_revenue numeric(16,2) check (gross_revenue >= 0),
  refunded_revenue numeric(16,2) check (refunded_revenue >= 0),
  data_quality jsonb not null default '{}'::jsonb,
  unique (organization_id, id),
  unique (import_batch_id, report_date, source, medium, campaign, landing_path, device),
  foreign key (organization_id, site_id) references sites(organization_id, id),
  foreign key (organization_id, import_batch_id) references import_batches(organization_id, id)
);

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid not null,
  finding_id uuid,
  title text not null,
  rationale text not null,
  evidence_type text not null check (evidence_type in ('observed','associated','estimated')),
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','executed')),
  impact_score smallint check (impact_score between 1 and 5),
  confidence_score smallint check (confidence_score between 1 and 5),
  effort_score smallint check (effort_score between 1 and 5),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, site_id) references sites(organization_id, id),
  foreign key (organization_id, finding_id) references findings(organization_id, id)
);

create table actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  recommendation_id uuid not null,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  executed_at timestamptz,
  page_url text,
  version_label text,
  rollback_note text,
  unique (organization_id, id),
  foreign key (organization_id, recommendation_id) references recommendations(organization_id, id),
  check ((approved_by is null and approved_at is null) or (approved_by is not null and approved_at is not null))
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  event_type text not null,
  object_type text not null,
  object_id uuid,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create index scans_owner_status_idx on scans(organization_id, status, requested_at desc);
create index funnel_segment_idx on funnel_daily(organization_id, site_id, report_date, source, landing_path);
create index actions_owner_idx on actions(organization_id, approved_at desc);
create index audit_owner_time_idx on audit_events(organization_id, occurred_at desc);

-- Migration implementation gate: enable RLS on all tenant tables and add policies
-- using auth.uid() membership; public scans must be exposed only through a
-- rate-limited service endpoint. Never expose service-role credentials to Web UI.
-- Before deployment, test cross-tenant SELECT/INSERT/UPDATE/DELETE and storage policies.
-- Sprint 2 tenant policies. Apply only after 202609280001_initial.sql.
-- Designed for Supabase Auth; requires live Postgres/RLS tests before Staging use.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- SECURITY DEFINER avoids recursive RLS on organization_members. The migration
-- owner must be a trusted role that can read that table; never re-own these
-- functions to a client-controlled role. Explicitly qualify every object.
create or replace function private.has_org_role(target_org uuid, allowed_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.role = any(allowed_roles)
  );
$$;

revoke all on function private.has_org_role(uuid, text[]) from public, anon;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;

-- No direct client INSERT policy on organizations or organization_members.
-- A trusted server must authenticate the caller and atomically create the
-- organization and owner membership. It must not accept a caller-supplied
-- user_id as proof of identity.

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.sites enable row level security;
alter table public.scans enable row level security;
alter table public.findings enable row level security;
alter table public.import_batches enable row level security;
alter table public.funnel_daily enable row level security;
alter table public.recommendations enable row level security;
alter table public.actions enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_read_members on public.organizations
  for select to authenticated
  using (private.has_org_role(id, array['owner','editor','viewer']::text[]));

create policy members_read_workspace on public.organization_members
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));

create policy sites_read_workspace on public.sites
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));

-- Anonymous public scans are accessible only through a bounded service endpoint.
-- Client roles cannot read rows with organization_id NULL via this policy.
create policy scans_read_workspace on public.scans
  for select to authenticated
  using (organization_id is not null and
         private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));

create policy findings_read_workspace on public.findings
  for select to authenticated
  using (organization_id is not null and
         private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));

create policy imports_read_workspace on public.import_batches
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));

create policy funnel_read_workspace on public.funnel_daily
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));

create policy recommendations_read_workspace on public.recommendations
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));

create policy actions_read_workspace on public.actions
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));

create policy audit_read_owner on public.audit_events
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner']::text[]));

-- No direct client INSERT/UPDATE/DELETE policies are provided for tenant data.
-- Mutations must go through narrowly scoped server transactions that verify
-- both membership role and site ownership. A service-role connection bypasses
-- RLS, so its authorization checks are an additional mandatory release gate.
-- Growth OS traffic-first data contract. Apply after initial and tenant_rls.
-- All writes are trusted-server operations with separate caller authorization.
-- No customer names, email addresses or raw inquiries belong in evidence_note.

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid,
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  audience_summary text not null check (length(btrim(audience_summary)) between 1 and 1000),
  offering_summary text not null check (length(btrim(offering_summary)) between 1 and 1000),
  primary_outcome text not null check (primary_outcome in ('order','qualified_lead','booking','subscription')),
  target_market text not null check (length(btrim(target_market)) between 1 and 160),
  review_status text not null default 'draft' check (review_status in ('draft','owner_approved')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id),
  unique (organization_id, id),
  foreign key (organization_id, site_id) references public.sites(organization_id, id),
  check ((review_status = 'draft' and reviewed_by is null and reviewed_at is null)
      or (review_status = 'owner_approved' and reviewed_by is not null and reviewed_at is not null))
);

create table public.growth_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid,
  channel text not null check (channel in ('organic_search','ai_discovery','owned_content','distribution')),
  audience_need text not null check (length(btrim(audience_need)) between 1 and 500),
  proposed_action text not null check (length(btrim(proposed_action)) between 1 and 1000),
  rationale text not null check (length(btrim(rationale)) between 1 and 1000),
  status text not null default 'candidate' check (status in ('candidate','in_review','approved','rejected','published','measured')),
  evidence_confidence text not null default 'low' check (evidence_confidence in ('low','medium','high')),
  impact_score smallint check (impact_score between 1 and 5),
  effort_score smallint check (effort_score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, site_id) references public.sites(organization_id, id)
);

create table public.opportunity_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null,
  source_kind text not null check (source_kind in ('owner_question','product_catalog','public_page','gsc_query','research_note')),
  source_url text,
  evidence_note text not null check (length(btrim(evidence_note)) between 1 and 1000),
  observed_at timestamptz not null,
  captured_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, opportunity_id) references public.growth_opportunities(organization_id, id) on delete cascade,
  check (source_url is null or (source_url ~ '^https://[^[:space:]]+$' and length(source_url) <= 2048))
);

create table public.opportunity_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved','rejected')),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  decided_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, opportunity_id) references public.growth_opportunities(organization_id, id) on delete cascade
);

create index growth_opportunities_queue_idx on public.growth_opportunities(organization_id, status, created_at desc);
create index opportunity_sources_parent_idx on public.opportunity_sources(organization_id, opportunity_id);
create index opportunity_decisions_parent_idx on public.opportunity_decisions(organization_id, opportunity_id, decided_at desc);

alter table public.business_profiles enable row level security;
alter table public.growth_opportunities enable row level security;
alter table public.opportunity_sources enable row level security;
alter table public.opportunity_decisions enable row level security;

create policy business_profiles_read_members on public.business_profiles for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
create policy growth_opportunities_read_members on public.growth_opportunities for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
create policy opportunity_sources_read_members on public.opportunity_sources for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));
create policy opportunity_decisions_read_members on public.opportunity_decisions for select to authenticated
  using (private.has_org_role(organization_id, array['owner','editor','viewer']::text[]));

-- Explicit Data API opt-in; no anon grant and no direct authenticated writes.
revoke all on public.business_profiles, public.growth_opportunities,
  public.opportunity_sources, public.opportunity_decisions from anon, authenticated;
grant select on public.business_profiles, public.growth_opportunities,
  public.opportunity_sources, public.opportunity_decisions to authenticated;
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
-- Immutable, caller-supplied observations in isolated Growth OS Staging.
create function private.observation_keys(value jsonb, expected text[])
returns boolean language sql immutable security invoker set search_path = '' as $$
  select jsonb_typeof(value)='object' and
    (select array_agg(k order by k) from jsonb_object_keys(value) k)=expected;
$$;
create function private.observation_path(value text)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare bytes bytea := ''::bytea; decoded text; i integer := 1; ch text;
begin
  if value is null or length(value)>300 or left(value,1)<>'/' then return false; end if;
  while i<=length(value) loop
    ch:=substr(value,i,1);
    if ch='%' then
      if substr(value,i+1,2) !~ '^[0-9A-Fa-f]{2}$' then return false; end if;
      bytes:=bytes || decode(substr(value,i+1,2),'hex'); i:=i+3;
    else bytes:=bytes || convert_to(ch,'UTF8'); i:=i+1;
    end if;
  end loop;
  decoded:=convert_from(bytes,'UTF8');
  return left(decoded,2)<>'//' and decoded !~ '[[:space:][:cntrl:]\\?#]'
    and decoded !~ '(^|/)[.]{1,2}(/|$)';
exception when others then return false;
end $$;
create function private.valid_search_observation(payload jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; meta jsonb; row_data jsonb; action jsonb; start_day date; end_day date;
  seen text[]; clicks numeric; impressions numeric; sum_clicks numeric; sum_impressions numeric;
begin
  if payload is null or octet_length(payload::text)>1000000
     or not private.observation_keys(payload,array['a','actions','b','format','version'])
     or payload->>'format'<>'growth-os-search-baseline' or payload->'version'<>'2'::jsonb
     or jsonb_typeof(payload->'actions')<>'array' or jsonb_array_length(payload->'actions')>20 then return false; end if;
  for item in select value from jsonb_array_elements(jsonb_build_array(payload->'a',payload->'b')) loop
    if item='null'::jsonb then continue; end if;
    if not private.observation_keys(item,array['meta','rows','sample']) or jsonb_typeof(item->'sample')<>'boolean'
       or jsonb_typeof(item->'rows')<>'array' or jsonb_array_length(item->'rows') not between 1 and 366 then return false; end if;
    meta:=item->'meta';
    if not private.observation_keys(meta,array['end','exported','origin','start','type'])
       or exists(select 1 from jsonb_each(meta) where jsonb_typeof(value)<>'string')
       or meta->>'origin' !~ '^https://[A-Za-z0-9.-]+$' or meta->>'type' not in ('web','image','video','news')
       or meta->>'start' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or meta->>'end' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or meta->>'exported' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' then return false; end if;
    start_day:=(meta->>'start')::date; end_day:=(meta->>'end')::date;
    perform (meta->>'exported')::timestamptz;
    if end_day-start_day not between 0 and 365 then return false; end if;
    seen:=array[]::text[]; sum_clicks:=0; sum_impressions:=0;
    for row_data in select value from jsonb_array_elements(item->'rows') loop
      if not private.observation_keys(row_data,array['clicks','date','impressions'])
         or jsonb_typeof(row_data->'date')<>'string' or row_data->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         or (row_data->>'date')::date not between start_day and end_day
         or row_data->>'date'=any(seen)
         or jsonb_typeof(row_data->'clicks')<>'number' or jsonb_typeof(row_data->'impressions')<>'number' then return false; end if;
      clicks:=(row_data->>'clicks')::numeric; impressions:=(row_data->>'impressions')::numeric;
      if clicks<0 or impressions<0 or clicks<>trunc(clicks) or impressions<>trunc(impressions)
         or (impressions=0 and clicks>0) then return false; end if;
      sum_clicks:=sum_clicks+clicks; sum_impressions:=sum_impressions+impressions;
      if sum_clicks>9007199254740991 or sum_impressions>9007199254740991 then return false; end if;
      seen:=array_append(seen,row_data->>'date');
    end loop;
  end loop;
  if payload->'a'='null'::jsonb then return false; end if;
  for action in select value from jsonb_array_elements(payload->'actions') loop
    if not private.observation_keys(action,array['date','note','path'])
       or exists(select 1 from jsonb_each(action) where jsonb_typeof(value)<>'string')
       or action->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or not private.observation_path(action->>'path')
       or length(btrim(action->>'note')) not between 1 and 240 or action->>'note' ~ '[[:cntrl:]]' then return false; end if;
    perform (action->>'date')::date;
  end loop;
  if (select count(*) from jsonb_array_elements(payload->'actions'))<>
     (select count(distinct value) from jsonb_array_elements(payload->'actions')) then return false; end if;
  return true;
exception when others then return false;
end $$;
create table public.search_observation_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  payload jsonb not null check(private.valid_search_observation(payload)),
  created_at timestamptz not null default now(),
  unique(organization_id,request_id)
);
create index search_observation_versions_org_time_idx on public.search_observation_versions(organization_id,created_at desc,id desc);
alter table public.search_observation_versions enable row level security;
create policy observation_read_members on public.search_observation_versions for select to authenticated
  using(private.has_org_role(organization_id,array['owner','editor','viewer']::text[]));
revoke all on public.search_observation_versions from public,anon,authenticated;
grant select on public.search_observation_versions to authenticated;
create function private.save_search_observation_impl(p_organization_id uuid,p_request_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); result_id uuid; existing jsonb;
begin
  if actor is null or not private.has_org_role(p_organization_id,array['owner']::text[]) then
    raise exception 'Not authorized to save observations' using errcode='42501'; end if;
  if p_request_id is null or not private.valid_search_observation(p_payload) then
    raise exception 'Invalid observation snapshot' using errcode='22023'; end if;
  -- Serialize retries for the organization; no client-chosen revision number.
  perform 1 from public.organizations where id=p_organization_id for update;
  select id,payload into result_id,existing from public.search_observation_versions
    where organization_id=p_organization_id and request_id=p_request_id;
  if found then
    if existing is distinct from p_payload then raise exception 'Retry payload differs' using errcode='22023'; end if;
    return result_id;
  end if;
  insert into public.search_observation_versions(organization_id,request_id,actor_user_id,payload)
    values(p_organization_id,p_request_id,actor,p_payload) returning id into result_id;
  insert into public.audit_events(organization_id,actor_user_id,event_type,object_type,object_id,details)
    values(p_organization_id,actor,'search_observation_saved','search_observation_version',result_id,
      jsonb_build_object('request_id',p_request_id,'provenance','caller_supplied_unverified'));
  return result_id;
end $$;
create function public.save_search_observation(p_organization_id uuid,p_request_id uuid,p_payload jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select private.save_search_observation_impl($1,$2,$3);
$$;
revoke all on function private.observation_keys(jsonb,text[]),private.observation_path(text),private.valid_search_observation(jsonb) from public,anon;
revoke all on function private.save_search_observation_impl(uuid,uuid,jsonb),public.save_search_observation(uuid,uuid,jsonb) from public,anon;
grant execute on function private.observation_keys(jsonb,text[]),private.observation_path(text),private.valid_search_observation(jsonb) to authenticated;
grant execute on function private.save_search_observation_impl(uuid,uuid,jsonb),public.save_search_observation(uuid,uuid,jsonb) to authenticated;
-- M1 additive, immutable guided conversations. Not applied to remote Staging.
create table public.growth_goals (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(organization_id,id)
);
create table public.growth_goal_turns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  goal_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  request_id uuid not null,
  version_number integer not null check(version_number between 1 and 200),
  question_key text not null check(question_key in ('goal','offering','audience','market','channel','asset','metric','confirm')),
  question_text text not null,
  answer_text text not null check(length(btrim(answer_text)) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique(organization_id,request_id),
  unique(goal_id,version_number),
  foreign key(organization_id,goal_id) references public.growth_goals(organization_id,id) on delete cascade
);
create index growth_goals_org_time_idx on public.growth_goals(organization_id,created_at desc,id desc);
create index growth_goal_turns_org_goal_idx on public.growth_goal_turns(organization_id,goal_id,version_number);
alter table public.growth_goals enable row level security;
alter table public.growth_goal_turns enable row level security;
create policy goals_read_members on public.growth_goals for select to authenticated
 using(private.has_org_role(organization_id,array['owner','editor','viewer']::text[]));
create policy goal_turns_read_members on public.growth_goal_turns for select to authenticated
 using(private.has_org_role(organization_id,array['owner','editor','viewer']::text[]));
revoke all on public.growth_goals,public.growth_goal_turns from public,anon,authenticated;
grant select on public.growth_goals,public.growth_goal_turns to authenticated;

-- Private definer is needed for an atomic append: client roles have no direct
-- writes. Authorization is checked on every call against current membership.
create function private.save_goal_turn_impl(p_organization_id uuid,p_goal_id uuid,
 p_request_id uuid,p_expected_version integer,p_question_key text,p_answer text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing public.growth_goal_turns; current_version integer;
 required_key text; prompt text; field text; fields text[]:=array['offering','audience','market','channel','asset','metric'];
begin
 if actor is null or not private.has_org_role(p_organization_id,array['owner']::text[]) then
  raise exception 'Not authorized to save goal' using errcode='42501'; end if;
 if p_goal_id is null or p_request_id is null or p_expected_version is null
  or p_expected_version not between 0 and 199 or p_question_key is null
  or p_answer is null or length(btrim(p_answer)) not between 1 and 2000 then
  raise exception 'Invalid goal turn' using errcode='22023'; end if;
 perform 1 from public.organizations where id=p_organization_id for update;
 select * into existing from public.growth_goal_turns where organization_id=p_organization_id and request_id=p_request_id;
 if found then
  if existing.goal_id<>p_goal_id or existing.version_number<>p_expected_version+1
   or existing.question_key<>p_question_key or existing.answer_text is distinct from p_answer then
   raise exception 'Retry differs' using errcode='22023'; end if;
  return jsonb_build_object('goal_id',p_goal_id,'version_number',existing.version_number);
 end if;
 if p_expected_version=0 then
  if p_question_key<>'goal' then raise exception 'Goal must be first' using errcode='22023'; end if;
  insert into public.growth_goals(id,organization_id,actor_user_id) values(p_goal_id,p_organization_id,actor);
  prompt:='告訴我你正在做什麼，我們一起開始。';
 else
  if not exists(select 1 from public.growth_goals where id=p_goal_id and organization_id=p_organization_id) then
   raise exception 'Goal unavailable' using errcode='42501'; end if;
  select coalesce(max(version_number),0) into current_version from public.growth_goal_turns
   where organization_id=p_organization_id and goal_id=p_goal_id;
  if current_version<>p_expected_version then raise exception 'Goal version changed; reload' using errcode='40001'; end if;
  foreach field in array fields loop
   if not exists(select 1 from public.growth_goal_turns where organization_id=p_organization_id
     and goal_id=p_goal_id and question_key=field) then required_key:=field;exit;end if;
  end loop;
  if p_question_key='confirm' then
   if required_key is not null or p_answer<>'確認' then raise exception 'Cannot confirm incomplete goal' using errcode='22023';end if;
   if (select question_key from public.growth_goal_turns where organization_id=p_organization_id and goal_id=p_goal_id
      order by version_number desc limit 1)='confirm' then raise exception 'Already confirmed' using errcode='22023';end if;
   prompt:='請確認下面資料是否符合你的目標。確認只完成資料收集，尚未建立計畫、發布或取得成長數據。';
  else
   if not (p_question_key=any(fields)) or
     (p_question_key is distinct from required_key and not exists(select 1 from public.growth_goal_turns
       where organization_id=p_organization_id and goal_id=p_goal_id and question_key=p_question_key)) then
    raise exception 'Unexpected question' using errcode='22023';end if;
   prompt:=case p_question_key
    when 'offering' then '你想推廣什麼產品、服務或作品？'
    when 'audience' then '你希望哪些人看見它？'
    when 'market' then '你優先想接觸哪個市場、使用什麼語言？'
    when 'channel' then '你想先從哪個渠道取得流量？第一版先支援網站自然搜尋；其他渠道也可以記錄。'
    when 'asset' then '有可以分享的網站或產品連結嗎？沒有也可以回答「尚無連結」。'
    when 'metric' then '你希望觀察什麼流量指標與期間？例如未來四週的搜尋點擊；不確定也可以說明。' end;
  end if;
 end if;
 insert into public.growth_goal_turns(organization_id,goal_id,actor_user_id,request_id,version_number,question_key,question_text,answer_text)
 values(p_organization_id,p_goal_id,actor,p_request_id,p_expected_version+1,p_question_key,prompt,p_answer);
 insert into public.audit_events(organization_id,actor_user_id,event_type,object_type,object_id,details)
 values(p_organization_id,actor,'goal_turn_saved','growth_goal',p_goal_id,
  jsonb_build_object('request_id',p_request_id,'version_number',p_expected_version+1,'question_key',p_question_key,'mode','guided_v1'));
 return jsonb_build_object('goal_id',p_goal_id,'version_number',p_expected_version+1);
end $$;
create function public.save_goal_turn(p_organization_id uuid,p_goal_id uuid,p_request_id uuid,
 p_expected_version integer,p_question_key text,p_answer text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.save_goal_turn_impl($1,$2,$3,$4,$5,$6);
$$;
revoke all on function private.save_goal_turn_impl(uuid,uuid,uuid,integer,text,text),
 public.save_goal_turn(uuid,uuid,uuid,integer,text,text) from public,anon;
grant execute on function private.save_goal_turn_impl(uuid,uuid,uuid,integer,text,text),
 public.save_goal_turn(uuid,uuid,uuid,integer,text,text) to authenticated;
-- Local fix; not applied to isolated Supabase yet.
-- A stale expected_version is an API conflict, not a retryable SQL transaction.
-- Preserve the invoker boundary and all existing grants/membership checks.
create or replace function public.save_goal_turn(p_organization_id uuid,p_goal_id uuid,p_request_id uuid,
 p_expected_version integer,p_question_key text,p_answer text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 return private.save_goal_turn_impl(p_organization_id,p_goal_id,p_request_id,
  p_expected_version,p_question_key,p_answer);
exception when serialization_failure then
 raise exception 'Goal version changed; reload' using errcode='PT409';
end $$;
-- STAGED ONLY. Remote application requires exact SQL/ACL approval. No activation.
create table private.model_trial (
 singleton boolean primary key default true check(singleton),
 actor_user_id uuid references auth.users(id),
 organization_id uuid references public.organizations(id),
 state text not null default 'staged' check(state in ('staged','active','paused','closed')),
 starts_at timestamptz, deadline timestamptz,
 policy_version text not null default 'gpt41mini-20250414-v2-postusage' check(policy_version='gpt41mini-20250414-v2-postusage'),
 calls_reserved integer not null default 0 check(calls_reserved between 0 and 100),
 spent_nusd bigint not null default 0 check(spent_nusd>=0),
 held_nusd bigint not null default 0 check(held_nusd>=0),
 active_request uuid,
 warnings integer[] not null default '{}',
 check(spent_nusd+held_nusd<=1000000000),
 check((starts_at is null and deadline is null and state='staged') or
 (starts_at is not null and deadline=starts_at+interval '7 days' and actor_user_id is not null and organization_id is not null))
);
insert into private.model_trial(singleton) values(true);
create table private.model_trial_attempts (
 request_id uuid primary key,
 actor_user_id uuid not null, organization_id uuid not null,
 fixture_id text not null check(fixture_id in ('synth-parts-v1','synth-shop-v1')),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 expected_version integer not null check(expected_version=1),
 state text not null check(state in ('reserved','settled','unknown')),
 reserved_nusd bigint not null check(reserved_nusd=420668800),
 actual_nusd bigint, input_tokens integer, output_tokens integer,
 result_code text, created_at timestamptz not null default clock_timestamp(), settled_at timestamptz
);
alter table private.model_trial enable row level security;
alter table private.model_trial_attempts enable row level security;
revoke all on private.model_trial,private.model_trial_attempts from public,anon,authenticated,service_role;

create function public.model_trial_reserve(p_request uuid,p_actor uuid,p_org uuid,p_fixture text,p_hash text,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.model_trial; a private.model_trial_attempts; new_warnings integer[]; begin
 select * into t from private.model_trial where singleton for update;
 if not found then raise exception 'Trial unavailable' using errcode='55000'; end if;
 if p_actor is null or p_org is null or t.actor_user_id is distinct from p_actor or t.organization_id is distinct from p_org
 or not private.has_org_role_for_model_trial(p_org,p_actor)
 then raise exception 'Trial owner required' using errcode='42501'; end if;
 if p_request is null or p_fixture not in ('synth-parts-v1','synth-shop-v1') or p_fixture is null
 or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_version is distinct from 1
 then raise exception 'Invalid trial request' using errcode='22023'; end if;
 select * into a from private.model_trial_attempts where request_id=p_request;
 if found then
  if a.actor_user_id<>p_actor or a.organization_id<>p_org or a.fixture_id<>p_fixture or a.payload_hash<>p_hash or a.expected_version<>p_version
  then raise exception 'Retry differs' using errcode='22023'; end if;
  return jsonb_build_object('dispatch',false,'state',a.state,'calls_reserved',t.calls_reserved,'warnings',t.warnings);
 end if;
 if t.state<>'active' or t.starts_at is null or clock_timestamp()<t.starts_at or clock_timestamp()>=t.deadline-interval '2 minutes'
 then raise exception 'Trial inactive or expired' using errcode='55000'; end if;
 if t.active_request is not null then raise exception 'Trial busy; no automatic retry' using errcode='55000'; end if;
 -- Conservatively reserve TWO slots per single generation: at most 50 calls.
 if t.calls_reserved+2>100 or t.spent_nusd+t.held_nusd+420668800>1000000000
 then raise exception 'Trial quota exhausted' using errcode='54000'; end if;
 new_warnings:=t.warnings;
 if (t.calls_reserved+2>=50 or t.spent_nusd+t.held_nusd+420668800>=500000000) and not(50=any(new_warnings)) then new_warnings:=array_append(new_warnings,50); end if;
 if (t.calls_reserved+2>=80 or t.spent_nusd+t.held_nusd+420668800>=800000000) and not(80=any(new_warnings)) then new_warnings:=array_append(new_warnings,80); end if;
 insert into private.model_trial_attempts(request_id,actor_user_id,organization_id,fixture_id,payload_hash,expected_version,state,reserved_nusd)
 values(p_request,p_actor,p_org,p_fixture,p_hash,p_version,'reserved',420668800);
 update private.model_trial set calls_reserved=calls_reserved+2,held_nusd=held_nusd+420668800,active_request=p_request,warnings=new_warnings where singleton;
 return jsonb_build_object('dispatch',true,'calls_reserved',t.calls_reserved+2,'reserved_nusd',420668800,'warnings',new_warnings,'deadline',t.deadline);
end $$;

-- Server-side verified actor only; this helper is NOT callable by client roles.
create function private.has_org_role_for_model_trial(p_org uuid,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from public.organization_members where organization_id=p_org and user_id=p_actor and role='owner');
$$;
revoke all on function private.has_org_role_for_model_trial(uuid,uuid) from public,anon,authenticated,service_role;

create function public.model_trial_settle(p_request uuid,p_input integer,p_output integer,p_result text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.model_trial; a private.model_trial_attempts; cost bigint; unknown boolean; begin
 select * into t from private.model_trial where singleton for update;
 select * into a from private.model_trial_attempts where request_id=p_request for update;
 if not found then raise exception 'Unknown reservation' using errcode='22023'; end if;
 if p_result is null or p_result not in ('ok','refusal','invalid_output','incomplete','scope_changed','provider_failure','usage_unknown','usage_over_limit')
 then raise exception 'Invalid outcome' using errcode='22023'; end if;
 unknown:=p_input is null or p_output is null or p_input<1 or p_output<0 or p_input>2048 or p_output>1024;
 if a.state<>'reserved' then
  if a.result_code is distinct from p_result or a.input_tokens is distinct from p_input or a.output_tokens is distinct from p_output
  then raise exception 'Settlement differs' using errcode='22023'; end if;
  return jsonb_build_object('state',a.state,'warnings',t.warnings);
 end if;
 if t.active_request is distinct from p_request then raise exception 'Reservation mismatch' using errcode='55000'; end if;
 if unknown then
  -- Timeout, no usage, out-of-policy usage: NEVER release held budget or resume.
  update private.model_trial_attempts set state='unknown',result_code=p_result,input_tokens=p_input,output_tokens=p_output,settled_at=clock_timestamp() where request_id=p_request;
  update private.model_trial set state='paused',active_request=null where singleton;
 else
  cost:=p_input::bigint*400+p_output::bigint*1600;
  if cost>a.reserved_nusd then raise exception 'Cost exceeds reservation' using errcode='54000'; end if;
  update private.model_trial_attempts set state='settled',actual_nusd=cost,input_tokens=p_input,output_tokens=p_output,result_code=p_result,settled_at=clock_timestamp() where request_id=p_request;
  update private.model_trial set held_nusd=held_nusd-a.reserved_nusd,spent_nusd=spent_nusd+cost,active_request=null where singleton;
 end if;
 select * into t from private.model_trial where singleton;
 return jsonb_build_object('state',t.state,'calls_reserved',t.calls_reserved,'spent_nusd',t.spent_nusd,'held_nusd',t.held_nusd,'warnings',t.warnings);
end $$;
revoke all on function public.model_trial_reserve(uuid,uuid,uuid,text,text,integer),public.model_trial_settle(uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function public.model_trial_reserve(uuid,uuid,uuid,text,text,integer),public.model_trial_settle(uuid,integer,integer,text) to service_role;

create function public.model_trial_authorize_dispatch(p_request uuid,p_actor uuid,p_org uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.model_trial; begin
 select * into t from private.model_trial where singleton for update;
 if t.state is distinct from 'active' or t.active_request is distinct from p_request
 or t.actor_user_id is distinct from p_actor or t.organization_id is distinct from p_org
 or not private.has_org_role_for_model_trial(p_org,p_actor)
 or clock_timestamp()>=t.deadline-interval '1 minute'
 or not exists(select from private.model_trial_attempts where request_id=p_request and state='reserved')
 then raise exception 'Dispatch no longer permitted' using errcode='42501'; end if;
 return jsonb_build_object('deadline',t.deadline,'policy_version',t.policy_version);
end $$;
revoke all on function public.model_trial_authorize_dispatch(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.model_trial_authorize_dispatch(uuid,uuid,uuid) to service_role;
-- Narrow follow-up to the already-applied budget migration. No activation/DML.
-- Remote application requires review of this exact constraint-only change.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (
  SELECT FROM pg_catalog.pg_constraint
  WHERE conrelid='private.model_trial'::regclass AND conname='model_trial_check1'
  AND contype='c' AND convalidated
  AND pg_catalog.pg_get_constraintdef(oid,true) =
  'CHECK (starts_at IS NULL AND deadline IS NULL AND state = ''staged''::text OR starts_at IS NOT NULL AND deadline = (starts_at + ''7 days''::interval) AND actor_user_id IS NOT NULL AND organization_id IS NOT NULL)'
 ) THEN RAISE EXCEPTION 'Original trial deadline constraint differs'; END IF;
END $$;
ALTER TABLE private.model_trial DROP CONSTRAINT model_trial_check1;
ALTER TABLE private.model_trial ADD CONSTRAINT model_trial_check1 CHECK (
 (state='staged' AND starts_at IS NULL AND deadline IS NULL)
 OR
 (state IN ('active','paused','closed') AND starts_at IS NOT NULL
  AND deadline IS NOT NULL AND deadline>starts_at
  AND deadline<=starts_at+interval '7 days'
  AND actor_user_id IS NOT NULL AND organization_id IS NOT NULL)
);
COMMIT;
-- UNDEPLOYED CANDIDATE. Explicit offline harness only; never migration discovery.
-- No Auth/session setup, site ownership claim, content approval, or publishing.
begin;

create function private.fr_require(ok boolean, code text) returns void
language plpgsql immutable set search_path='' as $$
begin if ok is distinct from true then raise exception '%',code using errcode='22023'; end if; end $$;
create function private.fr_keys(v jsonb, keys text[]) returns boolean
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)='object' then
 (select array_agg(k order by k) from jsonb_object_keys(v) k) = (select array_agg(k order by k) from unnest(keys) k)
 else false end $$;
create function private.fr_text(v jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and length(btrim(v#>>'{}',
 E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)))>0,false) $$;
create function private.fr_strings(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare x jsonb;
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)=0 then return false; end if;
 for x in select value from jsonb_array_elements(v) loop if not private.fr_text(x) then return false; end if; end loop;
 return true;
end $$;
create function private.fr_utf16_length(t text) returns integer
language sql immutable strict set search_path='' as $$
 select coalesce(sum(case when ascii(substr(t,i,1))>65535 then 2 else 1 end),0)::integer from generate_series(1,length(t)) i $$;
create function private.fr_url(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare raw text:=v#>>'{}'; rest text; authority text; host text; port text:=''; tail text; close_at integer;
 i integer; j integer; cp integer; bytes bytea:=''::bytea; parts text[]; part text; base integer; digit integer; num numeric;
 spaces text:=E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
begin
 if jsonb_typeof(v) is distinct from 'string' or private.fr_utf16_length(raw)>2048 or translate(raw,spaces,'')<>raw or strpos(raw,chr(92))>0 or raw !~* '^https:' then return false; end if;
 -- HTTPS special-scheme parsing also accepts https:host / https:/host. Empty
 -- query/fragment markers have empty URL.search/hash in the accepted JS parser.
 rest:=regexp_replace(substr(raw,7),'^/+','');
 if strpos(rest,'#')>0 then if strpos(rest,'#')<>length(rest) then return false; end if; rest:=left(rest,-1); end if;
 if strpos(rest,'?')>0 then if strpos(rest,'?')<>length(rest) then return false; end if; rest:=left(rest,-1); end if;
 authority:=split_part(rest,'/',1);
 if strpos(authority,'@')>0 then
  if split_part(authority,'@',1) not in ('',':') then return false; end if;
  authority:=substr(authority,strpos(authority,'@')+1);
  if strpos(authority,'@')>0 then return false; end if;
 end if;
 if left(authority,1)='[' then
  close_at:=strpos(authority,']'); if close_at=0 then return false; end if;
  host:=substr(authority,2,close_at-2); tail:=substr(authority,close_at+1);
  if tail<>'' and left(tail,1)<>':' then return false; end if;
  port:=substr(tail,2);
  if host='' or family(host::inet)<>6 or masklen(host::inet)<>128 then return false; end if;
 else
  close_at:=strpos(authority,':');
  if close_at>0 then host:=left(authority,close_at-1); port:=substr(authority,close_at+1); else host:=authority; end if;
 end if;
 if port<>'' then
  if port !~ '^[0-9]+$' then return false; end if;
  if port::numeric>65535 then return false; end if;
 end if;
 if left(authority,1)='[' then return true; end if;
 -- Decode domain escapes before checking forbidden host characters / numeric
 -- hosts, without changing the stored URL or making any DNS/network request.
 i:=1;
 while i<=length(host) loop
  if substr(host,i,1)='%' then
   if substr(host,i+1,2) !~ '^[0-9a-fA-F]{2}$' then return false; end if;
   bytes:=bytes||decode(substr(host,i+1,2),'hex'); i:=i+3;
  else bytes:=bytes||convert_to(substr(host,i,1),'UTF8'); i:=i+1; end if;
 end loop;
 host:=convert_from(bytes,'UTF8');
 if host='' or translate(host,spaces,'')<>host then return false; end if;
 for i in 1..length(host) loop
  cp:=ascii(substr(host,i,1));
  if cp<=32 or cp=127 or strpos('/:#?@[]\^|<>%',substr(host,i,1))>0 then return false; end if;
 end loop;
 parts:=string_to_array(lower(case when right(host,1)='.' then left(host,-1) else host end),'.');
 part:=parts[array_length(parts,1)];
 -- WHATWG numeric hosts: include shortened / hex / octal IPv4 forms, but reject
 -- malformed or overflowing numeric hosts instead of treating them as DNS names.
 if part ~ '^[0-9]+$' or part ~ '^0x[0-9a-f]*$' then
  if array_length(parts,1)>4 then return false; end if;
  for i in 1..array_length(parts,1) loop
   part:=parts[i]; if part='' then return false; end if; base:=10;
   if left(part,2)='0x' then base:=16;part:=substr(part,3);
   elsif length(part)>1 and left(part,1)='0' then base:=8;part:=substr(part,2); end if;
   num:=0;
   for j in 1..length(part) loop
    digit:=strpos('0123456789abcdef',substr(part,j,1))-1;
    if digit<0 or digit>=base then return false; end if;
    num:=num*base+digit;if num>4294967295 then return false; end if;
   end loop;
   if i<array_length(parts,1) and num>255 then return false; end if;
  end loop;
  if num>=power(256::numeric,5-array_length(parts,1)) then return false; end if;
 end if;
 return true;
exception when invalid_text_representation or character_not_in_repertoire or numeric_value_out_of_range then return false;
end $$;

-- WHATWG-style replacement decoding, preserving BOM. PostgreSQL text cannot
-- represent NUL: reject rather than silently changing bytes/HTML or JSON strings.
create function private.fr_decode_utf8(b bytea) returns text
language plpgsql immutable strict set search_path='' as $$
declare i integer:=0; n integer:=octet_length(b); lead integer; cp integer; need integer;
 j integer; x integer; lo integer; hi integer; valid boolean; result text:=''; chunk text:='';
begin
 -- Valid UTF-8 is the common path; avoid a byte-by-byte SQL loop.
 begin return convert_from(b,'UTF8'); exception when character_not_in_repertoire then null; end;
 while i<n loop
  if length(chunk)>=4096 then result:=result||chunk; chunk:=''; end if;
  lead:=get_byte(b,i); i:=i+1;
  if lead<128 then
   perform private.fr_require(lead<>0,'SOURCE_NUL_UNREPRESENTABLE'); chunk:=chunk||chr(lead); continue;
  elsif lead between 194 and 223 then cp:=lead-192; need:=1;
  elsif lead between 224 and 239 then cp:=lead-224; need:=2;
  elsif lead between 240 and 244 then cp:=lead-240; need:=3;
  else chunk:=chunk||chr(65533); continue; end if;
  valid:=true;
  for j in 1..need loop
   lo:=128; hi:=191;
   if j=1 then
    if lead=224 then lo:=160; elsif lead=237 then hi:=159;
    elsif lead=240 then lo:=144; elsif lead=244 then hi:=143; end if;
   end if;
   if i>=n then valid:=false; exit; end if;
   x:=get_byte(b,i);
   if x<lo or x>hi then valid:=false; exit; end if;
   i:=i+1; cp:=cp*64+x-128;
  end loop;
  chunk:=chunk||chr(case when valid then cp else 65533 end);
 end loop;
 return result||chunk;
end $$;

create function private.fr_content_digest(p jsonb) returns text
language plpgsql immutable strict set search_path='' as $$
declare r jsonb:=p->'review'; f jsonb:=p#>'{preview,fields}'; canonical text;
begin
 -- JSON string escaping is applied to individual strings; never strip spaces
 -- from a serialized JSON object. These keys match the accepted JS Review order.
 canonical:='{"schema_version":1,"original_url":'||(r->'original_url')::text||
 ',"final_url":'||(r->'final_url')::text||',"snapshot_id":'||(r->'snapshot_id')::text||
 ',"source_version":'||(r->'source_version')::text||',"revision":'||(r->'revision')::text||
 ',"fields":{"title":'||(f#>'{title,suggested}')::text||',"meta_description":'||(f#>'{meta_description,suggested}')::text||
 ',"description":'||(f#>'{description,suggested}')::text||'}}';
 return 'sha256:'||encode(sha256(convert_to(canonical,'UTF8')),'hex');
end $$;
create function private.fr_refs(refs jsonb, ids jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare x jsonb;
begin
 perform private.fr_require(private.fr_strings(refs),'INVALID_REFERENCES');
 for x in select value from jsonb_array_elements(refs) loop
  perform private.fr_require(ids ? (x#>>'{}'),'UNKNOWN_REFERENCE');
 end loop;
end $$;
create function private.fr_fact(v jsonb, ids jsonb, product jsonb, scoped boolean) returns void
language plpgsql immutable set search_path='' as $$
declare scope jsonb:=v->'product_scope'; x jsonb;
begin
 perform private.fr_require(private.fr_keys(v,array['kind','verification','value','citations']||case when scoped then array['product_scope'] else array[]::text[] end)
 and v->>'kind'='fact' and v->>'verification'='source_asserted' and private.fr_text(v->'value'),'INVALID_FACT');
 perform private.fr_refs(v->'citations',ids);
 if scoped then
  perform private.fr_require(private.fr_keys(scope,array['locator','name_locator','product_name']) and private.fr_text(scope->'locator') and private.fr_text(scope->'name_locator')
  and scope->'product_name'=product->'value','INVALID_PRODUCT_SCOPE');
  for x in select value from jsonb_array_elements(product->'citations') loop
   perform private.fr_require(v->'citations' @> jsonb_build_array(x),'MISSING_NAME_REFERENCE');
  end loop;
 end if;
end $$;

-- Match the bounded JSON walk: each child has a key/index visit and value visit.
create function private.fr_json_bounds(p jsonb) returns boolean
language sql immutable strict set search_path='' as $$
 with recursive walk(value,depth) as (
  select p,0
  union all
  select child.value,w.depth+1 from walk w cross join lateral (
   select value from jsonb_each(case when jsonb_typeof(w.value)='object' then w.value else '{}'::jsonb end)
   union all
   select value from jsonb_array_elements(case when jsonb_typeof(w.value)='array' then w.value else '[]'::jsonb end)
  ) child where w.depth<25
 ) select max(depth)<=24 and 2*count(*)-1<=100000 from (select * from walk limit 50001) bounded $$;

create function private.fr_valid_payload(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare s jsonb:=p->'snapshot'; v jsonb:=p->'review'; preview jsonb:=p->'preview'; facts jsonb:=p->'facts';
 ids jsonb:='{}'; x jsonb; f jsonb; c jsonb; k text; missing jsonb:='[]'; bytes bytea; source_hash text; content_hash text; edited boolean;
 fields text[]:=array['title','meta_description','description'];
begin
 if p is null then return false; end if;
 perform private.fr_require(jsonb_typeof(p)='object' and octet_length(convert_to(p::text,'UTF8'))<=8388608
 and private.fr_json_bounds(p) and not (p ?| array['organization_id','opportunity_id','request_id','expected_version','fixture_context']),'INVALID_PAYLOAD');
 perform private.fr_require(s->'schema_version'='1'::jsonb and jsonb_typeof(s->'id')='string' and s->>'id' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
 and jsonb_typeof(s->'version')='string' and s->>'version' ~ '^[0-9a-f]{64}$','INVALID_SNAPSHOT');
 perform private.fr_require(private.fr_url(s->'original_url') and private.fr_url(s->'final_url'),'INVALID_URL');
 perform private.fr_require(private.fr_text(s->'fetched_at') and s->>'fetched_at' ~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$','INVALID_FETCH_TIME');
 perform (s->>'fetched_at')::timestamptz;
 perform private.fr_require(jsonb_typeof(s->'content_base64')='string' and length(s->>'content_base64')<=1398104
 and s->>'content_base64' ~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$','INVALID_SOURCE_BYTES');
 bytes:=decode(s->>'content_base64','base64');
 perform private.fr_require(octet_length(bytes) between 1 and 1048576 and replace(encode(bytes,'base64'),E'\n','')=s->>'content_base64','INVALID_SOURCE_BYTES');
 source_hash:='sha256:'||encode(sha256(bytes),'hex');
 perform private.fr_require(source_hash=s->>'content_fingerprint' and source_hash='sha256:'||(s->>'version'),'SOURCE_HASH_MISMATCH');
 perform private.fr_require(s->>'encoding'='utf-8-with-replacement' and jsonb_typeof(s->'html')='string' and s->>'html'=private.fr_decode_utf8(bytes),'SOURCE_TEXT_MISMATCH');
 perform private.fr_require(preview->'source_snapshot_id'=s->'id' and preview->'source_version'=s->'version' and preview->'published'='false'::jsonb,'INVALID_PREVIEW_BINDING');
 perform private.fr_require(v->'schema_version'='1'::jsonb and v->>'scope'='page_only' and v->'persisted'='false'::jsonb
 and v->'snapshot_id'=s->'id' and v->'source_version'=s->'version' and v->'original_url'=s->'original_url' and v->'final_url'=s->'final_url'
 and jsonb_typeof(v->'revision')='number' and v->>'revision' ~ '^(0|[1-9][0-9]*)$','INVALID_REVIEW_BINDING');
 perform private.fr_require((v->>'revision')::numeric<=9007199254740991,'INVALID_REVISION');
 perform private.fr_require(private.fr_keys(preview->'fields',fields) and private.fr_keys(v->'original_suggestions',fields)
 and private.fr_keys(v->'edited',fields) and private.fr_keys(v->'fact_checks',fields),'INVALID_FIELDS');
 perform private.fr_require(jsonb_typeof(s->'citations')='array' and jsonb_array_length(s->'citations')>0,'INVALID_CITATIONS');
 for c in select value from jsonb_array_elements(s->'citations') loop
  perform private.fr_require(private.fr_text(c->'id') and not (ids ? (c->>'id')) and c->'snapshot_id'=s->'id' and c->'source_version'=s->'version'
  and c->'url'=s->'final_url' and private.fr_text(c->'locator') and private.fr_text(c->'quote'),'INVALID_CITATION');
  ids:=ids||jsonb_build_object(c->>'id',true);
 end loop;
 perform private.fr_require(p->>'page_type'='product' and p#>>'{extraction,method}' in ('explicit_product_microdata','woocommerce_single_product')
 and private.fr_strings(p#>'{extraction,limitations}') and private.fr_strings(s->'limitations') and preview->>'generation'='extractive_rules','INVALID_EVIDENCE_SCHEMA');
 perform private.fr_require(private.fr_keys(facts,array['product_name','title','meta_description','description','features','use']),'INVALID_FACTS');
 perform private.fr_fact(facts->'product_name',ids,null,false);
 perform private.fr_fact(facts->'description',ids,facts->'product_name',true);
 foreach k in array array['title','meta_description','use'] loop
  if facts->k='null'::jsonb then missing:=missing||jsonb_build_array(k); else perform private.fr_fact(facts->k,ids,null,false); end if;
 end loop;
 perform private.fr_require(jsonb_typeof(facts->'features')='array','INVALID_FEATURES');
 for x in select value from jsonb_array_elements(facts->'features') loop perform private.fr_fact(x,ids,facts->'product_name',true); end loop;
 if jsonb_array_length(facts->'features')=0 then missing:=missing||jsonb_build_array('features'); end if;
 missing:=missing||'["specifications","price","certifications","performance","comparisons","guarantees"]'::jsonb;
 perform private.fr_require(p->'missing'=missing and private.fr_strings(preview->'pending_confirmation')
 and ((preview->'pending_confirmation') - 0)=missing,'INVALID_UNKNOWNS');
 perform private.fr_require(jsonb_typeof(p->'inferences')='array' and jsonb_array_length(p->'inferences')>0,'INVALID_INFERENCES');
 for x in select value from jsonb_array_elements(p->'inferences') loop
  perform private.fr_require(private.fr_keys(x,array['kind','value','basis','citations']) and x->>'kind'='inference' and private.fr_text(x->'value') and private.fr_text(x->'basis'),'INVALID_INFERENCE');
  perform private.fr_refs(x->'citations',ids);
 end loop;
 foreach k in array fields loop
  f:=preview->'fields'->k;
  perform private.fr_require(private.fr_text(f->'suggested') and private.fr_utf16_length(f->>'suggested')<=2000 and jsonb_typeof(f->'original')='string'
  and private.fr_text(v->'original_suggestions'->k) and private.fr_text(f->'reason'),'INVALID_FIELD');
  perform private.fr_refs(f->'citations',ids);
  perform private.fr_require(f->>'original'=coalesce(facts->k->>'value',''),'ORIGINAL_FACT_MISMATCH');
  edited:=(f->'suggested'<>v->'original_suggestions'->k);
  perform private.fr_require(v->'edited'->k=to_jsonb(edited) and f->'user_edited'=to_jsonb(edited)
  and f->>'citation_role'=case when edited then 'reference_only_for_user_edit' else 'source_support' end and jsonb_typeof(v->'fact_checks'->k)='boolean','INVALID_EDIT_ATTRIBUTION');
 end loop;
 content_hash:=private.fr_content_digest(p);
 perform private.fr_require(v->>'content_digest'=content_hash,'CONTENT_DIGEST_MISMATCH');
 c:=v->'confirmation';
 if c is distinct from 'null'::jsonb then
  perform private.fr_require(private.fr_keys(c,array['scope','original_url','final_url','snapshot_id','source_version','revision','content_digest','fact_checks'])
  and c->>'scope'='page_only' and c->>'content_digest'=content_hash and private.fr_keys(c->'fact_checks',fields),'INVALID_PAGE_CONFIRMATION');
  foreach k in array array['original_url','final_url','snapshot_id','source_version','revision'] loop perform private.fr_require(c->k=v->k,'STALE_PAGE_CONFIRMATION'); end loop;
  foreach k in array fields loop perform private.fr_require(c->'fact_checks'->k='true'::jsonb and v->'fact_checks'->k='true'::jsonb,'STALE_FACT_CHECKS'); end loop;
 end if;
 perform private.fr_require(preview->>'status'=case when c='null'::jsonb then 'awaiting_review' else 'locally_confirmed' end,'INVALID_REVIEW_STATUS');
 return true;
end $$;

create function private.fr_request_digest(org uuid, parent uuid, actor uuid, request uuid, expected integer, payload jsonb) returns text
language sql immutable strict set search_path='' as $$
 select 'pg-jsonb-sha256:'||encode(sha256(convert_to(jsonb_build_object('schema_version',1,'organization_id',org,'opportunity_id',parent,
 'actor_user_id',actor,'request_id',request,'expected_version',expected,'payload',payload)::text,'UTF8')),'hex') $$;

alter table public.content_versions
 add column first_result_payload jsonb,
 add column first_result_request_id uuid,
 add column first_result_expected_version integer,
 add column first_result_request_digest text,
 add constraint content_versions_first_result_request_unique unique(organization_id,first_result_request_id);
alter table public.content_versions drop constraint content_versions_title_check;
alter table public.content_versions add constraint content_versions_draft_shape check (coalesce(
 (first_result_payload is null and first_result_request_id is null and first_result_expected_version is null and first_result_request_digest is null
  and length(btrim(title)) between 1 and 160)
 or
 (first_result_payload is not null and first_result_request_id is not null and first_result_expected_version between 0 and 2147483646
  and version_number=first_result_expected_version+1 and private.fr_valid_payload(first_result_payload)
  and title=first_result_payload#>>'{preview,fields,title,suggested}' and draft_body=first_result_payload#>>'{preview,fields,description,suggested}'
  and first_result_request_digest=private.fr_request_digest(organization_id,opportunity_id,created_by,first_result_request_id,first_result_expected_version,first_result_payload)),false));

create function private.save_first_result_draft_impl(p_organization_id uuid,p_opportunity_id uuid,p_request_id uuid,p_expected_version integer,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); old public.content_versions%rowtype; latest integer; status text; result_id uuid; fingerprint text;
begin
 if actor is null or not private.has_org_role(p_organization_id,array['owner']) then raise exception 'Owner required' using errcode='42501'; end if;
 perform private.fr_require(p_opportunity_id is not null and p_request_id is not null and p_expected_version between 0 and 2147483646 and p_payload is not null,'INVALID_REQUEST');
 -- Org first: serialize request IDs without conflicting with legacy INSERT FK KEY SHARE.
 perform 1 from public.organizations where id=p_organization_id for no key update;
 -- Recheck membership after waiting; share-lock the membership until commit so
 -- a simultaneous revocation serializes with this write instead of racing it.
 perform 1 from public.organization_members where organization_id=p_organization_id and user_id=actor and role='owner' for share;
 if not found then raise exception 'Owner membership changed' using errcode='42501'; end if;
 select o.status into status from public.growth_opportunities o where o.organization_id=p_organization_id and o.id=p_opportunity_id for update;
 if not found then raise exception 'Opportunity not found' using errcode='P0002'; end if;
 if status<>'approved' or not exists(select 1 from public.opportunity_sources where organization_id=p_organization_id and opportunity_id=p_opportunity_id)
 or not exists(select 1 from public.opportunity_decisions where organization_id=p_organization_id and opportunity_id=p_opportunity_id and decision='approved') then
  raise exception 'Approved opportunity, source and decision required' using errcode='23514'; end if;
 fingerprint:=private.fr_request_digest(p_organization_id,p_opportunity_id,actor,p_request_id,p_expected_version,p_payload);
 select * into old from public.content_versions where organization_id=p_organization_id and first_result_request_id=p_request_id;
 if found then
  if old.created_by<>actor or old.opportunity_id<>p_opportunity_id or old.first_result_expected_version<>p_expected_version
   or old.first_result_payload is distinct from p_payload or old.first_result_request_digest<>fingerprint then
   raise exception 'Request ID payload differs' using errcode='22023'; end if;
  return old.id;
 end if;
 select coalesce(max(version_number),0) into latest from public.content_versions where organization_id=p_organization_id and opportunity_id=p_opportunity_id;
 if latest<>p_expected_version then raise exception 'Content version changed; read back first' using errcode='PT409'; end if;
 perform private.fr_require(private.fr_valid_payload(p_payload),'INVALID_PAYLOAD');
 insert into public.content_versions(organization_id,opportunity_id,version_number,title,draft_body,created_by,
 first_result_payload,first_result_request_id,first_result_expected_version,first_result_request_digest)
 values(p_organization_id,p_opportunity_id,latest+1,p_payload#>>'{preview,fields,title,suggested}',p_payload#>>'{preview,fields,description,suggested}',actor,
 p_payload,p_request_id,p_expected_version,fingerprint) returning id into result_id;
 insert into public.audit_events(organization_id,actor_user_id,event_type,object_type,object_id,details)
 values(p_organization_id,actor,'first_result_draft_saved','content_version',result_id,jsonb_build_object('request_id',p_request_id,'version_number',latest+1,
 'opportunity_id',p_opportunity_id,'source_digest',p_payload#>>'{snapshot,content_fingerprint}','content_digest',private.fr_content_digest(p_payload),
 'request_digest',fingerprint,'provenance','caller_supplied_unverified','approval','none'));
 return result_id;
end $$;
create function public.save_first_result_draft(p_organization_id uuid,p_opportunity_id uuid,p_request_id uuid,p_expected_version integer,p_payload jsonb)
returns uuid language sql security invoker set search_path='' as $$
 select private.save_first_result_draft_impl($1,$2,$3,$4,$5) $$;

-- Same parent lock and legacy review behavior; typed versions cannot be reviewed.
create or replace function private.review_content_draft_impl(
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
  if exists (select 1 from public.content_versions where organization_id=p_organization_id and id=p_version_id and first_result_payload is not null) then
    raise exception 'Typed first result requires a separate review contract' using errcode='23514';
  end if;
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


-- Exact signatures only: never change unrelated private function ACLs.
revoke all on function
 private.fr_require(boolean,text), private.fr_keys(jsonb,text[]), private.fr_text(jsonb), private.fr_strings(jsonb),
 private.fr_utf16_length(text), private.fr_url(jsonb), private.fr_decode_utf8(bytea), private.fr_content_digest(jsonb),
 private.fr_refs(jsonb,jsonb), private.fr_fact(jsonb,jsonb,jsonb,boolean), private.fr_json_bounds(jsonb), private.fr_valid_payload(jsonb),
 private.fr_request_digest(uuid,uuid,uuid,uuid,integer,jsonb), private.save_first_result_draft_impl(uuid,uuid,uuid,integer,jsonb)
from public,anon,authenticated,service_role;
revoke all on function public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.save_first_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb) to authenticated;
commit;
-- OFFLINE CANDIDATE ONLY. Data-preserving stop after typed records exist.
-- Deliberately retains columns, readable history and typed-review rejection.
revoke execute on function public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb) from authenticated;
revoke execute on function private.save_first_result_draft_impl(uuid,uuid,uuid,integer,jsonb) from authenticated;
-- OFFLINE candidate only. Depends on the deployed closed first-result package.
-- No client EXECUTE grants. Never modify or replay the historical closed package.
begin;
alter table public.growth_opportunities
 add column entry_kind text not null default 'legacy_opportunity',
 add column source_identity jsonb,
 alter column channel drop not null,
 alter column audience_need drop not null,
 alter column proposed_action drop not null,
 alter column rationale drop not null,
 drop constraint growth_opportunities_status_check,
 add constraint growth_opportunities_entry_shape check (coalesce(
  (entry_kind='legacy_opportunity' and source_identity is null
   and channel is not null and audience_need is not null and proposed_action is not null and rationale is not null
   and status in ('candidate','in_review','approved','rejected','published','measured'))
  or (entry_kind='url_result' and status='url_pending_review' and site_id is null
   and channel is null and audience_need is null and proposed_action is null and rationale is null
   and impact_score is null and effort_score is null and evidence_confidence='low'
   and source_identity is not null and jsonb_typeof(source_identity)='object'),false));

create function private.url_source_identity(p jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('original_url',p#>'{snapshot,original_url}','final_url',p#>'{snapshot,final_url}',
 'snapshot_id',p#>'{snapshot,id}','source_version',p#>'{snapshot,version}','source_digest',p#>'{snapshot,content_fingerprint}') $$;
revoke all on function private.url_source_identity(jsonb) from public,anon,authenticated,service_role;

create function private.guard_url_parent() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.entry_kind is distinct from old.entry_kind or new.organization_id is distinct from old.organization_id
  or new.id is distinct from old.id or new.source_identity is distinct from old.source_identity) then
  raise exception 'Parent identity is immutable' using errcode='23514'; end if;
 if new.entry_kind='url_result' then
  if not coalesce(private.fr_keys(new.source_identity,array['original_url','final_url','snapshot_id','source_version','source_digest'])
   and private.fr_url(new.source_identity->'original_url') and private.fr_url(new.source_identity->'final_url')
   and jsonb_typeof(new.source_identity->'snapshot_id')='string' and jsonb_typeof(new.source_identity->'source_version')='string' and jsonb_typeof(new.source_identity->'source_digest')='string'
   and new.source_identity->>'snapshot_id' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
   and new.source_identity->>'source_version' ~ '^[0-9a-f]{64}$'
   and new.source_identity->>'source_digest'='sha256:'||(new.source_identity->>'source_version'),false)
  then raise exception 'Invalid URL source identity' using errcode='23514'; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_url_parent() from public,anon,authenticated,service_role;
create trigger guard_url_parent before insert or update on public.growth_opportunities for each row execute function private.guard_url_parent();

create function private.guard_url_version() returns trigger language plpgsql set search_path='' as $$
declare parent public.growth_opportunities%rowtype;
begin
 if TG_OP='UPDATE' and (old.organization_id is distinct from new.organization_id or old.opportunity_id is distinct from new.opportunity_id) then
  raise exception 'Version parent is immutable' using errcode='23514'; end if;
 select * into parent from public.growth_opportunities where organization_id=new.organization_id and id=new.opportunity_id;
 if parent.entry_kind='url_result' and (new.first_result_payload is null or
  private.url_source_identity(new.first_result_payload) is distinct from parent.source_identity) then
  raise exception 'URL version source binding mismatch' using errcode='23514'; end if;
 -- Existing typed CHECK performs full evidence/hash validation, including direct writes.
 return new;
end $$;
revoke all on function private.guard_url_version() from public,anon,authenticated,service_role;
create trigger guard_url_version before insert or update on public.content_versions for each row execute function private.guard_url_version();

-- Add a fail-closed subtype guard to every existing entry point, keeping its body,
-- signatures and ACLs. Insert only AFTER the original owner/org authorization;
-- a SECURITY DEFINER subtype lookup must not expose other tenants to callers.
do $patch$
declare signature text; definition text; guard text; body_start integer; auth_end integer; auth_prefix text;
begin
 foreach signature in array array[
 'private.review_growth_opportunity_impl(uuid,uuid,text,text)',
 'private.create_content_draft_impl(uuid,uuid,text,text)',
 'private.save_first_result_draft_impl(uuid,uuid,uuid,integer,jsonb)',
 'private.review_content_draft_impl(uuid,uuid,text,text)',
 'private.plan_content_action_impl(uuid,uuid,text,text,text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if signature like '%review_content_draft%' or signature like '%plan_content_action%' then
   guard:='if exists(select 1 from public.content_versions v join public.growth_opportunities p on p.organization_id=v.organization_id and p.id=v.opportunity_id where v.organization_id=p_organization_id and v.id=p_version_id and p.entry_kind<>''legacy_opportunity'') then raise exception ''URL result requires dedicated review'' using errcode=''23514''; end if;';
  else
   guard:='if exists(select 1 from public.growth_opportunities where organization_id=p_organization_id and id=p_opportunity_id and entry_kind<>''legacy_opportunity'') then raise exception ''URL result cannot use legacy mutation'' using errcode=''23514''; end if;';
  end if;
  if position(E'begin\n' in definition)=0 then raise exception 'Unexpected function body: %',signature; end if;
  body_start:=position(E'begin\n' in definition)+length(E'begin\n');
  auth_end:=position('end if;' in substring(definition from body_start));
  if auth_end=0 then raise exception 'Missing authorization block: %',signature; end if;
  auth_prefix:=substring(definition from body_start for auth_end+length('end if;')-1);
  if auth_prefix !~ '^\s*if (v_actor|actor) is null or not private\.has_org_role\(p_organization_id,\s*array\[''owner''\](::text\[\])?\) then'
   or position('errcode=''42501''' in replace(auth_prefix,' ',''))=0 then
   raise exception 'Unexpected authorization block: %',signature;
  end if;
  auth_end:=body_start+length(auth_prefix);
  execute overlay(definition placing E'\n '||guard||E'\n' from auth_end for 0);
 end loop;
end $patch$;

create function private.save_url_result_draft_impl(p_organization_id uuid,p_opportunity_id uuid,p_request_id uuid,p_expected_version integer,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); old public.content_versions%rowtype; parent public.growth_opportunities%rowtype;
 latest integer; result_id uuid; fingerprint text; created_parent boolean:=false;
begin
 if actor is null or not private.has_org_role(p_organization_id,array['owner']) then raise exception 'Owner required' using errcode='42501'; end if;
 perform private.fr_require(p_opportunity_id is not null and p_request_id is not null and p_expected_version between 0 and 2147483646 and p_payload is not null,'INVALID_REQUEST');
 perform 1 from public.organizations where id=p_organization_id for no key update;
 perform 1 from public.organization_members where organization_id=p_organization_id and user_id=actor and role='owner' for share;
 if not found then raise exception 'Owner membership changed' using errcode='42501'; end if;
 fingerprint:=private.fr_request_digest(p_organization_id,p_opportunity_id,actor,p_request_id,p_expected_version,p_payload);
 select * into old from public.content_versions where organization_id=p_organization_id and first_result_request_id=p_request_id;
 if found then
  if old.created_by<>actor or old.opportunity_id<>p_opportunity_id or old.first_result_expected_version<>p_expected_version
   or old.first_result_payload is distinct from p_payload or old.first_result_request_digest<>fingerprint
   or not exists(select 1 from public.growth_opportunities where organization_id=p_organization_id and id=p_opportunity_id and entry_kind='url_result') then
   raise exception 'Request ID payload differs' using errcode='22023'; end if;
  return old.id;
 end if;
 perform private.fr_require(private.fr_valid_payload(p_payload),'INVALID_PAYLOAD');
 select * into parent from public.growth_opportunities where organization_id=p_organization_id and id=p_opportunity_id for update;
 if not found then
  if p_expected_version<>0 then raise exception 'URL parent missing' using errcode='PT409'; end if;
  -- Primary key also rejects a foreign-org UUID collision without reparenting.
  insert into public.growth_opportunities(id,organization_id,entry_kind,status,source_identity)
   values(p_opportunity_id,p_organization_id,'url_result','url_pending_review',private.url_source_identity(p_payload));
  created_parent:=true;
 else
  if parent.entry_kind<>'url_result' or parent.status<>'url_pending_review' or parent.source_identity is distinct from private.url_source_identity(p_payload) then
   raise exception 'URL parent/source mismatch' using errcode='23514'; end if;
  if p_expected_version=0 then raise exception 'URL parent already exists' using errcode='PT409'; end if;
 end if;
 select coalesce(max(version_number),0) into latest from public.content_versions where organization_id=p_organization_id and opportunity_id=p_opportunity_id;
 if latest<>p_expected_version then raise exception 'Content version changed; read back first' using errcode='PT409'; end if;
 insert into public.content_versions(organization_id,opportunity_id,version_number,title,draft_body,created_by,
 first_result_payload,first_result_request_id,first_result_expected_version,first_result_request_digest)
 values(p_organization_id,p_opportunity_id,latest+1,p_payload#>>'{preview,fields,title,suggested}',p_payload#>>'{preview,fields,description,suggested}',actor,
 p_payload,p_request_id,p_expected_version,fingerprint) returning id into result_id;
 insert into public.audit_events(organization_id,actor_user_id,event_type,object_type,object_id,details)
 values(p_organization_id,actor,'url_result_draft_saved','content_version',result_id,jsonb_build_object('request_id',p_request_id,'version_number',latest+1,
 'opportunity_id',p_opportunity_id,'created_parent',created_parent,'source_digest',p_payload#>>'{snapshot,content_fingerprint}',
 'content_digest',private.fr_content_digest(p_payload),'request_digest',fingerprint,'provenance','caller_supplied_unverified','approval','none'));
 return result_id;
end $$;
create function public.save_url_result_draft(p_organization_id uuid,p_opportunity_id uuid,p_request_id uuid,p_expected_version integer,p_payload jsonb)
returns uuid language sql security invoker set search_path='' as $$ select private.save_url_result_draft_impl($1,$2,$3,$4,$5) $$;
revoke all on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
commit;
-- OFFLINE CANDIDATE ONLY. No migration installation or runtime grant authorized.
-- Reuse the existing immutable-per-version review, member RLS and audit model.
alter table public.content_reviews
 add column url_review_request_id uuid,
 add column url_review_source_digest text,
 add column url_review_content_digest text,
 add column url_review_version_digest text,
 add column url_review_checks jsonb,
 add constraint content_reviews_url_request_unique unique(organization_id,url_review_request_id),
 add constraint content_reviews_url_shape check (
  (url_review_request_id is null and url_review_source_digest is null and url_review_content_digest is null and url_review_version_digest is null and url_review_checks is null)
  or coalesce(url_review_request_id is not null and decision='approved'
   and url_review_source_digest ~ '^sha256:[a-f0-9]{64}$' and url_review_content_digest ~ '^sha256:[a-f0-9]{64}$'
   and url_review_version_digest ~ '^pg-jsonb-sha256:[a-f0-9]{64}$'
   and url_review_checks='{"title":true,"meta_description":true,"description":true,"source":true,"blocking_facts_clear":true}'::jsonb,false));

create function private.review_url_result_impl(p_organization_id uuid,p_version_id uuid,p_request_id uuid,p_source_digest text,p_content_digest text,p_version_digest text,p_checks jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); v public.content_versions%rowtype; parent public.growth_opportunities%rowtype; prior public.content_reviews%rowtype; result_id uuid;
begin
 if actor is null or not private.has_org_role(p_organization_id,array['owner']) then raise exception 'Owner required' using errcode='42501'; end if;
 perform private.fr_require(p_version_id is not null and p_request_id is not null and p_checks='{"title":true,"meta_description":true,"description":true,"source":true,"blocking_facts_clear":true}'::jsonb,'EXACT_REVIEW_CHECKS_REQUIRED');
 -- Same lock order as URL Save; membership is rechecked after waiting.
 perform 1 from public.organizations where id=p_organization_id for no key update;
 perform 1 from public.organization_members where organization_id=p_organization_id and user_id=actor and role='owner' for share;
 if not found then raise exception 'Owner membership changed' using errcode='42501'; end if;
 select * into v from public.content_versions where organization_id=p_organization_id and id=p_version_id;
 if not found then raise exception 'Exact version missing' using errcode='P0002'; end if;
 select * into parent from public.growth_opportunities where organization_id=p_organization_id and id=v.opportunity_id for update;
 if not found or parent.entry_kind<>'url_result' or parent.status<>'url_pending_review' then raise exception 'URL parent required' using errcode='23514'; end if;
 -- Re-read under the parent lock; legacy mutation guards remain untouched.
 select * into v from public.content_versions where organization_id=p_organization_id and id=p_version_id for share;
 if not found or v.status<>'draft' or v.first_result_payload is null then raise exception 'Typed draft required' using errcode='23514'; end if;
 perform private.fr_require(private.fr_valid_payload(v.first_result_payload),'INVALID_PAYLOAD');
 if parent.source_identity is distinct from private.url_source_identity(v.first_result_payload)
  or p_source_digest is distinct from v.first_result_payload#>>'{snapshot,content_fingerprint}'
  or p_content_digest is distinct from private.fr_content_digest(v.first_result_payload)
  or p_version_digest is distinct from v.first_result_request_digest then raise exception 'Review binding mismatch' using errcode='22023'; end if;
 select * into prior from public.content_reviews where organization_id=p_organization_id and url_review_request_id=p_request_id;
 if found then
  if prior.actor_user_id is distinct from actor or prior.version_id is distinct from p_version_id or prior.url_review_source_digest is distinct from p_source_digest or prior.url_review_content_digest is distinct from p_content_digest or prior.url_review_version_digest is distinct from p_version_digest or prior.url_review_checks is distinct from p_checks then raise exception 'Review request differs' using errcode='22023'; end if;
  return prior.id; -- An exact replay returns history, never promotes a newer version.
 end if;
 if v.version_number<>(select max(version_number) from public.content_versions where organization_id=p_organization_id and opportunity_id=v.opportunity_id) then raise exception 'Only latest URL version can be confirmed' using errcode='PT409'; end if;
 if exists(select 1 from public.content_reviews where organization_id=p_organization_id and version_id=p_version_id) then raise exception 'Version already reviewed; read exact review' using errcode='PT409'; end if;
 insert into public.content_reviews(organization_id,version_id,actor_user_id,decision,reason,url_review_request_id,url_review_source_digest,url_review_content_digest,url_review_version_digest,url_review_checks)
 values(p_organization_id,p_version_id,actor,'approved','已核對原文、修改、來源及相關事實；未發布',p_request_id,p_source_digest,p_content_digest,p_version_digest,p_checks) returning id into result_id;
 insert into public.audit_events(organization_id,actor_user_id,event_type,object_type,object_id,details)
 values(p_organization_id,actor,'url_result_reviewed','content_version',p_version_id,jsonb_build_object('review_id',result_id,'request_id',p_request_id,'version_number',v.version_number,'source_digest',p_source_digest,'content_digest',p_content_digest,'version_digest',p_version_digest,'published',false));
 return result_id;
end $$;
create function public.review_url_result(p_organization_id uuid,p_version_id uuid,p_request_id uuid,p_source_digest text,p_content_digest text,p_version_digest text,p_checks jsonb)
returns uuid language sql security invoker set search_path='' as $$select private.review_url_result_impl($1,$2,$3,$4,$5,$6,$7)$$;
revoke all on function public.review_url_result(uuid,uuid,uuid,text,text,text,jsonb),private.review_url_result_impl(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
-- Existing table grants/RLS are unchanged. Test harness alone grants execution locally.

-- Real GoTrue users must already exist; no auth.users inserts or synthetic uid shim.
do $$ begin if (select count(*) from auth.users where id in ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000007'))<>3 then raise exception 'Real RC Auth users missing'; end if; end $$;
insert into public.organizations(id,name,business_model) values('10000000-0000-4000-8000-000000000001','Internal RC A','trade'),('10000000-0000-4000-8000-000000000002','Internal RC B','trade');
insert into public.organization_members(organization_id,user_id,role) values('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','owner'),('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','viewer'),('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000007','owner');
grant usage on schema public to authenticated;grant select on all tables in schema public to authenticated;
grant execute on function public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb),private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated;grant execute on function public.review_url_result(uuid,uuid,uuid,text,text,text,jsonb),private.review_url_result_impl(uuid,uuid,uuid,text,text,text,jsonb) to authenticated;
commit;
NOTIFY pgrst, 'reload schema';
