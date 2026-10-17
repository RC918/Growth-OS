import unittest

from first_result_api import build_snapshot
from scanner import ScanError

PRODUCT = b'''<html><head><title>Workshop - Bolt A | Shop</title><meta name="description" content="Old generic catalog">
<script type="application/ld+json">{"@type":"Product","name":"Bolt A","description":"Public steel bolt"}</script>
</head><body><main itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">Bolt A</h1><p itemprop="description">Public steel bolt for workshop assembly.</p>
<ul><li itemprop="additionalProperty">Hexagonal head</li></ul></main></body></html>'''

LIST_PAGE = b'''<html><head><title>Catalog</title></head><body><main>
<a href="/products/bolt-a">Bolt A</a><a href="/products/drill-b">Drill B</a>
</main></body></html>'''

SERVICE_PAGE = b'''<html><head><title>Golf privileges</title></head><body><main>
<h2>Golf privileges</h2><p>Course list and prices.</p><a href="#tc_price">Prices</a>
</main></body></html>'''

HOME_PAGE = b'''<html><head><title>Example Co</title></head><body><main>
<h2>Welcome</h2><p>Company intro.</p>
</main></body></html>'''


def fetcher(page, robots_status=200, robots_body=b'User-agent: *\nAllow: /\n'):
    def fetch(url):
        if url.endswith('/robots.txt'):
            return robots_status, {'content-type': 'text/plain'}, robots_body
        return 200, {'content-type': 'text/html'}, page
    return fetch


class RobotsPolicyTests(unittest.TestCase):
    def test_missing_robots_txt_still_produces_first_result(self):
        # Case A shape: robots.txt returns 404 (no robots file, RFC 9309).
        report = build_snapshot('https://example.com/products/bolt', fetcher(PRODUCT, 404))
        self.assertEqual(report['page_type'], 'product')
        self.assertEqual(report['facts']['product_name']['value'], 'Bolt A')
        self.assertIsNotNone(report['preview'])

    def test_gone_robots_txt_also_treated_as_no_restrictions(self):
        report = build_snapshot('https://example.com/products/bolt', fetcher(PRODUCT, 410))
        self.assertEqual(report['page_type'], 'product')

    def test_server_error_robots_stays_fail_closed(self):
        with self.assertRaises(ScanError) as error:
            build_snapshot('https://example.com/products/bolt', fetcher(PRODUCT, 503))
        self.assertEqual(error.exception.code, 'robots_unavailable')

    def test_forbidden_robots_stays_fail_closed(self):
        with self.assertRaises(ScanError) as error:
            build_snapshot('https://example.com/products/bolt', fetcher(PRODUCT, 403))
        self.assertEqual(error.exception.code, 'robots_unavailable')

    def test_existing_robots_disallow_is_still_enforced(self):
        with self.assertRaises(ScanError) as error:
            build_snapshot('https://example.com/products/bolt',
                           fetcher(PRODUCT, 200, b'User-agent: *\nDisallow: /\n'))
        self.assertEqual(error.exception.code, 'robots_disallowed')

    def test_existing_robots_allow_unchanged(self):
        report = build_snapshot('https://example.com/products/bolt', fetcher(PRODUCT, 200))
        self.assertEqual(report['page_type'], 'product')


class GuidanceTests(unittest.TestCase):
    def test_listing_page_offers_candidate_guidance(self):
        report = build_snapshot('https://example.com/catalog', fetcher(LIST_PAGE))
        self.assertEqual(report['page_type'], 'not_supported_product')
        self.assertEqual(report['guidance']['page_kind'], 'listing_with_candidates')
        self.assertTrue(any(item.get('url') for item in report['inferences']))
        self.assertTrue(report['guidance']['next_steps'])

    def test_service_page_without_h1_gets_service_guidance(self):
        # Case B shape: service/list page, anchors only, no single product.
        report = build_snapshot('https://example.com/ctbc/golf_list.aspx', fetcher(SERVICE_PAGE))
        self.assertEqual(report['page_type'], 'not_supported_product')
        self.assertEqual(report['guidance']['page_kind'], 'service_or_list')
        self.assertIn('詳細頁', report['guidance']['next_steps'][0])

    def test_homepage_gets_homepage_guidance(self):
        report = build_snapshot('https://example.com/', fetcher(HOME_PAGE))
        self.assertEqual(report['guidance']['page_kind'], 'homepage')

    def test_supported_product_has_no_guidance(self):
        report = build_snapshot('https://example.com/products/bolt', fetcher(PRODUCT))
        self.assertNotIn('guidance', report)


if __name__ == '__main__':
    unittest.main()
