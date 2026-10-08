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
        self.nodes = []

    def handle_starttag(self, tag, attrs):
        if self.counter >= 20000 or len(self.stack) >= 128:
            raise ScanError("page_complexity", "The public HTML exceeds parsing complexity limits; choose a simpler product page.")
        attrs = dict(attrs)
        blocked = any(e["blocked"] for e in self.stack) or tag in ("style", "noscript", "nav", "footer", "aside")
        blocked = blocked or "hidden" in attrs or attrs.get("aria-hidden") == "true"
        if blocked or "itemscope" in attrs:
            for ancestor in self.stack:
                if ancestor["tag"] in ("p", "li"):
                    ancestor["mixed_scope"] = True
        self.counter += 1
        entry = {"tag": tag, "attrs": attrs, "text": [], "text_size": 0, "blocked": blocked,
                 "locator": tag + "[" + str(self.counter) + "]"}
        parent_scope = next((e for e in reversed(self.stack) if "itemscope" in e["attrs"]), None)
        scope = entry if "itemscope" in attrs else parent_scope
        entry["scope"] = scope["locator"] if scope else None
        entry["scope_type"] = scope["attrs"].get("itemtype", "").split() if scope else []
        entry["ancestors"] = tuple(e["locator"] for e in self.stack)
        entry["parent"] = self.stack[-1]["locator"] if self.stack else None
        excluded_classes = {"related", "upsells", "cross-sells", "recommendations", "shipping", "shipping-info", "delivery"}
        entry["woo_excluded"] = blocked or bool(set(attrs.get("class", "").split()) & excluded_classes) or any(e["woo_excluded"] for e in self.stack)
        if entry["woo_excluded"]:
            for ancestor in self.stack:
                if ancestor["tag"] == "p": ancestor["mixed_woo"] = True
        self.nodes.append(entry)
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
                if entry["tag"] in ("h1", "p", "li", "a") or "name" in entry["attrs"].get("itemprop", "").split():
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

def woocommerce_context(parser, headings):
    """Narrow visible WooCommerce ownership, never a main/article text fallback."""
    def classes(node): return set(node["attrs"].get("class", "").split())
    mains = {n["locator"] for n in parser.nodes if n["tag"] == "main" and n["attrs"].get("id") == "main"}
    roots = [n for n in parser.nodes if not n["woo_excluded"] and n["tag"] == "div"
             and {"product", "type-product"} <= classes(n)
             and re.fullmatch(r"product-\d+", n["attrs"].get("id", ""))
             and mains.intersection(n["ancestors"])]
    if len(roots) != 1 or len(headings) != 1: return None
    root = roots[0]
    summaries = [n for n in parser.nodes if not n["woo_excluded"] and n["tag"] == "div"
                 and n["parent"] == root["locator"] and {"summary", "entry-summary"} <= classes(n)]
    if len(summaries) != 1: return None
    summary = summaries[0]; heading = headings[0]
    if heading["parent"] != summary["locator"] or not {"product_title", "entry-title"} <= classes(heading): return None
    short = [n for n in parser.nodes if not n["woo_excluded"] and n["tag"] == "div"
             and n["parent"] == summary["locator"] and "woocommerce-product-details__short-description" in classes(n)]
    tabs = [n for n in parser.nodes if not n["woo_excluded"] and n["tag"] == "div"
            and n["attrs"].get("id") == "tab-description" and root["locator"] in n["ancestors"]]
    descriptions = []
    short_value_present = False
    invalid = len(short) > 1 or len(tabs) > 1
    if not invalid:
        for region in short + tabs:
            paragraphs = [e for e in parser.entries if e["tag"] == "p" and region["locator"] in e["ancestors"]]
            # Do not salvage part of a marked description with mixed ownership.
            if not paragraphs: continue
            if any(e["woo_excluded"] or e["parent"] != region["locator"] or e["scope"] != heading["scope"] or e.get("mixed_scope") or e.get("mixed_woo") for e in paragraphs):
                invalid = True; descriptions = []; break
            text = clean(" ".join(e["value"] for e in paragraphs))
            if not 15 <= len(text) <= 2000:
                invalid = True; descriptions = []; break
            if region in short: short_value_present = True
            descriptions.append({"value": text, "locator": region["locator"], "attrs": {}})
    values = {e["value"] for e in descriptions}
    conflict = invalid or len(values) > 1
    if conflict or not short_value_present: descriptions = []
    return {"root": root, "heading": heading, "descriptions": descriptions, "description_values": values, "description_conflict": conflict}

