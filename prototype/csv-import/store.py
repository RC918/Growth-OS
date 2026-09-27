"""Local transaction proof for tenant-scoped, idempotent aggregate imports.

Only a trusted caller may supply organization_id/site_id after authorization.
This module has no HTTP endpoint, authentication, or domain verification.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from pathlib import Path

from validate import ImportErrorDetail, preview


def connect(path: str | Path) -> sqlite3.Connection:
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def initialize(path: str | Path) -> None:
    with connect(path) as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS organizations (
                id TEXT PRIMARY KEY
            );
            CREATE TABLE IF NOT EXISTS sites (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL REFERENCES organizations(id),
                UNIQUE (organization_id, id)
            );
            CREATE TABLE IF NOT EXISTS import_batches (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                site_id TEXT NOT NULL,
                source_type TEXT NOT NULL,
                idempotency_key TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                row_count INTEGER NOT NULL,
                UNIQUE (organization_id, source_type, idempotency_key),
                FOREIGN KEY (organization_id, site_id) REFERENCES sites(organization_id, id)
            );
            CREATE TABLE IF NOT EXISTS segments (
                batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
                row_number INTEGER NOT NULL,
                data_json TEXT NOT NULL,
                PRIMARY KEY (batch_id, row_number)
            );
        """)


def import_batch(path: str | Path, organization_id: str, site_id: str,
                 idempotency_key: str, raw: bytes, source_type: str,
                 mapping: dict[str, str]) -> dict:
    """Store one validated file atomically; a matching retry returns its first batch."""
    if not isinstance(idempotency_key, str) or not 1 <= len(idempotency_key) <= 128:
        raise ImportErrorDetail("idempotency_key", "Provide a key of 1 to 128 characters.")
    result = preview(raw, source_type, mapping)
    request = json.dumps({"site_id": site_id, "source_type": source_type,
                          "mapping": mapping, "content_sha256": result["content_sha256"]},
                         sort_keys=True, separators=(",", ":"))
    fingerprint = hashlib.sha256(request.encode()).hexdigest()
    with connect(path) as db:
        db.execute("BEGIN IMMEDIATE")
        owned = db.execute("SELECT 1 FROM sites WHERE id=? AND organization_id=?",
                           (site_id, organization_id)).fetchone()
        if not owned:
            raise ImportErrorDetail("site_not_found", "Site not found in this workspace.")
        existing = db.execute("""SELECT id, fingerprint, row_count FROM import_batches
                              WHERE organization_id=? AND source_type=? AND idempotency_key=?""",
                              (organization_id, source_type, idempotency_key)).fetchone()
        if existing:
            if existing["fingerprint"] != fingerprint:
                raise ImportErrorDetail("idempotency_conflict", "Key was used for different input.")
            return {"id": existing["id"], "row_count": existing["row_count"], "replayed": True}
        batch_id = str(uuid.uuid4())
        db.execute("""INSERT INTO import_batches
                   (id, organization_id, site_id, source_type, idempotency_key, fingerprint, row_count)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                   (batch_id, organization_id, site_id, source_type,
                    idempotency_key, fingerprint, result["row_count"]))
        db.executemany("INSERT INTO segments(batch_id, row_number, data_json) VALUES (?, ?, ?)",
                       ((batch_id, index, json.dumps(row, ensure_ascii=False, sort_keys=True))
                        for index, row in enumerate(result["rows"], start=1)))
        return {"id": batch_id, "row_count": result["row_count"], "replayed": False}


def get_batch(path: str | Path, organization_id: str, batch_id: str) -> dict | None:
    """Read only within the caller's already-authorized organization context."""
    with connect(path) as db:
        row = db.execute("""SELECT id, site_id, source_type, row_count FROM import_batches
                            WHERE organization_id=? AND id=?""", (organization_id, batch_id)).fetchone()
        return dict(row) if row else None


def get_segments(path: str | Path, organization_id: str, batch_id: str) -> list[dict]:
    with connect(path) as db:
        rows = db.execute("""SELECT segments.data_json FROM segments
                             JOIN import_batches ON import_batches.id = segments.batch_id
                             WHERE import_batches.organization_id=? AND import_batches.id=?
                             ORDER BY segments.row_number""", (organization_id, batch_id)).fetchall()
        return [json.loads(row["data_json"]) for row in rows]
