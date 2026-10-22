"""Offline pilot/GSC readiness preflight (no account, network, or site write).

This is pre-work for a future real pilot only. It composes the existing
normalized GSC validator, presentation contract, and Workspace snapshot
mapping to answer one bounded question: is a caller-supplied daily export
ready to be saved through the existing Workspace path, and what remains
externally authorized before any real pilot can start?

Authority rule (Owner decision, 2026-10-18): the persistent Workspace store
(Supabase Auth + ``save_search_observation`` snapshot v2) is authoritative.
Local stores -- the SQLite prototype here and the First Result 100-report
retained cache -- are caches/proofs only and are never authoritative, so
this preflight neither reads nor writes them. No database, Google account,
or site is touched; provider declarations stay unverified.
"""
from __future__ import annotations

from gsc_daily import preview_gsc_daily
from gsc_present import present_gsc
from gsc_workspace import to_workspace_snapshot
from store import ImportErrorDetail

SNAPSHOT_AUTHORITY = "workspace_persistent"
LOCAL_STORE_ROLE = "cache_only_not_authoritative"
PENDING_EXTERNAL_AUTHORIZATION = ["real_gsc_account_authorization", "real_site_write_permission"]


def assess_pilot_readiness(raw: bytes, *, property_origin: str, search_type: str,
                           coverage_start: str, coverage_end: str, exported_at: str,
                           sample: bool) -> dict:
    """Validate one declared export and report pilot readiness tiers.

    ``workspace_save_ready`` only means the data may enter the existing
    Workspace snapshot contract. It never means Google verified the source,
    real traffic was observed, or a real pilot may start.
    """
    if not isinstance(sample, bool):
        raise ImportErrorDetail("sample", "Declare sample true or false explicitly.")
    checked = preview_gsc_daily(raw, property_origin=property_origin, search_type=search_type,
                                coverage_start=coverage_start, coverage_end=coverage_end,
                                exported_at=exported_at)
    readback = {
        "property_origin": checked["property_origin"], "search_type": checked["search_type"],
        "coverage_start": checked["coverage_start"], "coverage_end": checked["coverage_end"],
        "exported_at": checked["exported_at"], "content_sha256": checked["content_sha256"],
        "rows": checked["rows"], "missing_dates": checked["missing_dates"],
        "coverage_complete": checked["coverage_complete"],
        "observed_clicks": checked["observed_clicks"],
        "observed_impressions": checked["observed_impressions"],
        "observed_ctr": checked["observed_ctr"],
    }
    view = present_gsc(readback)
    blockers = []
    if not checked["coverage_complete"]:
        blockers.append({"code": "missing_dates", "dates": checked["missing_dates"],
                         "detail": "缺日為未知，不填零；補齊前不得作為試點基線。"})
    workspace_save_ready = not blockers
    return {
        "state": "ready" if workspace_save_ready else "not_ready",
        "workspace_save_ready": workspace_save_ready,
        "real_pilot_ready": False,
        "data_kind": "synthetic_declared" if sample else "provider_asserted_unverified",
        "authority": {"snapshot": SNAPSHOT_AUTHORITY, "local_store": LOCAL_STORE_ROLE,
                      "local_caches_are_authoritative": False},
        "workspace_snapshot": to_workspace_snapshot(readback, sample=sample) if workspace_save_ready else None,
        "presentation": view,
        "blockers": blockers,
        "pending_external_authorization": list(PENDING_EXTERNAL_AUTHORIZATION),
        "google_verified": False,
        "traffic_verified": False,
        "causal_claim": False,
        "indexing_status": "unknown",
        "unknowns": [*view["unknowns"], *checked["limitations"]],
    }
