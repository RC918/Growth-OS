"""Shared bounded public-source HTTP endpoint; local/ephemeral SQLite, never tenant DB."""
import json
import sqlite3
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit
from product_source import build_snapshot
from scanner import ScanError

SLOTS = threading.BoundedSemaphore(2)
RATE_LOCK = threading.Lock()
RECENT = {}
MAX_REPORTS = 100

def respond(handler, status, value):
    data = json.dumps(value, ensure_ascii=False).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Cache-Control', 'no-store')
    handler.send_header('X-Content-Type-Options', 'nosniff')
    handler.send_header('Content-Length', str(len(data)))
    handler.end_headers(); handler.wfile.write(data)

def save_report(path, report):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(report, ensure_ascii=False)
    with sqlite3.connect(path, timeout=3) as db:
        db.execute('CREATE TABLE IF NOT EXISTS public_source_snapshots (id TEXT PRIMARY KEY, fetched_at TEXT NOT NULL, payload TEXT NOT NULL)')
        db.execute('BEGIN IMMEDIATE')
        if db.execute('SELECT count(*) FROM public_source_snapshots').fetchone()[0] >= MAX_REPORTS:
            raise ScanError('snapshot_capacity', 'Preview snapshot capacity reached; export existing results.')
        db.execute('INSERT INTO public_source_snapshots VALUES (?,?,?)',
                   (report['snapshot']['id'], report['snapshot']['fetched_at'], payload))
        stored = json.loads(db.execute('SELECT payload FROM public_source_snapshots WHERE id=?',(report['snapshot']['id'],)).fetchone()[0])
        if stored != report: raise ScanError('snapshot_readback', 'Snapshot readback did not match.')
    return stored

def handle_product(handler, path):
    # No request/header/URL body logging; no cookies, credentials or authorization forwarding.
    if handler.headers.get('Content-Type','').split(';')[0].strip() != 'application/json':
        return respond(handler,415,{'code':'invalid_request','detail':'Send JSON containing a public product URL.'})
    origin = handler.headers.get('Origin')
    if origin and urlsplit(origin).netloc != handler.headers.get('Host'):
        return respond(handler,403,{'code':'origin_denied','detail':'Use the same-origin product entry.'})
    try:
        length=int(handler.headers.get('Content-Length','0'))
        if not 2 <= length <= 4096: raise ValueError()
        data=json.loads(handler.rfile.read(length))
        if not isinstance(data,dict) or set(data) != {'url'}: raise ValueError()
        from product_source import product_url
        product_url(data['url'])
    except (ValueError,TypeError,KeyError,ScanError) as e:
        return respond(handler,400,{'code':e.code if isinstance(e,ScanError) else 'invalid_request',
                                   'detail':str(e) if isinstance(e,ScanError) else 'Provide one public HTTPS product URL.'})
    ip=handler.client_address[0];now=time.monotonic()
    with RATE_LOCK:
        # Bounded per-process preview throttle; not a distributed production limiter.
        for key in list(RECENT):
            if not RECENT[key] or now-RECENT[key][-1]>3600: del RECENT[key]
        times=[t for t in RECENT.get(ip,[]) if now-t<3600]
        if len(times)>=10 or (ip not in RECENT and len(RECENT)>=1000):
            return respond(handler,429,{'code':'rate_limit','detail':'Wait before trying again.'})
        RECENT[ip]=times+[now]
    if not SLOTS.acquire(blocking=False):
        return respond(handler,429,{'code':'busy','detail':'Two scans are running; try again shortly.'})
    try:
        report=build_snapshot(data['url'])
        stored=save_report(path,report)
        stored['storage']={'kind':'local_or_ephemeral_sqlite','cross_login_persistence':False,
                           'message':'Export to retain this source; hosted cache may disappear.'}
        respond(handler,200,stored)
    except ScanError as e:
        respond(handler,422,{'code':e.code,'detail':str(e)})
    except Exception:
        respond(handler,500,{'code':'processing_failed','detail':'The source could not be processed; retry or choose another public page.'})
    finally:
        SLOTS.release()
