import tempfile
import unittest
from pathlib import Path

from store import connect, get_batch, get_segments, import_batch, initialize
from validate import ImportErrorDetail

MAPPING = {"report_date": "date", "source": "channel", "medium": "medium",
           "landing_path": "path", "landing_sessions": "sessions"}
RAW = b'date,channel,medium,path,sessions\n2026-09-01,facebook,paid_social,/shop,7\n'


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "imports.sqlite3"
        initialize(self.path)
        with connect(self.path) as db:
            db.executemany("INSERT INTO organizations(id) VALUES (?)", [("org-a",), ("org-b",)])
            db.executemany("INSERT INTO sites(id, organization_id) VALUES (?, ?)",
                           [("site-a", "org-a"), ("site-b", "org-b")])

    def test_replay_is_stable_and_conflicting_key_does_not_change_data(self):
        args = (self.path, "org-a", "site-a", "batch-key", RAW, "ga4", MAPPING)
        first = import_batch(*args)
        again = import_batch(*args)
        self.assertEqual(first["id"], again["id"])
        self.assertTrue(again["replayed"])
        with self.assertRaises(ImportErrorDetail) as error:
            import_batch(self.path, "org-a", "site-a", "batch-key", RAW.replace(b',7\n', b',8\n'), "ga4", MAPPING)
        self.assertEqual(error.exception.code, "idempotency_conflict")
        self.assertEqual(get_segments(self.path, "org-a", first["id"])[0]["landing_sessions"], 7)

    def test_cross_workspace_site_and_batch_are_inaccessible(self):
        with self.assertRaises(ImportErrorDetail) as error:
            import_batch(self.path, "org-a", "site-b", "key", RAW, "ga4", MAPPING)
        self.assertEqual(error.exception.code, "site_not_found")
        first = import_batch(self.path, "org-a", "site-a", "key", RAW, "ga4", MAPPING)
        self.assertIsNone(get_batch(self.path, "org-b", first["id"]))
        self.assertEqual(get_segments(self.path, "org-b", first["id"]), [])
        second = import_batch(self.path, "org-b", "site-b", "key", RAW, "ga4", MAPPING)
        self.assertNotEqual(first["id"], second["id"])

    def test_invalid_file_leaves_no_partial_batch(self):
        invalid = RAW + b'2026-09-01,facebook,paid_social,/shop,9\n'
        with self.assertRaises(ImportErrorDetail):
            import_batch(self.path, "org-a", "site-a", "bad", invalid, "ga4", MAPPING)
        with connect(self.path) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM import_batches").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM segments").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
