"""Existing /api file-based Preview function. No secrets or paid integrations."""
import sys
from pathlib import Path
from http.server import BaseHTTPRequestHandler
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'prototype' / 'public-audit'))
import product_api
from error_classify import classified_error
from product_api import handle_product, respond

_build_snapshot = product_api.build_snapshot

def _classified_snapshot(*args, **kwargs):
    try:
        return _build_snapshot(*args, **kwargs)
    except Exception as exc:
        if getattr(exc, "code", None) == "robots_unavailable":
            raise classified_error(exc) from exc
        raise

product_api.build_snapshot = _classified_snapshot

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        handle_product(self, '/tmp/growth-os-public-sources.sqlite3')
    def do_GET(self):
        respond(self,200,{'status':'ready','scope':'public_static_html','storage':'ephemeral','published':False})
    def log_message(self, *_args):
        pass
