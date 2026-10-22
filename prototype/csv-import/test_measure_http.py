"""Actual HTTP acceptance for the Measure readback entry.

Starts the real api/measure-gsc.py handler on an ephemeral port and drives it
with HTTP requests: trusted-identity resolution, tenant isolation, missing
data, and gapped presentation. Requires loopback bind (CI); where the sandbox
forbids binding this is reported BLOCKED by the runner, never skipped silently.
"""
import base64
import importlib.util
import json
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('measure_gsc', ROOT / 'api' / 'measure-gsc.py')
measure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(measure)

CSV = base64.b64encode(b"date,clicks,impressions\n2026-09-01,2,10\n").decode()


class MeasureHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = Path(tempfile.mkdtemp())
        cls.db = cls.dir / 'measure.sqlite3'
        measure.DB_PATH = str(cls.db)
        from gsc_store import initialize_gsc

        initialize_gsc(cls.db)
        with sqlite3.connect(cls.db) as db:
            db.execute("INSERT INTO organizations(id) VALUES ('org-a'), ('org-b')")
            db.execute("INSERT INTO sites(id, organization_id) VALUES ('site-a', 'org-a'), ('site-b', 'org-b')")
        identities = cls.dir / 'identities.json'
        identities.write_text(json.dumps({'caller-a': 'org-a', 'caller-b': 'org-b'}), encoding='utf-8')
        import os

        os.environ['GROWTH_MEASURE_IDENTITIES_FILE'] = str(identities)
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), measure.handler)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def call(self, method, path, key=None, body=None):
        req = urllib.request.Request(f'http://127.0.0.1:{self.port}{path}', method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={'Content-Type': 'application/json',
                                              **({'X-Growth-Caller-Key': key} if key else {})})
        try:
            with urllib.request.urlopen(req, timeout=5) as res:
                return res.status, json.loads(res.read())
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read())

    def test_http_import_readback_and_tenant_isolation(self):
        status, created = self.call('POST', '/api/measure-gsc', 'caller-a', {
            'site_id': 'site-a', 'idempotency_key': 'http-1', 'csv_base64': CSV,
            'property_origin': 'https://example.com', 'search_type': 'web',
            'coverage_start': '2026-09-01', 'coverage_end': '2026-09-02',
            'exported_at': '2026-09-03T00:00:00+00:00'})
        self.assertEqual(status, 200)
        batch_id = created['id']

        status, view = self.call('GET', f'/api/measure-gsc/{batch_id}', 'caller-a')
        self.assertEqual(status, 200)
        self.assertEqual(view['missing_dates'], ['2026-09-02'])
        self.assertEqual(view['assessment']['label'], '先補齊資料')
        self.assertIn('尚未向 Google 核實', ' '.join(view['unknowns']))

        self.assertEqual(self.call('GET', f'/api/measure-gsc/{batch_id}', 'caller-b')[0], 404)  # cross-tenant hidden
        self.assertEqual(self.call('GET', f'/api/measure-gsc/{batch_id}')[0], 401)  # no trusted identity
        self.assertEqual(self.call('GET', '/api/measure-gsc/nope', 'caller-a')[0], 404)  # missing
        self.assertEqual(self.call('GET', f'/api/measure-gsc/{batch_id}?organization_id=org-b', 'caller-a')[0], 400)


if __name__ == '__main__':
    unittest.main()
