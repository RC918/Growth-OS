"""Offline contract adapter: stored GSC readback -> Workspace snapshot v2.

The Workspace already owns identity, tenancy, and storage through Supabase
Auth plus the owner-only RPC ``save_search_observation`` whose payload is the
version-2 snapshot ``{format, version, a, b, actions}`` validated again in
the database. This adapter only proves, offline, that a tenant-scoped GSC
readback maps losslessly onto that existing contract so the shortest
integration path reuses it instead of building a second identity/database.

Field mapping: property_origin->meta.origin, search_type->meta.type,
coverage_start->meta.start, coverage_end->meta.end, exported_at->meta.exported,
rows pass through as {date, clicks, impressions}. ``sample`` has no source in
the readback and must be declared explicitly by the caller; it is never
defaulted, so synthetic data cannot silently pose as real.
"""
from __future__ import annotations

from gsc_daily import preview_gsc_daily
from store import ImportErrorDetail

FORMAT = "growth-os-search-baseline"
VERSION = 2


def to_workspace_snapshot(readback: dict, *, sample: bool) -> dict:
    """Map one readback to snapshot v2 dataset ``a`` (b/actions empty)."""
    if not isinstance(sample, bool):
        raise ImportErrorDetail("sample", "Declare sample true or false explicitly.")
    rows = [{"date": r["date"], "clicks": r["clicks"], "impressions": r["impressions"]}
            for r in readback["rows"]]
    csv_text = "date,clicks,impressions\n" + "\n".join(
        f"{r['date']},{r['clicks']},{r['impressions']}" for r in rows)
    # Re-validate through the same preview the database contract mirrors, so a
    # tampered or out-of-range readback is refused before it can be saved.
    checked = preview_gsc_daily(csv_text.encode(), property_origin=readback["property_origin"],
                                search_type=readback["search_type"],
                                coverage_start=readback["coverage_start"],
                                coverage_end=readback["coverage_end"],
                                exported_at=readback["exported_at"])
    if checked["rows"] != rows:
        raise ImportErrorDetail("readback_mismatch", "Stored rows do not survive revalidation.")
    dataset = {
        "meta": {
            "origin": readback["property_origin"],
            "type": readback["search_type"],
            "start": readback["coverage_start"],
            "end": readback["coverage_end"],
            "exported": readback["exported_at"],
        },
        "rows": rows,
        "sample": sample,
    }
    return {"format": FORMAT, "version": VERSION, "a": dataset, "b": None, "actions": []}
