import sqlite3
import tempfile
import unittest
from pathlib import Path

from gsc_store import get_gsc_import, import_gsc_daily, initialize_gsc
from gsc_workspace import to_workspace_snapshot
from pilot_preflight import assess_pilot_readiness
from store import ImportErrorDetail

RAW = b"date,clicks,impressions\n2026-09-01,2,10\n2026-09-02,0,0\n"
PROVENANCE = dict(property_origin="https://example.com", search_type="web",
                  coverage_start="2026-09-01", coverage_end="2026-09-02",
                  exported_at="2026-09-03T00:00:00+00:00")


class WorkspaceContractTests(unittest.TestCase):
    def setUp(self):
        self.path = Path(tempfile.mkdtemp()) / "ws.sqlite3"
        initialize_gsc(self.path)
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT INTO organizations(id) VALUES ('org-a')")
            db.execute("INSERT INTO sites(id, organization_id) VALUES ('site-a', 'org-a')")
        batch = import_gsc_daily(self.path, "org-a", "site-a", "k1", RAW, **PROVENANCE)
        self.readback = get_gsc_import(self.path, "org-a", batch["id"])

    def test_readback_maps_to_snapshot_v2_shape(self):
        snap = to_workspace_snapshot(self.readback, sample=True)
        self.assertEqual(set(snap), {"format", "version", "a", "b", "actions"})
        self.assertEqual((snap["format"], snap["version"]), ("growth-os-search-baseline", 2))
        self.assertEqual(set(snap["a"]), {"meta", "rows", "sample"})
        self.assertEqual(set(snap["a"]["meta"]), {"origin", "type", "start", "end", "exported"})
        self.assertEqual(snap["a"]["meta"]["origin"], "https://example.com")
        self.assertTrue(all(set(r) == {"date", "clicks", "impressions"} for r in snap["a"]["rows"]))
        self.assertIs(snap["b"], None)
        self.assertEqual(snap["actions"], [])

    def test_sample_must_be_declared_explicitly(self):
        with self.assertRaises(ImportErrorDetail):
            to_workspace_snapshot(self.readback, sample="yes")

    def test_tampered_readback_is_refused(self):
        forged = dict(self.readback, rows=[{"date": "2026-09-09", "clicks": 1, "impressions": 1}])
        with self.assertRaises(ImportErrorDetail):
            to_workspace_snapshot(forged, sample=False)


class PilotPreflightTests(unittest.TestCase):
    def test_complete_synthetic_export_is_workspace_save_ready_only(self):
        result = assess_pilot_readiness(RAW, sample=True, **PROVENANCE)
        self.assertEqual(result["state"], "ready")
        self.assertTrue(result["workspace_save_ready"])
        self.assertFalse(result["real_pilot_ready"])
        self.assertEqual(result["data_kind"], "synthetic_declared")
        self.assertEqual(result["authority"], {"snapshot": "workspace_persistent",
                                               "local_store": "cache_only_not_authoritative",
                                               "local_caches_are_authoritative": False})
        self.assertEqual((result["workspace_snapshot"]["format"], result["workspace_snapshot"]["version"]),
                         ("growth-os-search-baseline", 2))
        self.assertTrue(result["workspace_snapshot"]["a"]["sample"])
        self.assertFalse(result["google_verified"])
        self.assertFalse(result["traffic_verified"])
        self.assertFalse(result["causal_claim"])
        self.assertEqual(result["indexing_status"], "unknown")
        self.assertEqual(result["pending_external_authorization"],
                         ["real_gsc_account_authorization", "real_site_write_permission"])
        self.assertIn("尚未向 Google 核實", " ".join(result["unknowns"]))

    def test_missing_dates_block_baseline_without_zero_filling(self):
        result = assess_pilot_readiness(RAW, sample=True, **dict(PROVENANCE, coverage_end="2026-09-03"))
        self.assertEqual(result["state"], "not_ready")
        self.assertFalse(result["workspace_save_ready"])
        self.assertIsNone(result["workspace_snapshot"])
        self.assertEqual(result["blockers"][0]["code"], "missing_dates")
        self.assertEqual(result["blockers"][0]["dates"], ["2026-09-03"])
        self.assertIn("缺少日期：2026-09-03", " ".join(result["unknowns"]))

    def test_sample_declaration_is_required(self):
        with self.assertRaises(ImportErrorDetail):
            assess_pilot_readiness(RAW, sample="yes", **PROVENANCE)

    def test_provider_asserted_data_stays_unverified(self):
        result = assess_pilot_readiness(RAW, sample=False, **PROVENANCE)
        self.assertEqual(result["data_kind"], "provider_asserted_unverified")
        self.assertFalse(result["workspace_snapshot"]["a"]["sample"])
        self.assertFalse(result["google_verified"])
        self.assertFalse(result["real_pilot_ready"])

    def test_non_https_property_is_refused(self):
        with self.assertRaises(ImportErrorDetail):
            assess_pilot_readiness(RAW, sample=True, **dict(PROVENANCE, property_origin="http://example.com"))


if __name__ == "__main__":
    unittest.main()
