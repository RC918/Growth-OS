"""Declared-Product Rescue Adapter (isolated, non-frozen).

Some custom-theme product pages declare a single product (Open Graph
product type and/or schema.org Product structured data) yet fail the
frozen extractor's strict ownership rules: repeated identical
headings, title-form JSON-LD names, or non-standard containers. This
adapter runs ONLY on a report the frozen builder already classified
as not_supported_product, reusing that report's snapshot (no second
fetch, snapshot id and SHA unchanged). It produces a product report
only when every one of these strict conditions holds:

- the page declares a product (og:type=product or JSON-LD Product);
- all visible H1 texts are one identical product name;
- every JSON-LD product name equals that name or the page title
  (title-form SEO names), so identity is unambiguous;
- the product is supported by a price offer or an add-to-cart
  control inside the product root;
- exactly one H1 is followed, before the next heading, by a
  description cluster of visible paragraphs inside the product
  root (15..2000 chars). A second, different cluster is a conflict.

Anything else returns None and the caller keeps the fail-closed
guidance report. Facts produced here are source_asserted with
snapshot citations, in the same shape the frozen builder emits;
extraction.method is "declared_product_dom" so downstream consumers
can distinguish this evidence class.
"""
from __future__ import annotations

import html as html_lib
import re

from product_source import PageParser, ProductParser, clean, preview_for

_HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}


def _norm(value):
    return clean(html_lib.unescape(value or ""))


def _clusters(parser, root_locator):
    """Map each H1 index to the first contiguous paragraph cluster that
    follows it inside the product root (the short-description position).
    Later sections never join the cluster; an over-long cluster fails."""
    entries = parser.entries
    clusters = {}
    for i, entry in enumerate(entries):
        if entry["tag"] != "h1":
            continue
        paragraphs = []
        for later in entries[i + 1:]:
            if later["tag"] in _HEADINGS:
                break
            if later["tag"] == "p" and root_locator in later["ancestors"] and len(later["value"]) >= 15:
                paragraphs.append(later)
            elif paragraphs:
                break
        if paragraphs:
            text = clean(" ".join(e["value"] for e in paragraphs))
            if 15 <= len(text) <= 2000:
                clusters[i] = (text, paragraphs)
    return clusters


def rescue_declared_product(report):
    """Return a product report built on the same snapshot, or None."""
    if report.get("page_type") != "not_supported_product":
        return None
    snapshot = report.get("snapshot") or {}
    html = snapshot.get("html") or ""
    if not html:
        return None
    page = PageParser(); page.feed(html)
    parser = ProductParser(); parser.feed(html); parser.close()

    headings = [e for e in parser.entries if e["tag"] == "h1"]
    names = {_norm(h["value"]) for h in headings if _norm(h["value"])}
    if len(names) != 1:
        return None
    name = names.pop()

    products = parser.products()
    if not products and not parser.og_product:
        return None
    title = _norm(page.title)
    for product_name, _index in products:
        normalized = _norm(product_name)
        if normalized != name and normalized != title:
            return None

    # Product root: an ancestor of the first H1 whose class marks it
    # as the product container. Without it there is no ownership scope.
    nodes = {n["locator"]: n for n in parser.nodes}
    root_locator = None
    for locator in headings[0]["ancestors"]:
        node = nodes.get(locator)
        if node and "product" in node["attrs"].get("class", "").split():
            root_locator = locator
    if root_locator is None:
        return None

    supported = bool(re.search(r'"offers"\s*:', html)) or any(
        "add-to-cart" in n["attrs"].get("class", "") and root_locator in n["ancestors"]
        for n in parser.nodes)
    if not supported:
        return None

    clusters = _clusters(parser, root_locator)
    distinct_texts = {text for text, _ in clusters.values()}
    if len(distinct_texts) != 1:
        return None
    heading_index, (description_text, paragraphs) = next(iter(clusters.items()))
    heading = parser.entries[heading_index]

    def cite(locator, quote):
        record = {"id": "s" + str(len(snapshot["citations"]) + 1), "snapshot_id": snapshot["id"],
                  "source_version": snapshot["version"], "url": snapshot["final_url"],
                  "locator": locator, "quote": quote}
        snapshot["citations"].append(record)
        return record["id"]

    def fact(value, locator):
        return {"kind": "fact", "verification": "source_asserted", "value": value,
                "citations": [cite(locator, value)]} if value else None

    type_ref = cite("meta[property=og:type]", "product") if parser.og_product else \
        cite("jsonld[" + str(products[0][1] + 1) + "].@type", "Product")
    facts = {"product_name": fact(name, heading["locator"]),
             "title": fact(page.title, "title"),
             "meta_description": fact(page.meta_description, 'meta[name=description]'),
             "description": fact(description_text, paragraphs[0]["locator"]),
             "features": [], "use": None}
    if facts["description"]:
        facts["description"]["citations"] += [cite(e["locator"], e["value"]) for e in paragraphs[1:]]
        facts["description"]["product_scope"] = {
            "locator": root_locator, "name_locator": heading["locator"], "product_name": name}
        facts["description"]["citations"] += facts["product_name"]["citations"]
    missing = [key for key in ("title", "meta_description", "description", "use") if not facts[key]]
    missing.append("features")
    missing += ["specifications", "price", "certifications", "performance", "comparisons", "guarantees"]
    result = {"snapshot": snapshot, "page_type": "product", "facts": facts,
              "extraction": {"method": "declared_product_dom",
                             "limitations": ["Source assertions only; no independent verification.",
                                             "Declared-product rescue: identity from page-declared product data; description is the unique visible cluster after the product heading inside the product root."]},
              "inferences": [{"kind": "inference", "value": "Supported single product page",
                              "basis": "Page-declared product with one heading identity and a uniquely bound visible description",
                              "citations": facts["product_name"]["citations"] + [type_ref]}],
              "missing": missing, "preview": None}
    if facts["description"]:
        result["preview"] = preview_for(result)
    return result if result["preview"] else None
