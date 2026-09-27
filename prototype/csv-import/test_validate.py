import unittest
from validate import ImportErrorDetail, preview

MAPPING = {"report_date": "date", "source": "channel", "medium": "medium",
           "landing_path": "path", "landing_sessions": "sessions"}


class ImportPreviewTests(unittest.TestCase):
    def test_missing_metric_is_unknown_not_zero(self):
        raw = b'date,channel,medium,path,sessions\n2026-09-01,facebook,paid_social,/shop,\n'
        result = preview(raw, "ga4", MAPPING)
        self.assertIsNone(result["rows"][0]["landing_sessions"])
        self.assertEqual(result["row_count"], 1)

    def test_duplicate_segment_and_wrong_source_fail(self):
        raw = b'date,channel,medium,path,sessions\n2026-09-01,facebook,paid_social,/shop,3\n2026-09-01,facebook,paid_social,/shop,4\n'
        with self.assertRaises(ImportErrorDetail) as error:
            preview(raw, "ga4", MAPPING)
        self.assertEqual(error.exception.code, "duplicate_segment")
        with self.assertRaises(ImportErrorDetail) as error:
            preview(raw, "ad_platform", MAPPING)
        self.assertEqual(error.exception.code, "mapping")

    def test_money_requires_currency_and_does_not_accept_nan(self):
        mapping = {"report_date": "date", "source": "channel", "medium": "medium",
                   "landing_path": "path", "gross_revenue": "revenue", "currency": "currency"}
        for revenue, currency in (("12.50", ""), ("NaN", "TWD"), ("-2", "TWD")):
            with self.subTest(revenue=revenue, currency=currency), self.assertRaises(ImportErrorDetail):
                preview(f'date,channel,medium,path,revenue,currency\n2026-09-01,store,organic,/shop,{revenue},{currency}\n'.encode(), "store", mapping)

    def test_header_and_row_shape_are_explicit_errors(self):
        with self.assertRaises(ImportErrorDetail) as error:
            preview(b'date,date,medium,path,sessions\n2026-09-01,facebook,paid,/shop,2\n', "ga4", MAPPING)
        self.assertEqual(error.exception.code, "header")
        with self.assertRaises(ImportErrorDetail) as error:
            preview(b'date,channel,medium,path,sessions\n2026-09-01,facebook,paid,/shop,2,extra\n', "ga4", MAPPING)
        self.assertEqual(error.exception.code, "row_shape")


if __name__ == "__main__":
    unittest.main()
