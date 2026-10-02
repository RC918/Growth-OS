import base64
import hashlib
import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch
import app
import product_api
from product_source import build_snapshot
from test_product_source import fixture, PRODUCT

class ApiTests(unittest.TestCase):
    def test_real_http_and_snapshot_storage_readback(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'sources.sqlite3'
            with patch.object(app,'DB_PATH',path),patch.object(product_api,'build_snapshot',side_effect=lambda u:build_snapshot(u,fixture)):
                product_api.RECENT.clear()
                server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
                thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
                try:
                    base='http://127.0.0.1:'+str(server.server_address[1])
                    with urlopen(base+'/first-result.html') as response:self.assertIn(b'source-form',response.read())
                    def post(url,origin=None):
                        h={'Content-Type':'application/json'}
                        if origin:h['Origin']=origin
                        return urlopen(Request(base+'/api/product-source',data=json.dumps({'url':url}).encode(),headers=h))
                    reports=[]
                    for _ in range(2):
                        with post('https://example.com/products/bolt') as response:
                            self.assertEqual(response.status,200);reports.append(json.load(response))
                    self.assertNotEqual(reports[0]['snapshot']['id'],reports[1]['snapshot']['id'])
                    self.assertEqual(reports[0]['snapshot']['version'],reports[1]['snapshot']['version'])
                    with sqlite3.connect(path) as db:
                        rows=db.execute('SELECT payload FROM public_source_snapshots').fetchall()
                    self.assertEqual(len(rows),2)
                    stored=json.loads(rows[0][0]);self.assertNotIn('storage',stored)
                    self.assertEqual(base64.b64decode(stored['snapshot']['content_base64']),PRODUCT)
                    self.assertEqual(hashlib.sha256(PRODUCT).hexdigest(),stored['snapshot']['version'])
                    self.assertEqual(stored['preview'],reports[0]['preview'])
                    self.assertFalse(reports[0]['storage']['cross_login_persistence'])
                    for u in ['http://example.com','garbage','https://@example.com']:
                        with self.assertRaises(HTTPError) as e:post(u)
                        self.assertEqual(e.exception.code,400)
                    with self.assertRaises(HTTPError) as e:post('https://example.com/products/a','https://attacker.example')
                    self.assertEqual(e.exception.code,403)
                    with sqlite3.connect(path) as db:self.assertEqual(db.execute('SELECT count(*) FROM public_source_snapshots').fetchone()[0],2)
                finally:
                    server.shutdown();server.server_close();thread.join()
    def test_preview_rate_limit_is_bounded(self):
        product_api.RECENT.clear()
        class Handler:
            headers={'Content-Type':'application/json','Host':'localhost'}
            client_address=('127.0.0.1',1)
            import io
            rfile=io.BytesIO(b'')
        handler=Handler();payload=json.dumps({'url':'https://example.com/products/bolt'}).encode()
        handler.headers['Content-Length']=str(len(payload))
        with patch.object(product_api,'respond') as response,patch.object(product_api,'build_snapshot',return_value={}),patch.object(product_api,'save_report',return_value={}):
            for _ in range(10):
                handler.rfile=handler.io.BytesIO(payload)
                product_api.handle_product(handler,'unused')
            handler.rfile=handler.io.BytesIO(payload);product_api.handle_product(handler,'unused')
            self.assertEqual(response.call_args.args[1],429)
            self.assertEqual(response.call_args.args[2]['code'],'rate_limit')
        product_api.RECENT.clear()
