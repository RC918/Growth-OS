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
