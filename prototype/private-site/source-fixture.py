"""Test-only HTTP adapter to unchanged product_api; only owned WordPress bytes."""
import sys, json, socket, urllib.request
from pathlib import Path
from urllib.parse import urlsplit
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'public-audit'))
import product_api
from product_source import build_snapshot
config = json.loads(sys.stdin.readline())
assert config['mode'] == 'growth-os-isolated-regression'
assert config['url'] == 'https://rc-source.example/growth-os/'
bridge = urlsplit(config['bridge'])
assert bridge.scheme == 'http' and bridge.hostname == '127.0.0.1'
real_connect = socket.create_connection

def connect(address, *args, **kwargs):
    if address != ('127.0.0.1', bridge.port):
        raise AssertionError('Unapproved fixture destination')
    return real_connect(address, *args, **kwargs)

def fetch(url):
    u = urlsplit(url)
    assert u.scheme == 'https' and u.netloc == 'rc-source.example'
    assert u.path in ['/robots.txt', '/growth-os/'] and not u.query
    with urllib.request.urlopen(config['bridge'] + u.path, timeout=5) as r:
        return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read(1_000_001)

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/api/product-source':
            self.send_error(404)
            return
        product_api.handle_product(self, config['database'])
    def log_message(self, *args):
        pass

with patch.object(socket, 'create_connection', connect), patch.object(product_api, 'build_snapshot', lambda url: build_snapshot(url, fetch)):
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    print(json.dumps({'port': server.server_port}), flush=True)
    server.serve_forever()
