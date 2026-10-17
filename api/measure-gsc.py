"""Existing /api file-based Measure readback function. No secrets or paid integrations.

Organization identity is resolved server-side from a trusted caller key
configured outside the repo (GROWTH_MEASURE_IDENTITIES_FILE: JSON mapping of
caller key -> organization_id). Client-supplied organization_id is rejected,
never trusted. Storage stays on the local/ephemeral SQLite prototype; this is
not the tenant production database.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlsplit, parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'prototype' / 'csv-import'))
from gsc_present import present_gsc
from gsc_store import get_gsc_import, import_gsc_daily
from store import ImportErrorDetail

DB_PATH = os.environ.get('GROWTH_MEASURE_DB', '/tmp/growth-os-measure.sqlite3')


def resolve_organization(headers) -> str | None:
    """Trusted identity: caller key -> organization from server-side config only."""
    key = headers.get('X-Growth-Caller-Key')
    config = os.environ.get('GROWTH_MEASURE_IDENTITIES_FILE')
    if not key or not config:
        return None
    try:
        mapping = json.loads(Path(config).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None
    organization = mapping.get(key)
    return organization if isinstance(organization, str) and organization else None


def respond(handler, status, value):
    data = json.dumps(value, ensure_ascii=False).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Cache-Control', 'no-store')
    handler.send_header('X-Content-Type-Options', 'nosniff')
    handler.send_header('Content-Length', str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


class handler(BaseHTTPRequestHandler):
    def _organization(self):
        organization = resolve_organization(self.headers)
        if organization is None:
            respond(self, 401, {'code': 'unauthorized', 'detail': 'A trusted caller identity is required.'})
        return organization

    def do_GET(self):
        organization = self._organization()
        if organization is None:
            return
        parts = urlsplit(self.path)
        query = parse_qs(parts.query)
        if 'organization_id' in query or 'organizationId' in query:
            return respond(self, 400, {'code': 'identity_from_client_rejected',
                                       'detail': 'Organization is resolved from trusted identity, not the request.'})
        segments = [s for s in parts.path.split('/') if s]
        batch_id = segments[-1] if segments else ''
        readback = get_gsc_import(DB_PATH, organization, batch_id) if batch_id else None
        if readback is None:  # missing and cross-tenant are indistinguishable by design
            return respond(self, 404, {'code': 'not_found', 'detail': 'No stored import is available in this workspace.'})
        return respond(self, 200, present_gsc(readback))

    def do_POST(self):
        organization = self._organization()
        if organization is None:
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 2 <= length <= 1_100_000:
                raise ImportErrorDetail('invalid_request', 'Send one normalized GSC CSV import.')
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict) or 'organization_id' in data or 'organizationId' in data:
                raise ImportErrorDetail('identity_from_client_rejected', 'Organization comes from trusted identity.')
            required = {'site_id', 'idempotency_key', 'csv_base64', 'property_origin',
                        'search_type', 'coverage_start', 'coverage_end', 'exported_at'}
            if set(data) != required:
                raise ImportErrorDetail('invalid_request', 'Provide the normalized GSC import fields.')
            import base64

            raw = base64.b64decode(data.pop('csv_base64'), validate=True)
            result = import_gsc_daily(DB_PATH, organization, data.pop('site_id'),
                                      data.pop('idempotency_key'), raw, **data)
            return respond(self, 200, result)
        except ImportErrorDetail as exc:
            return respond(self, 422, {'code': exc.code, 'detail': str(exc)})
        except Exception:
            return respond(self, 400, {'code': 'invalid_request', 'detail': 'Provide one normalized GSC CSV import.'})

    def log_message(self, *_args):
        pass
