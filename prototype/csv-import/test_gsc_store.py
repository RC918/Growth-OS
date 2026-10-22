import sqlite3
import tempfile
import unittest
from pathlib import Path

from gsc_store import get_gsc_import, import_gsc_daily, initialize_gsc
from store import ImportErrorDetail

RAW = b"date,clicks,impressions\n2026-09-01,2,10\n2026-09-03,0,0\n"
PROVENANCE = dict(property_origin="https://example.com", search_type="web",
                  coverage_start="2026-09-01", coverage_end="2026-09-03",
                  exported_at="2026-09-04T00:00:00+00:00")


class GscStoreTests(unittest.TestCase):
    def setUp(self):
        self.path = Path(tempfile.mkdtemp()) / "gsc.sqlite3"
        initialize_gsc(self.path)
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT INTO organizations(id) VALUES ('org-a'), ('org-b')")
            db.execute("INSERT INTO sites(id, organization_id) VALUES ('site-a', 'org-a'), ('site-b', 'org-b')")

    def test_import_store_readback_roundtrip(self):
        batch = import_gsc_daily(self.path, "org-a", "site-a", "key-1", RAW, **PROVENANCE)
        self.assertFalse(batch["replayed"])
        back = get_gsc_import(self.path, "org-a", batch["id"])
        self.assertEqual([r["date"] for r in back["rows"]], ["2026-09-01", "2026-09-03"])
        self.assertEqual(back["missing_dates"], ["2026-09-02"])  # unknown, never zero-filled
        self.assertFalse(back["coverage_complete"])
        self.assertEqual((back["observed_clicks"], back["observed_impressions"]), (2, 10))
        self.assertEqual(back["rows"][1]["clicks"], 0)  # explicit observed zero preserved

    def test_idempotent_replay_and_conflict(self):
        first = import_gsc_daily(self.path, "org-a", "site-a", "key-1", RAW, **PROVENANCE)
        replay = import_gsc_daily(self.path, "org-a", "site-a", "key-1", RAW, **PROVENANCE)
        self.assertEqual(replay, {"id": first["id"], "row_count": 2, "replayed": True})
        with self.assertRaises(ImportErrorDetail) as caught:
            import_gsc_daily(self.path, "org-a", "site-a", "key-1",
                             b"date,clicks,impressions\n2026-09-01,1,5\n", **PROVENANCE)
        self.assertEqual(caught.exception.code, "idempotency_conflict")

    def test_cross_workspace_readback_is_hidden(self):
        batch = import_gsc_daily(self.path, "org-a", "site-a", "key-1", RAW, **PROVENANCE)
        self.assertIsNone(get_gsc_import(self.path, "org-b", batch["id"]))
        with self.assertRaises(ImportErrorDetail):
            import_gsc_daily(self.path, "org-b", "site-a", "key-2", RAW, **PROVENANCE)

    def test_invalid_rows_never_reach_storage(self):
        with self.assertRaises(ImportErrorDetail):
            import_gsc_daily(self.path, "org-a", "site-a", "key-1",
                             b"date,clicks,impressions\n2026-09-02,5,0\n", **PROVENANCE)
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM gsc_import_batches").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
