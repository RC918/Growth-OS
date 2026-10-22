import unittest

from error_classify import cause_category, classified_detail
from scanner import ScanError, fetch_public_html


def chained():
    try:
        try:
            raise ScanError("dns_failed", "DNS resolution failed for the public host.")
        except ScanError as exc:
            raise ScanError("robots_unavailable", "Robots rules could not be checked; scan stopped.") from exc
    except ScanError as exc:
        return exc


class ErrorClassifyTests(unittest.TestCase):
    def test_robots_cause_is_classified_from_chain(self):
        exc = chained()
        self.assertEqual(cause_category(exc), "dns")
        self.assertIn("Cause category: dns.", classified_detail(exc))

    def test_real_scanner_chain_reaches_helper(self):
        def fake(url):
            raise ScanError("timeout", "The public request exceeded its deadline.")

        with self.assertRaises(ScanError) as caught:
            fetch_public_html("https://example.com/products/x", fake)
        self.assertEqual(caught.exception.code, "robots_unavailable")
        self.assertEqual(cause_category(caught.exception), "timeout")

    def test_non_robots_and_unknown_causes_unchanged(self):
        plain = ScanError("not_html", "Public HTML page not found.")
        self.assertEqual(classified_detail(plain), "Public HTML page not found.")
        unknown = ScanError("robots_unavailable", "Robots rules are not available for a safe scan.")
        self.assertEqual(classified_detail(unknown), "Robots rules are not available for a safe scan.")

    def test_categories_are_bounded_and_leak_free(self):
        detail = classified_detail(chained())
        self.assertNotIn("example.com", detail)
        self.assertNotIn("http", detail)


if __name__ == "__main__":
    unittest.main()

class ServiceApiClassificationTests(unittest.TestCase):
    def test_service_snapshot_surfaces_bounded_cause(self):
        import service_api

        def fake(url):
            raise ScanError("dns_failed", "DNS resolution failed for the public host.")

        with self.assertRaises(ScanError) as caught:
            service_api.build_snapshot("https://example.com/products/x", fake)
        self.assertEqual(caught.exception.code, "robots_unavailable")
        self.assertIn("Cause category: dns.", str(caught.exception))
