"""Candidate adapter: frozen HTTP gates, isolated state, explicit source builder."""
import importlib.util
from pathlib import Path
from service_source import build_snapshot

spec = importlib.util.spec_from_file_location('_service_preview_http', Path(__file__).with_name('product_api.py'))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
api.build_snapshot = build_snapshot
handle_product, respond = api.handle_product, api.respond
