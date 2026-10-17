"""First Useful Result adapter: frozen HTTP gates, RFC 9309 robots policy.

Loads the frozen product_api module in isolation (same pattern as
service_api) and swaps only its snapshot builder: robots.txt 404/410 is
treated as an empty robots file per RFC 9309, other robots failures keep
the bounded cause classification, and unsupported pages gain actionable
guidance. Frozen files and their capacity/rate-limit gates are unchanged.
"""
import importlib.util
from pathlib import Path

from error_classify import classified_error
from robots_policy import build_snapshot as _build_snapshot, enrich_guidance

spec = importlib.util.spec_from_file_location('_first_result_http', Path(__file__).with_name('product_api.py'))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


def build_snapshot(*args, **kwargs):
    try:
        return enrich_guidance(_build_snapshot(*args, **kwargs))
    except Exception as exc:
        if getattr(exc, "code", None) == "robots_unavailable":
            raise classified_error(exc) from exc
        raise


api.build_snapshot = build_snapshot
handle_product, respond = api.handle_product, api.respond
