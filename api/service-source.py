"""Existing /api file-based Preview function. No secrets or paid integrations."""
import sys
from pathlib import Path
from http.server import BaseHTTPRequestHandler
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'prototype' / 'public-audit'))
from service_api import handle_product, respond

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        handle_product(self, '/tmp/growth-os-public-sources.sqlite3')
    def do_GET(self):
        respond(self,200,{'status':'ready','scope':'public_static_html','storage':'ephemeral','published':False})
    def log_message(self, *_args):
        pass
