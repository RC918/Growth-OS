"""URL-first local slice. Source assertions are not independently verified facts."""
import hashlib
import base64
import json
import re
import uuid
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urlsplit, urljoin

from scanner import ScanError, PageParser, fetch_public_html, fetch_once, normalize_url

def clean(value):
    return " ".join(value.split()) if isinstance(value, str) else ""

class ProductParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.entries, self.scripts = [], [], []
        self.og_product = False
        self.counter = 0

    def handle_starttag(self, tag, attrs):
        if self.counter >= 20000 or len(self.stack) >= 128:
            raise ScanError("page_complexity", "The public HTML exceeds parsing complexity limits; choose a simpler product page.")
        attrs = dict(attrs)
        blocked = any(e["blocked"] for e in self.stack) or tag in ("style", "noscript", "nav", "footer")
        blocked = blocked or "hidden" in attrs or attrs.get("aria-hidden") == "true"
        self.counter += 1
        entry = {"tag": tag, "attrs": attrs, "text": [], "text_size": 0, "blocked": blocked,
                 "locator": tag + "[" + str(self.counter) + "]",
                 "in_main": tag in ("main", "article") or any(e["tag"] in ("main", "article") for e in self.stack)}
        if tag == "meta" and attrs.get("property", "").lower() == "og:type":
            self.og_product = attrs.get("content", "").lower() in ("product", "og:product")
        if tag not in ("meta", "link", "input", "img", "br", "hr", "source", "area", "wbr", "embed"):
            self.stack.append(entry)

    def handle_data(self, value):
        if self.stack and self.stack[-1]["tag"] == "script":
            self.stack[-1]["text"].append(value); return
        if any(e["blocked"] for e in self.stack): return
        for entry in self.stack:
            remaining = 2000 - entry["text_size"]
            if remaining > 0:
                fragment = value[:remaining]
                entry["text"].append(fragment)
                entry["text_size"] += len(fragment)

    def handle_endtag(self, tag):
        match = next((i for i in range(len(self.stack)-1, -1, -1) if self.stack[i]["tag"] == tag), None)
        if match is None: return
        closing = self.stack[match:]
        self.stack = self.stack[:match]
        for entry in reversed(closing):
            value = clean(" ".join(entry["text"]))
            if entry["tag"] == "script":
                if entry["attrs"].get("type", "").lower() == "application/ld+json":
                    self.scripts.append("".join(entry["text"]))
            elif not entry["blocked"] and value:
                if entry["tag"] in ("h1", "p", "li", "a"):
                    entry["value"] = value[:2000]
                    self.entries.append(entry)

    def products(self):
        found = []
        for index, raw in enumerate(self.scripts[:20]):
            try: data = json.loads(raw)
            except (ValueError, RecursionError): continue
            nodes = data if isinstance(data, list) else [data]
            for node in nodes[:50]:
                if not isinstance(node, dict): continue
                candidates = [node] + (node.get("@graph", []) if isinstance(node.get("@graph"), list) else [])
                for item in candidates[:50]:
                    if not isinstance(item, dict): continue
                    types = item.get("@type", [])
                    if isinstance(types, str): types = [types]
                    if isinstance(types, list) and "Product" in types and clean(item.get("name")):
                        found.append((clean(item["name"])[:200], index))
        return found

def product_url(raw):
    value = normalize_url(raw)
    if urlsplit(raw.strip()).query:
        raise ScanError("unsupported_query", "Use the canonical public product URL without query parameters.")
    return value

