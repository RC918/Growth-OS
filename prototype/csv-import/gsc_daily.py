"""Offline preview of normalized GSC daily property totals.

No Google account, site connection, database write, or real traffic data is used.
This accepts a deliberately narrow template, not arbitrary native GSC exports.
"""
from __future__ import annotations

import csv
import hashlib
import io
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import urlsplit

from validate import ImportErrorDetail

MAX_BYTES = 1_000_000
MAX_ROWS = 366
HEADER = ["date", "clicks", "impressions"]
SEARCH_TYPES = {"web", "image", "video", "news"}


def _day(value: str, field: str) -> date:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ImportErrorDetail("date", f"{field} must be YYYY-MM-DD.")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ImportErrorDetail("date", f"{field} is not a calendar date.") from exc


def _origin(value: str) -> str:
    try:
        url = urlsplit(value)
        if (url.scheme != "https" or not url.hostname or url.username or url.password
                or url.path not in ("", "/") or url.query or url.fragment or url.port not in (None, 443)):
            raise ValueError
        return f"https://{url.hostname.lower()}"
    except (ValueError, TypeError) as exc:
        raise ImportErrorDetail("property", "Use a plain HTTPS property origin without credentials or path.") from exc


def preview_gsc_daily(raw: bytes, *, property_origin: str, search_type: str,
                      coverage_start: str, coverage_end: str,
                      exported_at: str) -> dict:
    """Validate normalized date/clicks/impressions rows and report coverage gaps.

    The caller supplies the property, search type, selected date interval and
    export timestamp as provenance; this prototype cannot verify them with GSC.
    Missing dates remain unknown, whereas an explicit zero is an observed zero.
    """
    origin = _origin(property_origin)
    if search_type not in SEARCH_TYPES:
        raise ImportErrorDetail("search_type", "Select web, image, video, or news separately.")
    start, end = _day(coverage_start, "coverage_start"), _day(coverage_end, "coverage_end")
    if end < start or (end - start).days >= MAX_ROWS:
        raise ImportErrorDetail("coverage", "Choose a nonempty range of at most 366 days.")
    try:
        stamp = datetime.fromisoformat(exported_at)
        if stamp.tzinfo is None or stamp.utcoffset() is None:
            raise ValueError
        timestamp = stamp.astimezone(timezone.utc).isoformat()
    except (ValueError, TypeError) as exc:
        raise ImportErrorDetail("exported_at", "Provide an export timestamp with a timezone.") from exc
    if not isinstance(raw, bytes) or not raw or len(raw) > MAX_BYTES:
        raise ImportErrorDetail("file_size", "CSV must be nonempty and at most 1 MB.")
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ImportErrorDetail("encoding", "CSV must be UTF-8.") from exc
    reader = csv.DictReader(io.StringIO(content, newline=""), strict=True)
    if reader.fieldnames != HEADER:
        raise ImportErrorDetail("header", "Use exactly: date,clicks,impressions. Do not include queries or page URLs.")
    rows, seen = [], set()
    try:
        for line, source in enumerate(reader, start=2):
            if line > MAX_ROWS + 1:
                raise ImportErrorDetail("row_limit", "CSV exceeds 366 data rows.")
            if None in source or None in source.values():
                raise ImportErrorDetail("row_shape", "Incorrect number of columns.", line)
            day = _day(source["date"].strip(), "date")
            if day < start or day > end:
                raise ImportErrorDetail("date_range", "Row outside the selected interval.", line)
            if day in seen:
                raise ImportErrorDetail("duplicate_day", "Duplicate date in one export.", line)
            seen.add(day)
            counts = []
            for name in ("clicks", "impressions"):
                value = source[name].strip()
                if not value or not value.isascii() or not value.isdecimal():
                    raise ImportErrorDetail("count", f"{name} must be an explicit nonnegative integer.", line)
                counts.append(int(value))
            clicks, impressions = counts
            if impressions == 0 and clicks > 0:
                raise ImportErrorDetail("count", "Clicks require impressions for this daily row.", line)
            rows.append({"date": day.isoformat(), "clicks": clicks, "impressions": impressions})
    except csv.Error as exc:
        raise ImportErrorDetail("csv_format", "Malformed CSV.") from exc
    if not rows:
        raise ImportErrorDetail("empty", "CSV has no daily rows.")
    rows.sort(key=lambda row: row["date"])
    missing = [(start + timedelta(days=offset)).isoformat()
               for offset in range((end - start).days + 1)
               if start + timedelta(days=offset) not in seen]
    clicks = sum(row["clicks"] for row in rows)
    impressions = sum(row["impressions"] for row in rows)
    return {
        "property_origin": origin, "search_type": search_type,
        "aggregation": "property_daily", "coverage_start": start.isoformat(),
        "coverage_end": end.isoformat(), "exported_at": timestamp,
        "content_sha256": hashlib.sha256(raw).hexdigest(), "rows": rows,
        "missing_dates": missing, "coverage_complete": not missing,
        "observed_clicks": clicks, "observed_impressions": impressions,
        "observed_ctr": str(Decimal(clicks) / Decimal(impressions)) if impressions else None,
        "limitations": [
            "Caller-supplied property, search type, range, and timestamp are not verified by Google.",
            "Only observed daily rows are summed; missing dates are unknown, not zero.",
            "Property chart totals must not be added to page or query tables.",
            "Manual report exports may be truncated and some unavailable values export as zero.",
            "No GA4 sessions, conversions, causal lift, or AI visibility is inferred.",
        ],
    }


def compare_complete_periods(before: dict, after: dict) -> dict:
    """Descriptive comparison only; refuse gaps and mixed properties/search types."""
    if not before["coverage_complete"] or not after["coverage_complete"]:
        raise ImportErrorDetail("incomplete", "Missing days must be resolved before a period comparison.")
    if (before["property_origin"], before["search_type"], before["aggregation"]) != (
            after["property_origin"], after["search_type"], after["aggregation"]):
        raise ImportErrorDetail("incompatible", "Compare the same property, search type, and aggregation.")
    if before["coverage_end"] >= after["coverage_start"]:
        raise ImportErrorDetail("overlap", "Before must end before after begins.")
    before_days = (date.fromisoformat(before["coverage_end"]) - date.fromisoformat(before["coverage_start"])).days + 1
    after_days = (date.fromisoformat(after["coverage_end"]) - date.fromisoformat(after["coverage_start"])).days + 1
    if before_days != after_days:
        raise ImportErrorDetail("unequal_periods", "Compare periods with the same number of calendar days.")
    return {
        "before": {"start": before["coverage_start"], "end": before["coverage_end"],
                   "clicks": before["observed_clicks"], "impressions": before["observed_impressions"]},
        "after": {"start": after["coverage_start"], "end": after["coverage_end"],
                  "clicks": after["observed_clicks"], "impressions": after["observed_impressions"]},
        "click_difference": after["observed_clicks"] - before["observed_clicks"],
        "impression_difference": after["observed_impressions"] - before["observed_impressions"],
        "interpretation": "Observed period difference only; not causal lift or attributed conversions.",
    }
