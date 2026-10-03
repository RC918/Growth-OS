"""Sprint 1 local web application. Public scans only; no analytics claims."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from scanner import ScanError, audit, normalize_url
from product_api import handle_product

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("COMMERCE_GROWTH_DB", str(ROOT / "scans.sqlite3")))
POOL = ThreadPoolExecutor(max_workers=2)
RATE_LOCK = threading.Lock()
REQUEST_TIMES: dict[str, list[float]] = {}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    return db


def initialize():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute("""create table if not exists scans (
          id text primary key, requested_url text not null,
          business_model text not null, status text not null,
          created_at text not null, completed_at text,
          report_json text, error_code text, error_detail text)""")


def process(scan_id: str, url: str):
    with connect() as db:
        db.execute("update scans set status='running' where id=?", (scan_id,))
    try:
        result = audit(url)
    except ScanError as exc:
        with connect() as db:
            db.execute("update scans set status='failed',error_code=?,error_detail=?,completed_at=? where id=?",
                       (exc.code, str(exc), now(), scan_id))
    except Exception:
        with connect() as db:
            db.execute("update scans set status='failed',error_code='internal_error',error_detail=?,completed_at=? where id=?",
                       ("The scan failed unexpectedly.", now(), scan_id))
    else:
        with connect() as db:
            db.execute("update scans set status='completed',report_json=?,completed_at=? where id=?",
                       (json.dumps(result, ensure_ascii=False), now(), scan_id))


def allow(ip: str) -> bool:
    current = time.monotonic()
    with RATE_LOCK:
        recent = [t for t in REQUEST_TIMES.get(ip, []) if current - t < 3600]
        if len(recent) >= 10:
            REQUEST_TIMES[ip] = recent
            return False
        recent.append(current)
        REQUEST_TIMES[ip] = recent
        return True


class Handler(BaseHTTPRequestHandler):
    def json_response(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path in ("/first-result.html", "/first-result.mjs", "/first-result-review.mjs", "/first-result.css"):
            static = Path(__file__).resolve().parents[2] / "apps" / "web" / path.lstrip("/")
            body = static.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript" if path.endswith(".mjs") else "text/css" if path.endswith(".css") else "text/html; charset=utf-8")
            self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers();self.wfile.write(body);return
        if path == "/":
            body = (ROOT / "index.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'none'; connect-src 'self'")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path.startswith("/api/v1/scans/"):
            scan_id = path.rsplit("/", 1)[-1]
            try: uuid.UUID(scan_id)
            except ValueError:
                self.json_response(404, {"code": "not_found", "detail": "Scan not found."})
                return
            with connect() as db:
                row = db.execute("select * from scans where id=?", (scan_id,)).fetchone()
            if row is None:
                self.json_response(404, {"code": "not_found", "detail": "Scan not found."})
                return
            result = {"id": row["id"], "status": row["status"], "requested_url": row["requested_url"],
                      "business_model": row["business_model"], "created_at": row["created_at"],
                      "completed_at": row["completed_at"],
                      "report": json.loads(row["report_json"]) if row["report_json"] else None}
            if row["error_code"]:
                result["error"] = {"code": row["error_code"], "detail": row["error_detail"]}
            self.json_response(200, result)
            return
        self.json_response(404, {"code": "not_found", "detail": "Path not found."})

    def do_POST(self):
        if urlsplit(self.path).path == "/api/product-source":
            handle_product(self, DB_PATH);return
        if urlsplit(self.path).path != "/api/v1/scans":
            self.json_response(404, {"code": "not_found", "detail": "Path not found."})
            return
        try: length = int(self.headers.get("Content-Length", "0"))
        except ValueError: length = 0
        if length < 2 or length > 4096:
            self.json_response(400, {"code": "invalid_request", "detail": "Request must be under 4 KB."})
            return
        try:
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict): raise ValueError()
            url = normalize_url(data.get("url"))
            model = data.get("business_model")
            if model not in ("ecommerce", "trade"): raise ValueError()
        except (ValueError, TypeError, ScanError):
            self.json_response(400, {"code": "invalid_request", "detail": "Provide a public HTTPS URL and business model."})
            return
        if not allow(self.client_address[0]):
            self.json_response(429, {"code": "rate_limit", "detail": "Try again later."})
            return
        scan_id = str(uuid.uuid4())
        with connect() as db:
            db.execute("insert into scans(id,requested_url,business_model,status,created_at) values (?,?,?,?,?)",
                       (scan_id, url, model, "queued", now()))
        POOL.submit(process, scan_id, url)
        self.json_response(202, {"id": scan_id, "status": "queued"})


def main():
    initialize()
    host = os.getenv("COMMERCE_GROWTH_HOST", "127.0.0.1")
    port = int(os.getenv("COMMERCE_GROWTH_PORT", "8080"))
    print(f"Commerce Growth Sprint 1 at http://{host}:{port}", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__": main()
