import base64
import hashlib
import json
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


SINGLE_CANDIDATE_LIST = b'''<html><head><title>Shop</title></head><body><main>
<h1>Our shop</h1><a href="/products/bolt-a">Bolt A</a>
</main></body></html>'''


def routed_fetcher(routes, robots_status=200, robots_body=b'User-agent: *\nAllow: /\n'):
    def fetch(url):
        if url.endswith('/robots.txt'):
            return robots_status, {'content-type': 'text/plain'}, robots_body
        for suffix, page in routes.items():
            if url.endswith(suffix):
                return 200, {'content-type': 'text/html'}, page
        return 404, {'content-type': 'text/html'}, b'not found'
    return fetch


class TrackingParamTests(unittest.TestCase):
    def test_tracking_params_removed_and_result_produced(self):
        report = build_snapshot(
            'https://example.com/products/bolt?utm_source=news&gclid=abc123&utm_medium=email',
            fetcher(PRODUCT))
        self.assertEqual(report['page_type'], 'product')
        self.assertEqual(report['snapshot']['original_url'], 'https://example.com/products/bolt')
        self.assertEqual(report['url_sanitization']['removed_tracking_parameters'],
                         ['gclid', 'utm_medium', 'utm_source'])
        # Values of tracking parameters are never recorded.
        self.assertNotIn('abc123', str(report['url_sanitization']))

    def test_business_param_is_preserved_and_still_rejected(self):
        with self.assertRaises(ScanError) as error:
            build_snapshot('https://example.com/products/bolt?color=red', fetcher(PRODUCT))
        self.assertEqual(error.exception.code, 'unsupported_query')

    def test_mixed_tracking_and_business_params_still_rejected(self):
        with self.assertRaises(ScanError) as error:
            build_snapshot('https://example.com/products/bolt?utm_source=x&variant=42', fetcher(PRODUCT))
        self.assertEqual(error.exception.code, 'unsupported_query')

    def test_fragment_only_url_unchanged(self):
        report = build_snapshot('https://example.com/products/bolt#details', fetcher(PRODUCT))
        self.assertEqual(report['page_type'], 'product')
        self.assertNotIn('url_sanitization', report)


class AutoSelectTests(unittest.TestCase):
    def test_single_candidate_is_followed_once_with_provenance(self):
        fetch = routed_fetcher({'/catalog': SINGLE_CANDIDATE_LIST, '/products/bolt-a': PRODUCT})
        report = build_snapshot('https://example.com/catalog', fetch)
        self.assertEqual(report['page_type'], 'product')
        self.assertEqual(report['facts']['product_name']['value'], 'Bolt A')
        self.assertEqual(report['auto_selected']['candidate_url'],
                         'https://example.com/products/bolt-a')
        self.assertEqual(report['auto_selected']['from_url'], 'https://example.com/catalog')

    def test_multiple_candidates_are_not_followed_and_get_summary(self):
        fetch = routed_fetcher({'/catalog': LIST_PAGE, '/products/bolt-a': PRODUCT,
                                '/products/drill-b': PRODUCT})
        report = build_snapshot('https://example.com/catalog', fetch)
        self.assertEqual(report['page_type'], 'not_supported_product')
        self.assertNotIn('auto_selected', report)
        summary = report['opportunity_summary']
        self.assertEqual(summary['candidate_count'], 2)
        self.assertEqual(summary['recommended_candidate']['url'],
                         'https://example.com/products/bolt-a')
        self.assertEqual(len(summary['alternative_candidates']), 1)

    def test_no_candidate_summary_has_no_fabricated_product(self):
        report = build_snapshot('https://example.com/ctbc/golf_list.aspx', fetcher(SERVICE_PAGE))
        summary = report['opportunity_summary']
        self.assertEqual(summary['page_kind'], 'service_or_list')
        self.assertEqual(summary['candidate_count'], 0)
        self.assertIsNone(summary['recommended_candidate'])


