"""Local storage proof for validated GSC daily imports.

Closes the Measure loop for the normalized GSC template: preview validates,
this module stores the observed rows tenant-scoped and idempotently, and
readback recomputes totals from the stored rows instead of trusting any
caller-supplied aggregates. Missing dates stay unknown, never zero-filled.
Only a trusted caller may supply organization_id/site_id after authorization;
there is no HTTP endpoint, Google connection, or real traffic data here.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from decimal import Decimal
from pathlib import Path

from gsc_daily import preview_gsc_daily
from store import ImportErrorDetail, connect, initialize


def initialize_gsc(path: str | Path) -> None:
    initialize(path)  # organizations/sites/import tables from the generic store
    with connect(path) as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS gsc_import_batches (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                site_id TEXT NOT NULL,
                idempotency_key TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                property_origin TEXT NOT NULL,
                search_type TEXT NOT NULL,
                coverage_start TEXT NOT NULL,
                coverage_end TEXT NOT NULL,
                exported_at TEXT NOT NULL,
                content_sha256 TEXT NOT NULL,
                row_count INTEGER NOT NULL,
                UNIQUE (organization_id, idempotency_key),
                FOREIGN KEY (organization_id, site_id) REFERENCES sites(organization_id, id)
            );
            CREATE TABLE IF NOT EXISTS gsc_daily_rows (
                batch_id TEXT NOT NULL REFERENCES gsc_import_batches(id) ON DELETE CASCADE,
                date TEXT NOT NULL,
                clicks INTEGER NOT NULL,
                impressions INTEGER NOT NULL,
                PRIMARY KEY (batch_id, date)
            );
        """)


def import_gsc_daily(path: str | Path, organization_id: str, site_id: str,
                     idempotency_key: str, raw: bytes, *, property_origin: str,
                     search_type: str, coverage_start: str, coverage_end: str,
                     exported_at: str) -> dict:
    """Store one validated GSC file atomically; a matching retry replays it."""
    if not isinstance(idempotency_key, str) or not 1 <= len(idempotency_key) <= 128:
        raise ImportErrorDetail("idempotency_key", "Provide a key of 1 to 128 characters.")
    result = preview_gsc_daily(raw, property_origin=property_origin, search_type=search_type,
                               coverage_start=coverage_start, coverage_end=coverage_end,
                               exported_at=exported_at)
    request = json.dumps({"site_id": site_id, "property_origin": result["property_origin"],
                          "search_type": search_type, "coverage_start": coverage_start,
                          "coverage_end": coverage_end, "content_sha256": result["content_sha256"]},
                         sort_keys=True, separators=(",", ":"))
    fingerprint = hashlib.sha256(request.encode()).hexdigest()
    with connect(path) as db:
        db.execute("BEGIN IMMEDIATE")
        owned = db.execute("SELECT 1 FROM sites WHERE id=? AND organization_id=?",
                           (site_id, organization_id)).fetchone()
        if not owned:
            raise ImportErrorDetail("site_not_found", "Site not found in this workspace.")
        existing = db.execute("""SELECT id, fingerprint, row_count FROM gsc_import_batches
                                 WHERE organization_id=? AND idempotency_key=?""",
                              (organization_id, idempotency_key)).fetchone()
        if existing:
            if existing["fingerprint"] != fingerprint:
                raise ImportErrorDetail("idempotency_conflict", "Key was used for different input.")
            return {"id": existing["id"], "row_count": existing["row_count"], "replayed": True}
        batch_id = str(uuid.uuid4())
        db.execute("""INSERT INTO gsc_import_batches
                      (id, organization_id, site_id, idempotency_key, fingerprint,
                       property_origin, search_type, coverage_start, coverage_end,
                       exported_at, content_sha256, row_count)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                   (batch_id, organization_id, site_id, idempotency_key, fingerprint,
                    result["property_origin"], search_type, result["coverage_start"],
                    result["coverage_end"], result["exported_at"],
                    result["content_sha256"], len(result["rows"])))
        db.executemany("INSERT INTO gsc_daily_rows(batch_id, date, clicks, impressions) VALUES (?, ?, ?, ?)",
                       ((batch_id, row["date"], row["clicks"], row["impressions"]) for row in result["rows"]))
        return {"id": batch_id, "row_count": len(result["rows"]), "replayed": False}


def get_gsc_import(path: str | Path, organization_id: str, batch_id: str) -> dict | None:
    """Read back within the caller's organization; totals recomputed from rows."""
    with connect(path) as db:
        batch = db.execute("""SELECT * FROM gsc_import_batches
                              WHERE organization_id=? AND id=?""",
                           (organization_id, batch_id)).fetchone()
        if batch is None:
            return None
        rows = db.execute("""SELECT date, clicks, impressions FROM gsc_daily_rows
                             WHERE batch_id=? ORDER BY date""", (batch_id,)).fetchall()
    from datetime import date, timedelta

    start, end = date.fromisoformat(batch["coverage_start"]), date.fromisoformat(batch["coverage_end"])
    seen = {row["date"] for row in rows}
    missing = [(start + timedelta(days=o)).isoformat() for o in range((end - start).days + 1)
               if (start + timedelta(days=o)).isoformat() not in seen]
    clicks = sum(row["clicks"] for row in rows)
    impressions = sum(row["impressions"] for row in rows)
    return {
        "id": batch["id"], "site_id": batch["site_id"],
        "property_origin": batch["property_origin"], "search_type": batch["search_type"],
        "aggregation": "property_daily", "coverage_start": batch["coverage_start"],
        "coverage_end": batch["coverage_end"], "exported_at": batch["exported_at"],
        "content_sha256": batch["content_sha256"],
        "rows": [{"date": row["date"], "clicks": row["clicks"], "impressions": row["impressions"]} for row in rows],
        "missing_dates": missing, "coverage_complete": not missing,
        "observed_clicks": clicks, "observed_impressions": impressions,
        "observed_ctr": str(Decimal(clicks) / Decimal(impressions)) if impressions else None,
    }
