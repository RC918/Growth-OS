"""Only localhost E2E harness: real HTTP/SQLite/parser with injected network responses."""
import sys
import signal
from pathlib import Path
from http.server import ThreadingHTTPServer
sys.path.insert(0,str(Path(__file__).resolve().parent))
import app,product_api
import service_api
from service_source import build_snapshot as build_service_snapshot
from product_source import build_snapshot
from scanner import ScanError
from test_product_source import PRODUCT, MIXED_PRODUCT, WOO_PRODUCT, WOO_MICRO_NO_SHORT, WOO_MICRO_NAME_CONFLICT, fixture
from urllib.parse import urlsplit
from test_service_source import service_html, subpage_html
def fetch(url):
    parts=urlsplit(url)
    if parts.hostname!='example.com':raise ScanError('private_target','Fixture boundary rejects all other hosts.')
    if parts.path=='/robots.txt':return fixture(url)
    if parts.path=='/capacity':raise ScanError('snapshot_capacity','Preview snapshot capacity reached; export does not free capacity.')
    if parts.path=='/timeout':raise ScanError('timeout','Synthetic transport timeout')
    if parts.path=='/oversized':raise ScanError('too_large','Synthetic oversized transport response')
    if parts.path=='/old':return 302,{'location':'/products/bolt'},b''
    if parts.path=='/catalog':return 200,{'content-type':'text/html'},b'<main><h1>Catalog</h1><a href="/products/bolt">Bolt A</a></main>'
    if parts.path=='/service':return 200,{'content-type':'text/html'},service_html()
    if parts.path=='/software':return 200,{'content-type':'text/html'},service_html('SoftwareApplication')
    if parts.path in ('/subpage','/subpage-conflict'):
        body=subpage_html(url)
        if parts.path=='/subpage-conflict':body=body.replace(b'</header>',b'<p>Another competing introductory paragraph.</p></header>')
        return 200,{'content-type':'text/html'},body
    if parts.path=='/service-conflict':return 200,{'content-type':'text/html'},service_html().replace(b'<h1 itemprop="name">Workshop help',b'<h1 itemprop="name">Other')
    if parts.path=='/complexity':return 200,{'content-type':'text/html'},b'<div>'*150+b'x'+b'</div>'*150
    if parts.path=='/woo-micro':return 200,{'content-type':'text/html'},WOO_MICRO_NO_SHORT
    if parts.path=='/woo-conflict':return 200,{'content-type':'text/html'},WOO_MICRO_NAME_CONFLICT
    if parts.path=='/woo-named':return 200,{'content-type':'text/html'},WOO_PRODUCT.replace(b'Steel bolt for workshop assembly.',b'Bolt A is a steel fastener for workshop assembly.')
    if parts.path=='/woo':return 200,{'content-type':'text/html'},WOO_PRODUCT
    if parts.path=='/mixed':return 200,{'content-type':'text/html'},MIXED_PRODUCT
    if parts.path=='/unscoped':return 200,{'content-type':'text/html'},PRODUCT.replace(b' itemscope itemtype="https://schema.org/Product"',b'')
    if parts.path=='/multiple':return 200,{'content-type':'text/html'},PRODUCT.replace(b'</main>',b'<h1>Drill B</h1></main>')
    if parts.path=='/unknown':return 200,{'content-type':'text/html'},b'<h1>Unsupported page</h1>'
    return fixture(url)
product_api.build_snapshot=lambda url:build_snapshot(url,fetch)
service_api.api.build_snapshot=lambda url:build_service_snapshot(url,fetch)
app.DB_PATH=Path(sys.argv[1])
class Handler(app.Handler):
    def log_message(self,*_args):pass
    def do_GET(self):
        if self.path in ('/service-result.html','/service-result.mjs','/intro-candidate.mjs','/intro-candidate-panel.mjs','/intro-r7-review.mjs','/intro-r7.json'):
            path=Path(__file__).resolve().parents[2]/'apps/web'/self.path.lstrip('/')
            body=path.read_bytes();self.send_response(200)
            self.send_header('Content-Type','text/javascript' if self.path.endswith('.mjs') else 'application/json' if self.path.endswith('.json') else 'text/html; charset=utf-8')
            self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
        super().do_GET()
    def do_POST(self):
        if self.path=='/api/service-source':return service_api.handle_product(self,app.DB_PATH)
        super().do_POST()
def reset_limits(*_args):
    product_api.RECENT.clear();service_api.api.RECENT.clear()
signal.signal(signal.SIGUSR1, reset_limits)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
print(server.server_address[1],flush=True)
server.serve_forever()
