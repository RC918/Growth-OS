"""Static guardrails only; not a substitute for live PostgreSQL/RLS tests."""
import unittest
from pathlib import Path

ROOT = Path(__file__).parent / "migrations"
INITIAL = (ROOT / "202609280001_initial.sql").read_text()
RLS = (ROOT / "202609280002_tenant_rls.sql").read_text()
TABLES = ("organizations", "organization_members", "sites", "scans", "findings",
          "import_batches", "funnel_daily", "recommendations", "actions", "audit_events")


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
        for func in ("has_org_role(uuid, text[])", "create_organization(text, text)"):
            self.assertIn(f"revoke all on function public.{func} from public, anon;", RLS)
            self.assertIn(f"grant execute on function public.{func} to authenticated;", RLS)
        self.assertEqual(RLS.count("security definer"), 2)


if __name__ == "__main__":
    unittest.main()
