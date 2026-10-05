"""Contract tests for an offline, normalized Search Console baseline preview."""
import hashlib
import unittest

from gsc_daily import compare_complete_periods, preview_gsc_daily
from validate import ImportErrorDetail


BASE = dict(property_origin="https://shop.example", search_type="web",
            coverage_start="2026-09-01", coverage_end="2026-09-03",
            exported_at="2026-09-05T09:00:00+08:00")


def preview(data: str, **overrides):
    return preview_gsc_daily(data.encode(), **(BASE | overrides))


class GscDailyTests(unittest.TestCase):
    def assert_code(self, code, data, **overrides):
        with self.assertRaises(ImportErrorDetail) as caught:
            preview(data, **overrides)
        self.assertEqual(caught.exception.code, code)

    def test_missing_day_is_unknown_but_explicit_zero_is_observed(self):
        raw = b"date,clicks,impressions\n2026-09-03,0,0\n2026-09-01,2,10\n"
        result = preview_gsc_daily(raw, **BASE)
        self.assertEqual(result["missing_dates"], ["2026-09-02"])
        self.assertFalse(result["coverage_complete"])
        self.assertEqual(result["observed_clicks"], 2)
        self.assertEqual(result["observed_impressions"], 10)
        self.assertEqual(result["observed_ctr"], "0.2")
        self.assertEqual(result["content_sha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(result["exported_at"], "2026-09-05T01:00:00+00:00")

    def test_rejects_ambiguous_or_invalid_rows(self):
        header = "date,clicks,impressions\n"
        self.assert_code("header", "date,clicks,impressions,query\n2026-09-01,2,10,foo\n")
        self.assert_code("duplicate_day", header + "2026-09-01,2,10\n2026-09-01,3,20\n")
        self.assert_code("count", header + "2026-09-01,,10\n")
        self.assert_code("count", header + "2026-09-01,-1,10\n")
        self.assert_code("row_shape", header + "2026-09-01,1\n")
        self.assert_code("date_range", header + "2026-08-31,1,10\n")

    def test_rejects_unverified_property_shapes_and_undated_exports(self):
        data = "date,clicks,impressions\n2026-09-01,1,10\n"
        self.assert_code("property", data, property_origin="https://shop.example/private")
        self.assert_code("property", data, property_origin="https://user@shop.example")
        self.assert_code("exported_at", data, exported_at="2026-09-05T09:00:00")
        self.assert_code("search_type", data, search_type="all")

    def test_comparison_only_for_complete_equal_compatible_intervals(self):
        data = "date,clicks,impressions\n2026-09-01,2,10\n2026-09-02,0,0\n2026-09-03,1,10\n"
        before = preview(data)
        after = preview("date,clicks,impressions\n2026-09-04,3,20\n2026-09-05,0,0\n2026-09-06,2,10\n",
                        coverage_start="2026-09-04", coverage_end="2026-09-06")
        result = compare_complete_periods(before, after)
        self.assertEqual((result["click_difference"], result["impression_difference"]), (2, 10))
        with self.assertRaisesRegex(ImportErrorDetail, "same property"):
            compare_complete_periods(before, after | {"property_origin": "https://other.example"})
        with self.assertRaisesRegex(ImportErrorDetail, "same number"):
            compare_complete_periods(before, after | {"coverage_end": "2026-09-07"})
        with self.assertRaisesRegex(ImportErrorDetail, "Missing days"):
            compare_complete_periods(preview("date,clicks,impressions\n2026-09-01,1,10\n"), after)


if __name__ == "__main__":
    unittest.main()
