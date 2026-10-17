"""Candidate adapter: frozen HTTP gates, isolated state, explicit source builder."""
import importlib.util
from pathlib import Path
from error_classify import classified_error
from service_source import build_snapshot as _build_snapshot

spec = importlib.util.spec_from_file_location('_service_preview_http', Path(__file__).with_name('product_api.py'))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


def build_snapshot(*args, **kwargs):
    try:
        return _build_snapshot(*args, **kwargs)
    except Exception as exc:
        if getattr(exc, "code", None) == "robots_unavailable":
            raise classified_error(exc) from exc
        raise


api.build_snapshot = build_snapshot
handle_product, respond = api.handle_product, api.respond
