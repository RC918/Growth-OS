"""First Useful Result adapter: frozen HTTP gates, RFC 9309 robots policy.

Loads the frozen product_api module in isolation (same pattern as
service_api) and swaps only its snapshot builder: robots.txt 404/410 is
treated as an empty robots file per RFC 9309, other robots failures keep
the bounded cause classification, and unsupported pages gain actionable
guidance. Frozen files and their capacity/rate-limit gates are unchanged.
"""
import importlib.util
import re
from pathlib import Path

from error_classify import classified_error
from robots_policy import build_snapshot as _build_snapshot, enrich_guidance

spec = importlib.util.spec_from_file_location('_first_result_http', Path(__file__).with_name('product_api.py'))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


def _text(pattern, html):
    match = re.search(pattern, html, re.IGNORECASE | re.DOTALL)
    if not match:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", match.group(1))).strip()


def opportunity_summary(report):
    """Verifiable page-level summary when no single product is reliable."""
    snapshot = report.get("snapshot") or {}
    html = snapshot.get("html") or ""
    candidates = [item for item in report.get("inferences", []) if item.get("url")]
    summary = {
        "page_kind": (report.get("guidance") or {}).get("page_kind", "unsupported"),
        "site_title": _text(r"<title[^>]*>(.*?)</title>", html)[:200],
        "headline": (_text(r"<h1[^>]*>(.*?)</h1>", html) or _text(r"<h2[^>]*>(.*?)</h2>", html))[:200],
        "candidate_count": len(candidates),
        "recommended_candidate": None,
        "alternative_candidates": [],
        "note": "僅整理來源頁面可觀察資訊；未驗證為單一產品事實，不捏造產品名稱或描述。",
    }
    if candidates:
        first = candidates[0]
        summary["recommended_candidate"] = {
            "url": first["url"], "label": first.get("label", ""),
            "reason": "頁面上第一個符合產品頁路徑的連結；尚未驗證，點選後將重新讀取確認。",
        }
        summary["alternative_candidates"] = [
            {"url": item["url"], "label": item.get("label", "")} for item in candidates[1:]
        ]
    return summary


def build_snapshot(*args, **kwargs):
    try:
        report = enrich_guidance(_build_snapshot(*args, **kwargs))
        if report.get("page_type") == "not_supported_product":
            candidates = [item for item in report.get("inferences", []) if item.get("url")]
            if len(candidates) == 1:
                # Exactly one product candidate: follow it once and, only if
                # it reliably resolves to a product, return that result with
                # full provenance. Never follow more than one hop.
                follow_kwargs = dict(kwargs)
                if len(args) > 1:
                    follow_kwargs.setdefault("fetch", args[1])
                if len(args) > 2:
                    follow_kwargs.setdefault("clock", args[2])
                try:
                    followed = enrich_guidance(_build_snapshot(candidates[0]["url"], **follow_kwargs))
                except Exception:
                    followed = None
                if followed is not None and followed.get("page_type") == "product" and followed.get("preview"):
                    followed["auto_selected"] = {
                        "from_url": (report.get("snapshot") or {}).get("original_url"),
                        "candidate_url": candidates[0]["url"],
                        "reason": "入口頁只有一個符合產品頁路徑的候選，已自動帶入並重新讀取驗證。",
                    }
                    return followed
            report["opportunity_summary"] = opportunity_summary(report)
            # Single-entry integration: a page that is not a single product
            # may still be a reliably identifiable Service/tool/subpage.
            # Reuse the existing service builder; any failure keeps the
            # product-path report (with guidance) unchanged.
            try:
                from service_source import build_snapshot as service_build
                service_kwargs = dict(kwargs)
                if len(args) > 1:
                    service_kwargs.setdefault("fetch", args[1])
                if len(args) > 2:
                    service_kwargs.setdefault("clock", args[2])
                service_report = service_build(args[0] if args else kwargs.get("raw_url"), **service_kwargs)
            except Exception:
                service_report = None
            if (service_report is not None and service_report.get("preview")
                    and service_report.get("page_type") in ("service", "software_application", "static_subpage")):
                service_report["result_kind"] = service_report["page_type"]
                return service_report
        return report
    except Exception as exc:
        if getattr(exc, "code", None) == "robots_unavailable":
            raise classified_error(exc) from exc
        raise


api.build_snapshot = build_snapshot
handle_product, respond = api.handle_product, api.respond
