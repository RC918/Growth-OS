import unittest

from scanner import ScanError, audit, normalize_url, resolve_public


def fixture_fetch(url):
    if url.endswith('/robots.txt'):
        return 200, {'content-type': 'text/plain'}, b'User-agent: *\nAllow: /\n'
    if url == 'https://example.com/shop':
        return 200, {'content-type': 'text/html'}, (
            b'<html><head><title>Sample shop</title></head><body><h1>Products</h1>'
            b'<form><input type="password"></form><button>Sign up</button></body></html>')
    raise AssertionError(url)


class ScannerTests(unittest.TestCase):
    def test_public_html_evidence_and_limitations(self):
        report = audit('https://example.com/shop?token=secret', fixture_fetch)
        self.assertEqual(report['requested_url'], 'https://example.com/shop')
        self.assertEqual(report['page']['title'], 'Sample shop')
        self.assertIn('password_field_present', {f['rule_code'] for f in report['findings']})
        self.assertIn('cta_not_found', {f['rule_code'] for f in report['findings']})
        self.assertTrue(all('conversion rate' in f['limitations'] for f in report['findings']))

    def test_disallowed_robots_stops_before_page(self):
        calls = []
        def denied(url):
            calls.append(url)
            return 200, {}, b'User-agent: *\nDisallow: /\n'
        with self.assertRaises(ScanError) as error:
            audit('https://example.com/shop', denied)
        self.assertEqual(error.exception.code, 'robots_disallowed')
        self.assertEqual(calls, ['https://example.com/robots.txt'])

    def test_rejects_non_https_and_private_dns(self):
        for url in ('http://example.com', 'https://localhost/', 'https://example.com:8443/',
                    'https://user:pass@example.com/'):
            with self.subTest(url=url), self.assertRaises(ScanError): normalize_url(url)
        import unittest.mock
        with unittest.mock.patch('socket.getaddrinfo', return_value=[(2,1,6,'',('127.0.0.1',443))]):
            with self.assertRaises(ScanError) as error: resolve_public('rebind.example')
            self.assertEqual(error.exception.code, 'private_target')

    def test_cross_domain_redirect_rejected(self):
        def redirect(_url): return 302, {'location': 'https://other.example/'}, b''
        from scanner import fetch_following_redirects
        with self.assertRaises(ScanError) as error:
            fetch_following_redirects('https://example.com/shop', redirect)
        self.assertEqual(error.exception.code, 'cross_domain_redirect')

    def test_robots_blocks_redirect_destination_before_request(self):
        calls = []
        def redirected(url):
            calls.append(url)
            if url.endswith('/robots.txt'):
                return 200, {}, b'User-agent: *\nDisallow: /private\n'
            if url.endswith('/shop'):
                return 302, {'location': '/private'}, b''
            raise AssertionError('Disallowed destination was fetched')
        with self.assertRaises(ScanError) as error:
            audit('https://example.com/shop', redirected)
        self.assertEqual(error.exception.code, 'robots_disallowed')
        self.assertEqual(calls, ['https://example.com/robots.txt', 'https://example.com/shop'])


if __name__ == '__main__': unittest.main()
