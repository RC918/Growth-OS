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
