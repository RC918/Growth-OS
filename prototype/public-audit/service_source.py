"""Explicit service candidate layered on the frozen product source contract."""
from product_source import ProductParser, PageParser, clean, build_snapshot as build_product_snapshot
import json
import re
from urllib.parse import urlsplit


def static_subpage_preview(parser, snapshot, cite):
    """URL-bound WebPage metadata plus an unambiguous local header introduction.

    This is a static page introduction, never an assertion that the page is the
    site's SoftwareApplication or that the extracted prose is independently true.
    """
    pages, entities, visited, invalid = [], [], 0, False
    def walk(value, path, context=None, depth=0):
        nonlocal visited, invalid
        visited += 1
        if depth > 32 or visited > 5000:
            invalid = True
            return
        if isinstance(value, list):
            for index, child in enumerate(value):
                if visited > 5000: break
                walk(child, f'{path}[{index}]', context, depth + 1)
        elif isinstance(value, dict):
            context = value.get('@context', context)
            types = value.get('@type', [])
            types = [types] if isinstance(types, str) else types
            if isinstance(types, list):
                if 'WebPage' in types: pages.append((value, types, path, context))
                if any(t in ('Product', 'Service', 'SoftwareApplication') for t in types): entities.append((value, types))
            for key, child in value.items():
                if visited > 5000: break
                if isinstance(child, (dict, list)): walk(child, path + '.' + key, context, depth + 1)
    for index, raw in enumerate(parser.scripts[:20]):
        try: walk(json.loads(raw), f'jsonld[{index + 1}]')
        except (ValueError, RecursionError): invalid = True
    if not pages: return None
    refusal = {'snapshot': snapshot, 'page_type': 'not_supported_static_subpage', 'facts': {}, 'inferences': [],
               'missing': ['子頁 URL、metadata 與唯一介紹區塊必須明確一致；含糊或衝突時不產生草稿。'], 'preview': None}
    if invalid or len(parser.scripts) > 20 or len(pages) != 1: return refusal
    page, types, path, context = pages[0]
    final = snapshot['final_url']; parsed = urlsplit(final)
    root = parsed.scheme + '://' + parsed.netloc + '/'
    if types != ['WebPage'] or context not in ('https://schema.org', 'https://schema.org/', 'http://schema.org', 'http://schema.org/'): return refusal
    if parsed.path in ('', '/') or page.get('@id') != final or page.get('url') != final: return refusal
    if 'mainEntity' in page or 'mainEntityOfPage' in page: return refusal
    # Only a clearly separate site-root application may coexist; never borrow
    # its name, description, Offer or price for this subpage.
    for entity, entity_types in entities:
        if entity_types != ['SoftwareApplication'] or entity.get('url') != root or not str(entity.get('@id', '')).startswith(root + '#'):
            return refusal
    nodes = {n['locator']: n for n in parser.nodes}
    def safe(node):
        return not any(n['blocked'] or n['tag'] in ('form', 'input', 'textarea', 'select', 'button', 'template', 'script', 'a')
                       or n['scope'] is not None or 'itemprop' in n['attrs'] or 'inert' in n['attrs']
                       or n['attrs'].get('contenteditable', 'false').lower() != 'false'
                       or n['attrs'].get('role', '').lower() in ('button', 'textbox', 'combobox', 'link')
                       or re.search(r'(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|opacity\s*:\s*0(?:\D|$)|content-visibility\s*:\s*hidden)', n['attrs'].get('style', ''), re.I)
                       for n in [node] + [nodes[a] for a in node['ancestors']])
    def tag(name): return [n for n in parser.nodes if n['tag'] == name]
    heads, titles, mains, headings = tag('head'), tag('title'), tag('main'), tag('h1')
    canonicals = [n for n in tag('link') if 'canonical' in n['attrs'].get('rel', '').lower().split()]
    def metas(key):
        return [n for n in tag('meta') if key in (n['attrs'].get('name', '').lower(), n['attrs'].get('property', '').lower())]
    descriptions = metas('description')
    if any(len(group) != 1 for group in (heads, titles, mains, headings, canonicals, descriptions)): return refusal
    title, meta, canonical = titles[0], descriptions[0], canonicals[0]
    if any(n['parent'] != heads[0]['locator'] or not safe(n) for n in (title, meta, canonical)): return refusal
    name, description = clean(' '.join(title['text'])), clean(meta['attrs'].get('content'))
    if title['text_size'] >= 2000 or not 1 <= len(name) <= 200 or not 15 <= len(description) <= 500: return refusal
    if canonical['attrs'].get('href') != final or clean(page.get('name')) != name or clean(page.get('description')) != description: return refusal
    for key, expected in [('og:title', name), ('twitter:title', name), ('og:description', description), ('twitter:description', description), ('og:url', final), ('twitter:url', final)]:
        matches = metas(key)
        if len(matches) > 1 or any(n['parent'] != heads[0]['locator'] or not safe(n) or
                                  (n['attrs'].get('content') if key.endswith(':url') else clean(n['attrs'].get('content'))) != expected for n in matches): return refusal
    main, heading = mains[0], headings[0]
    headers = [n for n in tag('header') if n['parent'] == main['locator']]
    if len(headers) != 1 or not safe(main) or not safe(headers[0]) or heading['parent'] != headers[0]['locator']: return refusal
    children = [n for n in parser.nodes if n['parent'] == headers[0]['locator']]
    index = children.index(heading)
    following = children[index + 1:]
    if not following or following[0]['tag'] != 'p': return refusal
    intro = following[0]
    later_paragraphs = [n for n in parser.nodes[parser.nodes.index(heading) + 1:] if n['tag'] == 'p' and headers[0]['locator'] in n['ancestors']]
    if later_paragraphs != [intro]: return refusal
    for n in (heading, intro):
        descendants = [child for child in parser.nodes if n['locator'] in child['ancestors']]
        if not safe(n) or n.get('mixed_scope') or n['text_size'] >= 2000 or any(not safe(child) for child in descendants): return refusal
    heading_text, intro_text = heading.get('value', ''), intro.get('value', '')
    if not 1 <= len(heading_text) <= 200 or not 15 <= len(intro_text) <= 1000: return refusal
    binding = [cite(path + '.url', final), cite(canonical['locator'] + '@href', final)]
    def source(value, locations):
        return {'kind': 'fact', 'verification': 'source_asserted', 'value': value,
                'citations': [cite(location, value) for location in locations]}
    facts = {'page_name': source(name, [title['locator'], path + '.name']),
             'heading': source(heading_text, [heading['locator']]),
             'intro_description': source(intro_text, [intro['locator']]),
             'meta_description': source(description, [meta['locator'] + '@content', path + '.description'])}
    def field(key):
        f = facts[key]
        return {'original': f['value'], 'suggested': f['value'], 'citations': f['citations'],
                'change': 'unchanged', 'improvement_verified': False, 'reason': '保留原文；未產生改善。'}
    return {'snapshot': snapshot, 'page_type': 'static_subpage', 'facts': facts,
            'extraction': {'method': 'url_bound_webpage_header', 'limitations': [
                '僅靜態子頁來源綁定；不驗證外部 CSS 可見性、產品事實或商業／搜尋改善。']},
            'inferences': [{'kind': 'inference', 'value': '靜態子頁介紹',
                            'basis': '唯一精確 URL WebPage／canonical／metadata，與同 header 的唯一標題及緊接介紹段落', 'citations': binding}],
            'missing': [], 'preview': {'generation': 'extractive_rules', 'status': 'preview_only', 'published': False,
                'source_snapshot_id': snapshot['id'], 'source_version': snapshot['version'],
                'fields': {'title': field('page_name'), 'meta_description': field('meta_description'), 'description': field('intro_description')},
                'pending_confirmation': ['僅靜態子頁來源對照與草稿預覽；保留原文未產生改善；不支援確認、匯出保存或發布。']}}

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

def build_snapshot(raw_url, *args, **kwargs):
    result = build_product_snapshot(raw_url, *args, **kwargs)
    snapshot = dict(result['snapshot'], citations=[])
    parser = ProductParser(); parser.feed(snapshot['html']); parser.close()
    page = PageParser(); page.feed(snapshot['html'])
    def cite(locator, quote):
        ref = 's' + str(len(snapshot['citations']) + 1)
        snapshot['citations'].append({'id': ref, 'snapshot_id': snapshot['id'],
            'source_version': snapshot['version'], 'url': snapshot['final_url'], 'locator': locator, 'quote': quote})
        return ref
    def fact(value, locator):
        return {'kind': 'fact', 'verification': 'source_asserted', 'value': value,
                'citations': [cite(locator, value)]} if value else None
    service = service_preview(parser, page, snapshot, cite, fact)
    if service is not None and service['preview'] is not None: return service
    return static_subpage_preview(parser, snapshot, cite) or service or result