def _service_page():
    name, description = 'Workshop help', 'Plan workshop tasks with a checklist of supplied requirements.'
    data = json.dumps({'@context': 'https://schema.org', '@type': 'Service', 'name': name, 'description': description})
    return (f'<html><head><title>Workshop help | Example</title><meta name="description" content="Old introduction">'
            f'<script type="application/ld+json">{data}</script></head><body><main>'
            f'<article itemscope itemtype="https://schema.org/Service"><h1 itemprop="name">{name}</h1>'
            f'<p itemprop="description">{description}</p></article></main></body></html>').encode()


class ServiceIntegrationTests(unittest.TestCase):
    def test_service_page_accepted_at_single_entry(self):
        report = build_snapshot('https://example.com/tools/help', fetcher(_service_page()))
        self.assertEqual(report['page_type'], 'service')
        self.assertEqual(report['result_kind'], 'service')
        self.assertIsNotNone(report['preview'])
        self.assertEqual(report['facts']['entity_name']['value'], 'Workshop help')

    def test_neither_product_nor_service_keeps_guidance(self):
        report = build_snapshot('https://example.com/ctbc/golf_list.aspx', fetcher(SERVICE_PAGE))
        self.assertEqual(report['page_type'], 'not_supported_product')
        self.assertNotIn('result_kind', report)
        self.assertEqual(report['guidance']['page_kind'], 'service_or_list')

    def test_product_page_unaffected_by_service_attempt(self):
        report = build_snapshot('https://example.com/products/bolt', fetcher(PRODUCT))
        self.assertEqual(report['page_type'], 'product')
        self.assertNotIn('result_kind', report)


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


class SaveChainContractTests(unittest.TestCase):
    """Offline mirror of the Workspace save contract essentials.

    The deployed save RPC validates the payload again in the database
    (product-only page type, source hash binding, preview/snapshot binding,
    citation integrity). These tests pin the live extractor output to that
    contract so a builder drift cannot silently produce a First Result that
    looks successful but can never be saved or reviewed. Non-product
    results must stay explicitly preview-only instead of entering the chain.
    """

    def test_product_report_satisfies_save_binding(self):
        report = build_snapshot('https://shop.example/products/bolt-a', fetcher(PRODUCT))
        self.assertEqual(report['page_type'], 'product')
        self.assertIn(report['extraction']['method'],
                      ('explicit_product_microdata', 'woocommerce_single_product'))
        snapshot, preview = report['snapshot'], report['preview']
        raw = base64.b64decode(snapshot['content_base64'])
        self.assertEqual(snapshot['version'], hashlib.sha256(raw).hexdigest())
        self.assertEqual(snapshot['content_fingerprint'], 'sha256:' + snapshot['version'])
        self.assertEqual(preview['source_snapshot_id'], snapshot['id'])
        self.assertEqual(preview['source_version'], snapshot['version'])
        self.assertFalse(preview['published'])
        self.assertEqual(set(report['facts']),
                         {'product_name', 'title', 'meta_description', 'description', 'features', 'use'})
        self.assertEqual(set(preview['fields']), {'title', 'meta_description', 'description'})
        for field in preview['fields'].values():
            self.assertIsInstance(field['suggested'], str)
            self.assertTrue(field['suggested'])
        citations = snapshot['citations']
        self.assertTrue(citations)
        self.assertEqual(len({c['id'] for c in citations}), len(citations))
        for citation in citations:
            self.assertEqual(citation['snapshot_id'], snapshot['id'])
            self.assertEqual(citation['source_version'], snapshot['version'])
            self.assertEqual(citation['url'], snapshot['final_url'])
            self.assertTrue(citation['locator'] and citation['quote'])
            self.assertIn(citation['quote'], snapshot['html'])

    def test_service_report_is_preview_only_by_design(self):
        report = build_snapshot('https://example.com/tools/help', fetcher(_service_page()))
        self.assertEqual(report['page_type'], 'service')
        self.assertNotEqual(report['page_type'], 'product')
        pending = ' '.join(report['preview']['pending_confirmation'])
        self.assertIn('不支援確認、匯出保存或發布', pending)


if __name__ == '__main__':
    unittest.main()
