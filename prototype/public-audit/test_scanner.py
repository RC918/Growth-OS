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



class RobotsDiagnosticsTests(unittest.TestCase):
    def test_transport_categories_do_not_leak_and_never_fetch_page(self):
        import socket
        import ssl
        import http.client
        from unittest.mock import patch, MagicMock
        from scanner import fetch_public_html, fetch_once
        secret = 'SECRET header token https://private.example/sensitive'
        cases = [(socket.timeout(secret), 'timeout'),
                 (ssl.SSLError(secret), 'tls_failed'),
                 (ConnectionError(secret), 'connection_failed'),
                 (http.client.BadStatusLine(secret), 'http_protocol')]
        for failure, reason in cases:
            conn = MagicMock(); conn.request.side_effect = failure
            calls = []
            def fetch(url):
                calls.append(url)
                return fetch_once(url)
            with self.subTest(reason=reason), patch('scanner.resolve_public', return_value=['93.184.216.34']), patch('scanner.PinnedHTTPSConnection', return_value=conn):
                with self.assertRaises(ScanError) as caught:
                    fetch_public_html('https://example.com/product', fetch)
                error = caught.exception
                self.assertEqual(error.code, 'robots_unavailable')
                self.assertEqual(error.diagnostic, {'stage':'robots','reason':reason,'http_status':None})
                self.assertNotIn(secret, str(error) + str(error.diagnostic))
                self.assertEqual(calls, ['https://example.com/robots.txt'])
                conn.close.assert_called_once()

    def test_dns_failure_is_not_access_denial(self):
        import socket
        from unittest.mock import patch
        from scanner import fetch_public_html, fetch_once
        with patch('socket.getaddrinfo', side_effect=socket.gaierror('SECRET')), patch('scanner.PinnedHTTPSConnection') as connection:
            with self.assertRaises(ScanError) as caught:
                fetch_public_html('https://example.com/product', fetch_once)
            self.assertEqual(caught.exception.diagnostic['reason'], 'dns_failed')
            connection.assert_not_called()

    def test_http_denial_unreadable_unknown_and_safety_remain_distinct(self):
        from scanner import fetch_public_html
        for status in (401, 403, 404, 429, 500):
            calls=[]
            def fetch(url):
                calls.append(url)
                return status, {'secret':'SECRET'}, b'SECRET'
            with self.subTest(status=status), self.assertRaises(ScanError) as caught:
                fetch_public_html('https://example.com/product', fetch)
            self.assertEqual(caught.exception.diagnostic, {'stage':'robots','reason':'http_denied' if status in (401,403) else 'http_status','http_status':status})
            self.assertEqual(len(calls), 1)
        for code in ('fetch_failed', 'unrecognized_SECRET', 'peer_mismatch', 'private_target'):
            def fetch(url): raise ScanError(code, 'SECRET')
            with self.subTest(code=code), self.assertRaises(ScanError) as caught:
                fetch_public_html('https://example.com/product', fetch)
            if code == 'private_target':
                self.assertEqual(caught.exception.code, code)
            else:
                self.assertEqual(caught.exception.diagnostic['reason'], 'peer_mismatch' if code=='peer_mismatch' else 'unknown')
                self.assertNotIn('SECRET', str(caught.exception)+str(caught.exception.diagnostic))

    def test_observed_status_survives_body_timeout(self):
        import socket
        from unittest.mock import MagicMock, patch
        from scanner import fetch_once, fetch_public_html
        conn=MagicMock(); response=conn.getresponse.return_value
        response.status=403; response.length=None; response.getheaders.return_value=[]
        response.read1.side_effect=socket.timeout('SECRET')
        with patch('scanner.resolve_public',return_value=['93.184.216.34']), patch('scanner.PinnedHTTPSConnection',return_value=conn):
            with self.assertRaises(ScanError) as caught:
                fetch_public_html('https://example.com/product',fetch_once)
        self.assertEqual(caught.exception.diagnostic,{'stage':'robots','reason':'timeout','http_status':403})

if __name__ == '__main__': unittest.main()