def build_snapshot(raw_url, fetch=fetch_once, clock=None):
    original = product_url(raw_url)
    initial, final, body = fetch_public_html(original, fetch)
    page = PageParser(); page.feed(body.decode("utf-8", errors="replace"))
    if page.password_inputs:
        raise ScanError("restricted_content", "A login/password form was detected; no restricted content is processed.")
    parser = ProductParser(); parser.feed(body.decode("utf-8", errors="replace")); parser.close()
    fingerprint = hashlib.sha256(body).hexdigest()
    snapshot = {"schema_version": 1, "id": str(uuid.uuid4()), "original_url": original, "final_url": final,
                "fetched_at": clock() if clock else datetime.now(timezone.utc).isoformat(),
                "content_fingerprint": "sha256:" + fingerprint, "version": fingerprint,
                "encoding": "utf-8-with-replacement", "html": body.decode("utf-8", errors="replace"), "content_base64": base64.b64encode(body).decode("ascii"),
                "citations": [], "limitations": ["Public static HTML only.", "Source assertions, not independent factual verification.",
                                                   "No cookies, login, JavaScript execution or model calls."]}
    def cite(locator, quote):
        record = {"id": "s" + str(len(snapshot["citations"])+1), "snapshot_id": snapshot["id"],
                  "source_version": snapshot["version"], "url": final, "locator": locator, "quote": quote}
        snapshot["citations"].append(record)
        return record["id"]
    def fact(value, locator):
        return {"kind": "fact", "verification": "source_asserted", "value": value,
                "citations": [cite(locator, value)]} if value else None
    headings = [e for e in parser.entries if e["tag"] == "h1"]
    products = parser.products()
    matches = [(name, index, h) for name, index in products for h in headings if name == h["value"]]
    distinct = {m[0] for m in matches}
    supported = len(distinct) == 1 or (not products and parser.og_product and len(headings) == 1)
    if not supported:
        candidates = []
        for e in parser.entries:
            href = e["attrs"].get("href", "")
            if e["tag"] != "a" or not href: continue
            try:
                joined = urljoin(final, href)
                if not re.search(r"/(?:products?|items?|p)/[^/]+", urlsplit(joined).path): continue
                url = product_url(joined)
            except (ScanError, ValueError): continue
            if urlsplit(url).hostname != urlsplit(final).hostname or url in [c["url"] for c in candidates]: continue
            candidates.append({"kind": "inference", "url": url, "label": e["value"], "verified_product_page": False,
                               "citations": [cite(e["locator"] + "@href", e["value"] + " -> " + href)]})
            if len(candidates) == 5: break
        return {"snapshot": snapshot, "page_type": "not_supported_product", "facts": {}, "inferences": candidates,
                "missing": ["Choose a product page" if candidates else "Provide a public product page or its public description"],
                "preview": None}
    if matches:
        name, script_index, heading = matches[0]
        type_ref = cite("jsonld[" + str(script_index+1) + "].@type", "Product")
    else:
        heading = headings[0]; name = heading["value"]
        type_ref = cite("meta[property=og:type]", "product")
    descriptions = [e for e in parser.entries if e["tag"] == "p" and
                    (e["in_main"] or e["attrs"].get("itemprop") == "description") and len(e["value"]) >= 15]
    features = [e for e in parser.entries if e["tag"] == "li" and e["in_main"]][:8]
    facts = {"product_name": fact(name, heading["locator"]),
             "title": fact(page.title, "title"), "meta_description": fact(page.meta_description, 'meta[name=description]'),
             "description": fact(descriptions[0]["value"], descriptions[0]["locator"]) if descriptions else None,
             "features": [fact(e["value"], e["locator"]) for e in features]}
    known_use = [e for e in descriptions if e["attrs"].get("data-product-usage") is not None]
    facts["use"] = fact(known_use[0]["value"], known_use[0]["locator"]) if known_use else None
    missing = [key for key in ("title", "meta_description", "description", "use") if not facts[key]]
    missing += ["specifications", "price", "certifications", "performance", "comparisons", "guarantees"]
    result = {"snapshot": snapshot, "page_type": "product", "facts": facts,
              "inferences": [{"kind": "inference", "value": "Supported single product page",
                              "basis": "Visible name agrees with Product structured data" if matches else "Product Open Graph type and one visible main heading",
                              "citations": facts["product_name"]["citations"] + [type_ref]}],
              "missing": missing, "preview": None}
    if facts["description"]:
        result["preview"] = preview_for(result)
    return result

def preview_for(result):
    facts = result["facts"]
    name, description = facts["product_name"], facts["description"]
    if not name or not description: raise ScanError("missing_facts", "Product name and public description are required.")
    # Extractive deterministic output: no inference, schema claims, prices or promises added.
    meta = description["value"]
    if len(meta) > 160:
        meta = meta[:160].rsplit(" ", 1)[0] if " " in meta[:160] else meta[:160]
    pieces, refs = [description["value"][:1000]], list(description["citations"])
    for feature in facts["features"]:
        if feature["value"] not in pieces and feature["value"] not in description["value"] and sum(map(len,pieces)) + len(feature["value"]) < 1200:
            pieces.append(feature["value"]); refs += feature["citations"]
    full = name["value"] + ". " + " ".join(pieces)
    def field(original, suggested, sources, reason):
        return {"original": original["value"] if original else "", "suggested": suggested,
                "citations": list(dict.fromkeys(sources)), "reason": reason}
    return {"generation": "extractive_rules", "status": "awaiting_review", "published": False,
            "source_snapshot_id": result["snapshot"]["id"], "source_version": result["snapshot"]["version"],
            "fields": {
                "title": field(facts["title"], name["value"], name["citations"], "Make the existing product name the focused page title."),
                "meta_description": field(facts["meta_description"], meta, description["citations"], "Use a concise excerpt of the public product description."),
                "description": field(description, full, name["citations"] + refs, "Group the existing name, description and stated features without inventing claims.")},
            "pending_confirmation": ["Confirm source assertions and suitability before applying."] + result["missing"]}
