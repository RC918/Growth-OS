"""Measure integration acceptance over the real program path.

CSV bytes -> preview validation -> tenant store -> scoped readback ->
presentation, plus a two-period comparison over stored readbacks. This is
an actual pipeline exercise, not a composition of isolated unit asserts.
"""
import sqlite3
import tempfile
import unittest
from pathlib import Path

from gsc_daily import compare_complete_periods
from gsc_present import present_gsc
from gsc_store import get_gsc_import, import_gsc_daily, initialize_gsc

BEFORE = b"date,clicks,impressions\n2026-09-01,2,10\n2026-09-02,1,10\n"
AFTER = b"date,clicks,impressions\n2026-09-03,4,20\n2026-09-04,2,10\n"
PROVENANCE = dict(property_origin="https://example.com", search_type="web",
                  exported_at="2026-09-05T00:00:00+00:00")


class MeasureIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.path = Path(tempfile.mkdtemp()) / "measure.sqlite3"
        initialize_gsc(self.path)
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT INTO organizations(id) VALUES ('org-a'), ('org-b')")
            db.execute("INSERT INTO sites(id, organization_id) VALUES ('site-a', 'org-a'), ('site-b', 'org-b')")

    def test_csv_to_presentation_end_to_end(self):
        before = import_gsc_daily(self.path, "org-a", "site-a", "before-1", BEFORE,
                                  coverage_start="2026-09-01", coverage_end="2026-09-02", **PROVENANCE)
        after = import_gsc_daily(self.path, "org-a", "site-a", "after-1", AFTER,
                                 coverage_start="2026-09-03", coverage_end="2026-09-04", **PROVENANCE)
        # Tenant isolation is part of the path, not an afterthought.
        self.assertIsNone(get_gsc_import(self.path, "org-b", before["id"]))

        before_back = get_gsc_import(self.path, "org-a", before["id"])
        after_back = get_gsc_import(self.path, "org-a", after["id"])
        view = present_gsc(before_back)
        self.assertEqual(view["observed"], {"clicks": 3, "impressions": 20, "ctr": "0.15"})
        self.assertTrue(view["coverage_complete"])
        self.assertEqual(view["assessment"]["label"], "可觀察完整期間，不能歸因")
        self.assertIn("尚未向 Google 核實", " ".join(view["unknowns"]))

        comparison = compare_complete_periods(before_back, after_back)
        self.assertEqual(comparison["click_difference"], 3)
        self.assertIn("not causal", comparison["interpretation"])

    def test_missing_day_flows_to_presentation_as_unknown(self):
        gapped = import_gsc_daily(self.path, "org-a", "site-a", "gap-1",
                                  b"date,clicks,impressions\n2026-09-01,2,10\n",
                                  coverage_start="2026-09-01", coverage_end="2026-09-02", **PROVENANCE)
        view = present_gsc(get_gsc_import(self.path, "org-a", gapped["id"]))
        self.assertEqual(view["missing_dates"], ["2026-09-02"])
        self.assertEqual(view["observed"]["clicks"], 2)  # missing never counted as zero-day in totals label
        self.assertEqual(view["assessment"]["label"], "先補齊資料")


if __name__ == "__main__":
    unittest.main()
