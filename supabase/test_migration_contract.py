"""Static guardrails only; not a substitute for live PostgreSQL/RLS tests."""
import unittest
from pathlib import Path

ROOT = Path(__file__).parent / "migrations"
INITIAL = (ROOT / "202609280001_initial.sql").read_text()
RLS = (ROOT / "202609280002_tenant_rls.sql").read_text()
GROWTH = (ROOT / "20260928160322_growth_opportunities_v1.sql").read_text()
REVIEW = (ROOT / "20260928161802_review_growth_opportunity.sql").read_text()
CREATE = (ROOT / "20260928162623_create_growth_opportunity.sql").read_text()
PROFILE = (ROOT / "20260929015843_business_profile_review.sql").read_text()
GATE = (ROOT / "20260929020743_profile_gate_private_rpcs.sql").read_text()
TABLES = ("organizations", "organization_members", "sites", "scans", "findings",
          "import_batches", "funnel_daily", "recommendations", "actions", "audit_events")
GROWTH_TABLES = ("business_profiles", "growth_opportunities", "opportunity_sources", "opportunity_decisions")


class MigrationContractTests(unittest.TestCase):
    def test_every_tenant_table_has_rls_and_schema(self):
        for table in TABLES:
            with self.subTest(table=table):
                self.assertIn(f"create table {table} (", INITIAL)
                self.assertIn(f"alter table public.{table} enable row level security;", RLS)

    def test_client_policies_are_read_only(self):
        policies = [part.split(";", 1)[0] for part in RLS.split("create policy ")[1:]]
        self.assertEqual(len(policies), len(TABLES))
        self.assertTrue(all("for select to authenticated" in policy for policy in policies))
        self.assertNotIn("to anon\n  using", RLS)

    def test_role_helper_is_definer_with_restricted_execute(self):
        func = "has_org_role(uuid, text[])"
        self.assertIn("create schema if not exists private;", RLS)
        self.assertIn(f"revoke all on function private.{func} from public, anon;", RLS)
        self.assertIn(f"grant execute on function private.{func} to authenticated;", RLS)
        self.assertNotIn("function public.has_org_role", RLS)
        self.assertEqual(RLS.count("security definer"), 1)

    def test_growth_tables_are_read_only_to_authenticated_members(self):
        for table in GROWTH_TABLES:
            with self.subTest(table=table):
                self.assertIn(f"create table public.{table} (", GROWTH)
                self.assertIn(f"alter table public.{table} enable row level security;", GROWTH)
                self.assertIn(f"create policy {table}_read_members", GROWTH)
        self.assertEqual(GROWTH.count("for select to authenticated"), len(GROWTH_TABLES))
        self.assertIn("revoke all on public.business_profiles", GROWTH)
        self.assertIn("grant select on public.business_profiles", GROWTH)
        self.assertNotIn("for insert to authenticated", GROWTH)
        self.assertNotIn("for update to authenticated", GROWTH)
        self.assertNotIn("for delete to authenticated", GROWTH)

    def test_review_rpc_has_owner_gate_and_atomic_audit(self):
        self.assertIn("security definer", REVIEW)
        self.assertIn("set search_path = ''", REVIEW)
        self.assertIn("private.has_org_role(p_organization_id, array['owner']::text[])", REVIEW)
        self.assertIn("for update;", REVIEW)
        self.assertIn("from public.opportunity_sources", REVIEW)
        self.assertIn("insert into public.opportunity_decisions", REVIEW)
        self.assertIn("insert into public.audit_events", REVIEW)
        self.assertIn("revoke all on function public.review_growth_opportunity(uuid, uuid, text, text) from public, anon;", REVIEW)
        self.assertIn("grant execute on function public.review_growth_opportunity(uuid, uuid, text, text) to authenticated;", REVIEW)

    def test_create_rpc_is_owner_only_and_labels_self_reported_source(self):
        self.assertIn("security definer", CREATE)
        self.assertIn("set search_path = ''", CREATE)
        self.assertIn("private.has_org_role(p_organization_id, array['owner']::text[])", CREATE)
        self.assertIn("p_source_kind not in ('owner_question','research_note')", CREATE)
        self.assertIn("verified_at is not null", CREATE)
        self.assertIn("'candidate', 'low'", CREATE)
        self.assertIn("insert into public.opportunity_sources", CREATE)
        self.assertIn("insert into public.audit_events", CREATE)
        self.assertIn("from public, anon;", CREATE)
        self.assertIn("to authenticated;", CREATE)

    def test_profile_rpc_privilege_boundary(self):
        self.assertIn("function private.save_business_profile_impl", PROFILE)
        self.assertIn("function private.approve_business_profile_impl", PROFILE)
        self.assertIn("private.has_org_role(p_organization_id, array['owner']::text[])", PROFILE)
        self.assertEqual(PROFILE.count("language plpgsql security definer"), 2)
        self.assertEqual(PROFILE.count("language sql security invoker"), 2)
        self.assertIn("is distinct from", PROFILE)
        self.assertIn("review_status = 'draft', reviewed_by = null, reviewed_at = null", PROFILE)
        self.assertIn("grant execute on function public.save_business_profile", PROFILE)
        self.assertIn("grant execute on function public.approve_business_profile", PROFILE)

    def test_candidate_requires_approved_profile_and_private_mutation(self):
        self.assertIn("review_status = 'owner_approved'", GATE)
        self.assertIn("Approved business profile required", GATE)
        self.assertIn("function private.create_growth_opportunity_impl", GATE)
        self.assertIn("function private.review_growth_opportunity_impl", GATE)
        self.assertEqual(GATE.count("language plpgsql security definer"), 2)
        self.assertEqual(GATE.count("language sql security invoker"), 2)
        self.assertIn("for update;", GATE)
        self.assertIn("grant execute on function public.create_growth_opportunity", GATE)
        self.assertIn("grant execute on function public.review_growth_opportunity", GATE)


if __name__ == "__main__":
    unittest.main()
