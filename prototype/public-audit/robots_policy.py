"""RFC 9309 robots.txt availability policy for the First Useful Result path.

The frozen scanner treats every non-200 robots.txt response as
``robots_unavailable``. Under RFC 9309, a robots.txt that does not exist
(HTTP 404/410) carries no crawl restrictions, so proceeding is not a bypass:
there are no rules to bypass. Every other availability failure (401, 403,
429, 5xx, redirect or network errors) stays fail-closed, and a robots.txt
that does exist is still parsed and enforced by the frozen scanner exactly
as before. Page retrieval always goes through the frozen fetcher, so SSRF,
size, redirect and content-type protections are unchanged.
"""
from __future__ import annotations

import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from scanner import ScanError, fetch_following_redirects, fetch_once, normalize_url

EMPTY_ROBOTS_STATUSES = frozenset({404, 410})

# Explicit tracking-parameter allowlist. Only these names are removed during
# normalization; every other query parameter is preserved untouched (and the
# frozen builder will keep rejecting URLs whose remaining query could change
# content). Parameter values are never recorded, only names.
TRACKING_PARAMETERS = frozenset({
    "gclid", "gbraid", "wbraid", "dclid", "fbclid", "msclkid", "twclid",
    "ttclid", "li_fat_id", "mc_cid", "mc_eid", "igshid", "rb_clickid",
    "s_kwcid", "_kx", "vero_id",
})


def _is_tracking(name: str) -> bool:
    lowered = name.lower()
    return lowered.startswith("utm_") or lowered in TRACKING_PARAMETERS


def sanitize_tracking_params(raw_url):
    """Remove allowlisted tracking params. Returns (url, removed_names)."""
    if not isinstance(raw_url, str):
        return raw_url, []
    parts = urlsplit(raw_url.strip())
    if not parts.query:
        return raw_url, []
    pairs = parse_qsl(parts.query, keep_blank_values=True)
    kept = [(k, v) for k, v in pairs if not _is_tracking(k)]
    removed = sorted({k for k, _ in pairs if _is_tracking(k)})
    if not removed:
        return raw_url, []
    cleaned = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(kept), ""))
    return cleaned, removed


def robots_status(raw_url, fetch=fetch_once):
    """Final robots.txt HTTP status, or None when it cannot be determined."""
    host = urlsplit(normalize_url(raw_url)).hostname
    try:
        _, status, _, _ = fetch_following_redirects(f"https://{host}/robots.txt", fetch)
    except ScanError:
        return None
    return status


def build_snapshot(raw_url, fetch=fetch_once, clock=None):
    """Frozen builder + tracking-param normalization + 404/410 robots policy."""
    from product_source import build_snapshot as frozen_build

    cleaned_url, removed = sanitize_tracking_params(raw_url)
    try:
        report = frozen_build(cleaned_url, fetch=fetch, clock=clock)
    except ScanError as exc:
        if exc.code != "robots_unavailable":
            raise
        if robots_status(cleaned_url, fetch) not in EMPTY_ROBOTS_STATUSES:
            raise
        host = urlsplit(normalize_url(cleaned_url)).hostname
        robots_url = f"https://{host}/robots.txt"

        def policy_fetch(url):
            if url == robots_url:
                return 200, {}, b""
            return fetch(url)

        report = frozen_build(cleaned_url, fetch=policy_fetch, clock=clock)
    if removed:
        report["url_sanitization"] = {"removed_tracking_parameters": removed}
    return report


_GUIDANCE = {
    "listing_with_candidates": [
        "點選下方任一產品候選，系統會自動帶入該網址並重新讀取。",
        "或直接貼上單一產品的詳細頁網址（網址通常包含產品名稱或型號）。",
    ],
    "homepage": [
        "這是網站首頁。請改貼站內單一產品或服務方案的詳細頁網址。",
        "若不確定產品頁位置，請先開啟網站的產品或服務列表，點進任一項目後複製該頁網址再貼回。",
        "若本站內容主要由 JavaScript 動態載入，請改用可直接開啟且含產品說明的公開頁面。",
    ],
    "service_or_list": [
        "這是服務或清單頁，未包含單一產品的完整資訊。請貼上單一產品或方案的詳細頁網址。",
        "您可以從此頁點進任一項目或方案，複製詳細頁網址後再貼回。",
    ],
    "unsupported": [
        "請改貼公開的單一產品詳細頁網址（不需登入、含產品名稱與說明）。",
        "若產品資訊分散在多個頁面，請選擇資訊最完整的那一頁。",
    ],
}


def enrich_guidance(report):
    """Add a page-kind classification and actionable next steps when unsupported."""
    if report.get("page_type") != "not_supported_product":
        return report
    snapshot = report.get("snapshot") or {}
    html = snapshot.get("html") or ""
    candidates = [item for item in report.get("inferences", []) if item.get("url")]
    path = urlsplit(snapshot.get("final_url") or "").path
    h1_count = len(re.findall(r"<h1[\s>]", html, re.IGNORECASE))
    if candidates:
        kind = "listing_with_candidates"
    elif path in ("", "/"):
        kind = "homepage"
    elif h1_count == 0:
        kind = "service_or_list"
    else:
        kind = "unsupported"
    report["guidance"] = {"page_kind": kind, "next_steps": list(_GUIDANCE[kind])}
    return report
