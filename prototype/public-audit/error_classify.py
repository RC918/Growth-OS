"""Bounded failure-cause classification for collapsed scan errors.

The frozen scanner collapses every robots.txt fetch failure into the single
public code ``robots_unavailable`` while preserving the underlying ScanError
as ``__cause__``. This helper (outside the frozen set) maps that cause chain
to a fixed whitelist of reason categories so operators can tell DNS, timeout,
TLS, and HTTP causes apart without leaking URLs, hosts, or raw exceptions.
"""
from __future__ import annotations

CAUSE_CATEGORIES = {
    "dns_failed": "dns",
    "dns_busy": "dns",
    "timeout": "timeout",
    "peer_mismatch": "tls_peer",
    "fetch_failed": "network",
    "too_large": "response_size",
    "too_many_redirects": "redirects",
    "redirect_failed": "redirects",
    "cross_domain_redirect": "redirects",
    "private_target": "private_target",
    "restricted_content": "restricted",
    "not_html": "not_html",
    "page_complexity": "page_complexity",
    "robots_disallowed": "robots_disallowed",
}


def cause_category(exc) -> str | None:
    """Return the first whitelisted category in the cause chain, else None."""
    seen = set()
    current = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        category = CAUSE_CATEGORIES.get(getattr(current, "code", None))
        if category:
            return category
        current = getattr(current, "__cause__", None)
    return None


def classified_error(exc):
    """Same public code, detail enriched with the bounded cause category."""
    from scanner import ScanError

    return ScanError(getattr(exc, "code", "processing_failed"), classified_detail(exc))


def classified_detail(exc) -> str:
    """Public detail with a bounded cause category appended when known."""
    detail = str(exc)
    if getattr(exc, "code", None) != "robots_unavailable":
        return detail
    category = cause_category(exc)
    if category is None:
        return detail
    return f"{detail} Cause category: {category}."
