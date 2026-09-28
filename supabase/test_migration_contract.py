"""Static guardrails only; not a substitute for live PostgreSQL/RLS tests."""
import unittest
from pathlib import Path

ROOT = Path(__file__).parent / "migrations"
INITIAL = (ROOT / "202609280001_initial.sql").read_text()
RLS = (ROOT / "202609280002_tenant_rls.sql").read_text()
GROWTH = (ROOT / "20260928160322_growth_opportunities_v1.sql").read_text()
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


if __name__ == "__main__":
    unittest.main()
