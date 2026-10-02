"""Only localhost E2E harness: real HTTP/SQLite/parser with injected network responses."""
import sys
import signal
from pathlib import Path
from http.server import ThreadingHTTPServer
sys.path.insert(0,str(Path(__file__).resolve().parent))
import app,product_api
from product_source import build_snapshot
from scanner import ScanError
from test_product_source import PRODUCT, MIXED_PRODUCT, WOO_PRODUCT, fixture
from urllib.parse import urlsplit
def fetch(url):
    parts=urlsplit(url)
    if parts.hostname!='example.com':raise ScanError('private_target','Fixture boundary rejects all other hosts.')
    if parts.path=='/robots.txt':return fixture(url)
    if parts.path=='/capacity':raise ScanError('snapshot_capacity','Preview snapshot capacity reached; export does not free capacity.')
    if parts.path=='/timeout':raise ScanError('timeout','Synthetic transport timeout')
    if parts.path=='/oversized':raise ScanError('too_large','Synthetic oversized transport response')
    if parts.path=='/old':return 302,{'location':'/products/bolt'},b''
    if parts.path=='/catalog':return 200,{'content-type':'text/html'},b'<main><h1>Catalog</h1><a href="/products/bolt">Bolt A</a></main>'
    if parts.path=='/complexity':return 200,{'content-type':'text/html'},b'<div>'*150+b'x'+b'</div>'*150
    if parts.path=='/woo':return 200,{'content-type':'text/html'},WOO_PRODUCT
    if parts.path=='/mixed':return 200,{'content-type':'text/html'},MIXED_PRODUCT
    if parts.path=='/unscoped':return 200,{'content-type':'text/html'},PRODUCT.replace(b' itemscope itemtype="https://schema.org/Product"',b'')
    if parts.path=='/multiple':return 200,{'content-type':'text/html'},PRODUCT.replace(b'</main>',b'<h1>Drill B</h1></main>')
    if parts.path=='/unknown':return 200,{'content-type':'text/html'},b'<h1>Unsupported page</h1>'
    return fixture(url)
product_api.build_snapshot=lambda url:build_snapshot(url,fetch)
app.DB_PATH=Path(sys.argv[1])
class Handler(app.Handler):
    def log_message(self,*_args):pass
signal.signal(signal.SIGUSR1, lambda *_args: product_api.RECENT.clear())
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
print(server.server_address[1],flush=True)
server.serve_forever()
