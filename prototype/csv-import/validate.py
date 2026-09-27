"""Offline preview for de-identified daily funnel CSVs; no account or DB access."""
from __future__ import annotations

import csv
import hashlib
import io
from datetime import date
from decimal import Decimal, InvalidOperation

MAX_BYTES = 1_000_000
MAX_ROWS = 10_000
DIMENSIONS = ("report_date", "source", "medium", "campaign", "landing_path", "device")
COUNTS = ("ad_clicks", "landing_sessions", "engaged_sessions", "form_starts",
          "leads", "qualified_leads", "checkouts", "purchases", "refunds")
MONEY = ("gross_revenue", "refunded_revenue")
OPTIONAL = ("currency",) + COUNTS + MONEY
METRICS_BY_SOURCE = {
    "ad_platform": {"ad_clicks"},
    "ga4": {"landing_sessions", "engaged_sessions", "form_starts", "leads", "checkouts", "purchases"},
    "store": {"purchases", "refunds", "gross_revenue", "refunded_revenue"},
    "crm": {"leads", "qualified_leads"},
}


class ImportErrorDetail(ValueError):
    def __init__(self, code: str, message: str, row: int | None = None):
        super().__init__(message)
        self.code, self.row = code, row


def preview(raw: bytes, source_type: str, mapping: dict[str, str]) -> dict:
    """Validate one source's aggregate CSV and return typed rows for preview only.

    Mapping keys are target field names and values are input CSV column names. No
    names, emails, transaction IDs, or other row-level data are accepted.
    """
    if source_type not in METRICS_BY_SOURCE:
        raise ImportErrorDetail("source_unsupported", "Choose ga4, ad_platform, store, or crm.")
    if len(raw) > MAX_BYTES or not raw:
        raise ImportErrorDetail("file_size", "CSV must be nonempty and at most 1 MB.")
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ImportErrorDetail("encoding", "CSV must be UTF-8.") from exc
    allowed = set(DIMENSIONS + OPTIONAL)
    if not isinstance(mapping, dict) or set(mapping) - allowed or not all(
            isinstance(key, str) and isinstance(value, str) and value for key, value in mapping.items()):
        raise ImportErrorDetail("mapping", "Mapping contains an unknown or empty field.")
    required = {"report_date", "source", "medium", "landing_path"}
    if required - mapping.keys() or not (set(mapping) & METRICS_BY_SOURCE[source_type]):
        raise ImportErrorDetail("mapping", "Map date, source, medium, landing path and one supported metric.")
    if len(set(mapping.values())) != len(mapping):
        raise ImportErrorDetail("mapping", "A CSV column cannot map to multiple fields.")
    if (set(mapping) & set(COUNTS + MONEY)) - METRICS_BY_SOURCE[source_type]:
        raise ImportErrorDetail("metric_source", "This metric does not belong to the selected source.")
    reader = csv.DictReader(io.StringIO(content, newline=""), strict=True)
    if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames) or any(
            not field or len(field) > 100 for field in reader.fieldnames):
        raise ImportErrorDetail("header", "CSV needs unique, nonempty column names under 100 characters.")
    if set(mapping.values()) - set(reader.fieldnames):
        raise ImportErrorDetail("missing_column", "A mapped column is missing from the CSV header.")
    records, seen = [], set()
    try:
        for line, source_row in enumerate(reader, start=2):
            if line > MAX_ROWS + 1:
                raise ImportErrorDetail("row_limit", "CSV exceeds 10,000 rows.")
            if None in source_row or None in source_row.values():
                raise ImportErrorDetail("row_shape", "Row has the wrong number of columns.", line)
            row = {field: source_row[column].strip() for field, column in mapping.items()}
            try:
                row["report_date"] = date.fromisoformat(row["report_date"]).isoformat()
            except ValueError as exc:
                raise ImportErrorDetail("date", "Date must be YYYY-MM-DD.", line) from exc
            for field in ("source", "medium", "campaign", "device"):
                row.setdefault(field, "" if field == "campaign" else "unknown")
                if (not row[field] and field != "campaign") or len(row[field]) > 100:
                    raise ImportErrorDetail("dimension", f"Invalid {field}.", line)
            if not row["landing_path"].startswith("/") or len(row["landing_path"]) > 2048 or "?" in row["landing_path"]:
                raise ImportErrorDetail("landing_path", "Use a path without query parameters.", line)
            currency = row.get("currency", "")
            if currency and (len(currency) != 3 or not currency.isalpha() or not currency.isascii()):
                raise ImportErrorDetail("currency", "Currency must be a three-letter code.", line)
            row["currency"] = currency.upper() or None
            for field in COUNTS:
                value = row.get(field, "")
                if value == "":
                    row[field] = None
                elif value.isascii() and value.isdecimal():
                    row[field] = int(value)
                else:
                    raise ImportErrorDetail("count", f"{field} must be a nonnegative integer or empty.", line)
            for field in MONEY:
                value = row.get(field, "")
                try:
                    amount = Decimal(value) if value else None
                except InvalidOperation as exc:
                    raise ImportErrorDetail("money", f"{field} must be a nonnegative amount or empty.", line) from exc
                if amount is not None and (not amount.is_finite() or amount < 0 or amount.as_tuple().exponent < -2):
                    raise ImportErrorDetail("money", f"{field} must be nonnegative with at most two decimals.", line)
                row[field] = str(amount) if amount is not None else None
                if amount is not None and row["currency"] is None:
                    raise ImportErrorDetail("currency", "A currency is required for revenue.", line)
            key = tuple(row[field] for field in DIMENSIONS)
            if key in seen:
                raise ImportErrorDetail("duplicate_segment", "Duplicate date and segment in one file.", line)
            seen.add(key)
            records.append(row)
    except csv.Error as exc:
        raise ImportErrorDetail("csv_format", "Malformed CSV.") from exc
    if not records:
        raise ImportErrorDetail("empty", "CSV has no data rows.")
    return {"source_type": source_type, "row_count": len(records), "rows": records,
            "content_sha256": hashlib.sha256(raw).hexdigest(),
            "limitations": ["Preview only; no authorization, persistence, or funnel computation.",
                            "Input must already be consented and aggregated without personal data."]}
