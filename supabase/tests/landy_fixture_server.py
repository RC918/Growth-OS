"""Test-only product-source server for the Landyachtz native E2E.

Serves POST /api/product-source by running the REAL first_result_api
pipeline (frozen extractor + service recognition + declared-product
rescue adapter) against the recorded Landyachtz HTML fixture. No
network access: the fixture fetcher answers robots.txt as allow-all
(the recorded page's robots permitted this path; the live check was
performed during the original investigation) and every other URL
with the recorded bytes.
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, "prototype/public-audit")
from first_result_api import build_snapshot  # noqa: E402

PAGE = open("prototype/public-audit/fixtures/landyachtz-the-clark.html", "rb").read()


def fetch(url):
    if url.endswith("/robots.txt"):
        return 200, {"content-type": "text/plain"}, b"User-agent: *\nAllow: /\n"
    return 200, {"content-type": "text/html"}, PAGE


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        try:
            data = json.loads(self.rfile.read(length) or b"{}")
            report = build_snapshot(data.get("url", ""), fetch)
            body, status = json.dumps(report).encode(), 200
        except Exception as exc:  # fail closed with the scanner-style code
            body = json.dumps({"code": getattr(exc, "code", "error"),
                               "message": str(exc)}).encode()
            status = 422
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 18765), Handler).serve_forever()