def product_url(raw):
    value = normalize_url(raw)
    if urlsplit(raw.strip()).query:
        raise ScanError("unsupported_query", "Use the canonical public product URL without query parameters.")
    return value

def service_preview(parser, page, snapshot, cite, fact):
    """Static explicit ownership only; never infer a service from arbitrary prose."""
    entities, invalid, visited = [], False, 0
    def walk(value, depth=0, path='', context=None):
        nonlocal visited, invalid
        visited += 1
        if depth > 32 or visited > 5000:
            invalid = True
            return
        if isinstance(value, list):
            for index, child in enumerate(value): walk(child, depth + 1, f'{path}[{index}]', context)
        elif isinstance(value, dict):
            context = value.get('@context', context)
            types = value.get('@type', [])
            types = [types] if isinstance(types, str) else types
            if isinstance(types, list) and any(t in ('Service', 'SoftwareApplication', 'Product') for t in types):
                entities.append((value, types, path, context))
            for key, child in value.items():
                if isinstance(child, (dict, list)): walk(child, depth + 1, path + '.' + key, context)
    for index, raw in enumerate(parser.scripts[:20]):
        try: walk(json.loads(raw), path=f'jsonld[{index + 1}]')
        except (ValueError, RecursionError): invalid = True
    if not any('Service' in t or 'SoftwareApplication' in t for _, t, _, _ in entities): return None
    refusal = {'snapshot': snapshot, 'page_type': 'not_supported_service', 'facts': {}, 'inferences': [],
               'missing': ['服務／工具的結構資料與可見名稱、描述必須唯一且一致；含糊或衝突時不產生草稿。'], 'preview': None}
    if invalid or len(parser.scripts) > 20 or len(entities) != 1: return refusal
    entity, types, json_path, context = entities[0]
    if context not in ('https://schema.org', 'https://schema.org/', 'http://schema.org', 'http://schema.org/'): return refusal
    if len(types) != 1 or types[0] not in ('Service', 'SoftwareApplication'): return refusal
    kind = types[0]
    name, description = clean(entity.get('name')), clean(entity.get('description'))
    if not 1 <= len(name) <= 200 or not 15 <= len(description) <= 1000: return refusal
    nodes = {n['locator']: n for n in parser.nodes}
    def visible(node):
        chain = [node] + [nodes[a] for a in node['ancestors']]
        # Static parsing cannot prove CSS-computed visibility. Reject explicit
        # hiding and interactive content; no form values or script execution.
        return not any(n['blocked'] or n['tag'] in ('form', 'input', 'textarea', 'select', 'button', 'template')
                       or re.search(r'(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|opacity\s*:\s*0(?:\D|$)|content-visibility\s*:\s*hidden)', n['attrs'].get('style', ''), re.I)
                       for n in chain)
    headings = [e for e in parser.entries if e['tag'] == 'h1' and visible(e)]
    scopes = [n for n in parser.nodes if 'itemscope' in n['attrs'] and
              n['attrs'].get('itemtype') in ('https://schema.org/' + kind, 'http://schema.org/' + kind)]
    if len(headings) != 1 or len(scopes) != 1: return refusal
    heading, scope = headings[0], scopes[0]
    if not visible(scope) or not any(nodes[a]['tag'] == 'main' for a in (scope['locator'], *scope['ancestors'])): return refusal
    def properties(prop):
        return [n for n in parser.nodes if n['scope'] == scope['locator'] and prop in n['attrs'].get('itemprop', '').split()]
    names, descriptions = properties('name'), properties('description')
    if len(names) != 1 or names[0] is not heading or heading['value'] != name or heading['text_size'] >= 2000: return refusal
    if len(descriptions) != 1: return refusal
    desc = descriptions[0]
    if desc['tag'] != 'p' or not visible(desc) or desc.get('mixed_scope') or desc.get('value') != description or desc['text_size'] >= 2000: return refusal
    if any(n['tag'] in ('form', 'input', 'textarea', 'select', 'button', 'template', 'script') and
           (heading['locator'] in n['ancestors'] or desc['locator'] in n['ancestors']) for n in parser.nodes): return refusal
    type_ref = cite(json_path + '.@type', kind)
    name_refs = [cite(heading['locator'], name), cite(json_path + '.name', name)]
    description_refs = [cite(desc['locator'], description), cite(json_path + '.description', description)]
    facts = {'entity_name': {'kind': 'fact', 'verification': 'source_asserted', 'value': name, 'citations': name_refs},
             'description': {'kind': 'fact', 'verification': 'source_asserted', 'value': description, 'citations': description_refs},
             'title': fact(page.title, 'title'), 'meta_description': fact(page.meta_description, 'meta[name=description]')}
    def field(original, suggested, refs):
        same = original == suggested
        return {'original': original, 'suggested': suggested, 'citations': refs,
                'change': 'unchanged' if same else 'source_reformatted', 'improvement_verified': False,
                'reason': '保留原文；未產生改善。' if same else '依已引用來源整理文字；有文字差異，不代表已改善搜尋效果。'}
    meta = description[:160]
    if len(description) > 160 and ' ' in meta: meta = meta.rsplit(' ', 1)[0]
    return {'snapshot': snapshot, 'page_type': 'service' if kind == 'Service' else 'software_application',
            'facts': facts, 'extraction': {'method': 'explicit_service_jsonld_microdata', 'limitations': [
                '僅靜態 HTML 的明確名稱／描述一致性；不驗證外部 CSS、JavaScript 或來源宣稱真實性。']},
            'inferences': [{'kind': 'inference', 'value': kind, 'basis': '單一 JSON-LD 與同型別可見 scope 的名稱／描述一致', 'citations': [type_ref, *name_refs, *description_refs]}],
            'missing': [], 'preview': {'generation': 'extractive_rules', 'status': 'preview_only', 'published': False,
                'source_snapshot_id': snapshot['id'], 'source_version': snapshot['version'],
                'fields': {'title': field(page.title, name, name_refs), 'meta_description': field(page.meta_description, meta, description_refs),
                           'description': field(description, description, description_refs)},
                'pending_confirmation': ['僅來源對照與草稿預覽；未獨立驗真、未證明改善；不支援確認、匯出保存或發布。']}}

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
    service = service_preview(parser, page, snapshot, cite, fact)
    if service is not None: return service
    headings = [e for e in parser.entries if e["tag"] == "h1"]
    products = parser.products()
    matches = [(name, index, h) for name, index in products for h in headings if name == h["value"]]
    distinct = {m[0] for m in matches}
    woo = woocommerce_context(parser, headings)
    if woo and products and {name for name, _ in products} != {headings[0]["value"]}: woo = None
    supported = bool(woo) or len(headings) == 1 and (len(distinct) == 1 or (not products and parser.og_product))
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
    if woo:
        heading = woo["heading"]; name = heading["value"]
        type_ref = cite(woo["root"]["locator"] + "@class", woo["root"]["attrs"]["class"])
    elif matches:
        name, script_index, heading = matches[0]
        type_ref = cite("jsonld[" + str(script_index+1) + "].@type", "Product")
    else:
        heading = headings[0]; name = heading["value"]
        type_ref = cite("meta[property=og:type]", "product")
    # A page-wide main/article is not product ownership. Only explicit visible
    # microdata properties in the heading's own Product scope can supply facts.
    product_scope = heading["scope"] if any(
        t in ("https://schema.org/Product", "http://schema.org/Product") for t in heading["scope_type"]) else None
    scoped_names = {e["value"] for e in parser.entries if product_scope is not None and e["scope"] == product_scope and "name" in e["attrs"].get("itemprop", "").split()}
    name_conflict = bool(scoped_names - {name})
    scope = product_scope if "name" in heading["attrs"].get("itemprop", "").split() and scoped_names == {name} else None
    def owned(entry, prop):
        return scope is not None and not entry.get("mixed_scope") and (not woo or not (entry["woo_excluded"] or entry.get("mixed_woo"))) and entry["scope"] == scope and prop in entry["attrs"].get("itemprop", "").split()
    descriptions = [e for e in parser.entries if e["tag"] == "p" and owned(e, "description") and len(e["value"]) >= 15]
    # Conflicting descriptions cannot be resolved by taking the first paragraph.
    micro_values = {e["value"] for e in descriptions}
    micro_conflict = len(micro_values) > 1
    if len(micro_values) != 1:
        descriptions = []
    features = [e for e in parser.entries if e["tag"] == "li" and owned(e, "additionalProperty")][:8]
    method = "explicit_product_microdata" if scope else "unresolved_product_scope"
    description_scope = scope
    conflict = name_conflict or micro_conflict
    if woo:
        conflict = conflict or woo["description_conflict"] or bool(micro_values and woo["description_values"] and micro_values != woo["description_values"])
        # Preserve valid explicit properties. Woo may fill only an absent
        # description, never erase microdata features or override disagreement.
        if not descriptions and not conflict and woo["descriptions"]:
            descriptions = woo["descriptions"]
            description_scope = woo["root"]["locator"]
            method = "woocommerce_single_product"
    if conflict:
        descriptions, features = [], []
        method = "conflicting_product_evidence"
    facts = {"product_name": fact(name, heading["locator"]),
             "title": fact(page.title, "title"), "meta_description": fact(page.meta_description, 'meta[name=description]'),
             "description": fact(descriptions[0]["value"], descriptions[0]["locator"]) if descriptions else None,
             "features": [fact(e["value"], e["locator"]) for e in features]}
    if facts["description"]:
        facts["description"]["citations"] += [cite(e["locator"], e["value"]) for e in descriptions[1:]]
    for item in [facts["description"], *facts["features"]]:
        if item:
            item["product_scope"] = {"locator": description_scope if item is facts["description"] else scope, "name_locator": heading["locator"], "product_name": name}
            item["citations"] += facts["product_name"]["citations"]
    known_use = [e for e in descriptions if e["attrs"].get("data-product-usage") is not None]
    facts["use"] = fact(known_use[0]["value"], known_use[0]["locator"]) if known_use else None
    missing = [key for key in ("title", "meta_description", "description", "use") if not facts[key]]
    if conflict: missing.append("Conflicting product identity or description evidence; resolve the source before generating a preview.")
    if not features: missing.append("features")
    if not descriptions: missing.append("No unambiguous public description bound to the target product; provide a product-scoped source.")
    missing += ["specifications", "price", "certifications", "performance", "comparisons", "guarantees"]
    result = {"snapshot": snapshot, "page_type": "product", "facts": facts,
              "extraction": {"method": method, "limitations": ["Source assertions only; no independent verification.", "WooCommerce support requires one main#main product-N container, direct summary/title/short-description, and consistent optional description tab; arbitrary layouts and lists are not supported."]},
              "inferences": [{"kind": "inference", "value": "Supported single product page",
                              "basis": "Unique WooCommerce product container and summary/title" if woo else "Visible name agrees with Product structured data" if matches else "Product Open Graph type and one visible main heading",
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
    # Keep the source wording when it already opens with the whole name.
    # A name prefix inside a longer word/SKU (e.g. Bolt AB) is not a match.
    already_named = re.match(re.escape(name["value"]) + r"(?=$|\W)", description["value"], re.IGNORECASE)
    full = ("" if already_named else name["value"] + ". ") + " ".join(pieces)
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
