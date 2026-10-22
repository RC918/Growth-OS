import unittest
from pathlib import Path

from adapter_registry import RegistryError, _validate_contract, run_adapter
from robots_policy import build_snapshot as build_raw_snapshot

FIXTURE = Path(__file__).parent / "fixtures" / "landyachtz-the-clark.html"
URL = "https://landyachtz.com/shop/all/skate/boards/all-skate-boards/the-clark/"


def fetch_for(html_bytes):
    def fetch(url):
        if url.endswith("/robots.txt"):
            return 200, {"content-type": "text/plain"}, b"User-agent: *\nAllow: /\n"
        return 200, {"content-type": "text/html"}, html_bytes
    return fetch


class AdapterRegistryTests(unittest.TestCase):
    def test_registered_adapter_rescues_landyachtz_fixture(self):
        raw = build_raw_snapshot(URL, fetch_for(FIXTURE.read_bytes()))
        self.assertEqual(raw["page_type"], "not_supported_product")
        report = run_adapter("declared-product-dom-v1", raw)
        self.assertIsNotNone(report)
        self.assertEqual(report["page_type"], "product")
        self.assertEqual(report["extraction"]["method"], "declared_product_dom")
        self.assertEqual(
            report["snapshot"]["content_fingerprint"],
            "sha256:" + report["snapshot"]["version"],
        )

    def test_fingerprint_mismatch_is_rejected(self):
        raw = build_raw_snapshot(URL, fetch_for(FIXTURE.read_bytes()))
        report = run_adapter("declared-product-dom-v1", raw)
        report["snapshot"]["content_fingerprint"] = "sha256:" + "0" * 64
        with self.assertRaises(RegistryError):
            _validate_contract(
                "declared-product-dom-v1", "declared_product_dom", report)

    def test_unregistered_adapter_is_rejected(self):
        with self.assertRaises(RegistryError):
            run_adapter("unknown-adapter", {"page_type": "not_supported_product"})

    def test_adapter_stays_fail_closed_without_product_evidence(self):
        report = {
            "page_type": "not_supported_product",
            "snapshot": {"html": "<html><body><h1>Hi</h1></body></html>",
                         "citations": [], "id": "s", "version": 1,
                         "final_url": "https://example.com/"},
        }
        self.assertIsNone(run_adapter("declared-product-dom-v1", report))


if __name__ == "__main__":
    unittest.main()
