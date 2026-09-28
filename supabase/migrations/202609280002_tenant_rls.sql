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
