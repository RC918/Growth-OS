"""Synthetic explicit source contracts; no live site content or network."""
import json
import unittest
from service_source import build_snapshot
from test_product_source import fixture, PRODUCT


def service_html(kind='Service', title='Workshop help | Example', meta='Old introduction'):
    name, description = 'Workshop help', 'Plan workshop tasks with a checklist of supplied requirements.'
    data = json.dumps({'@context': 'https://schema.org', '@type': kind, 'name': name, 'description': description})
    return (f'<html><head><title>{title}</title><meta name="description" content="{meta}">'
            f'<script type="application/ld+json">{data}</script></head><body><main>'
            f'<article itemscope itemtype="https://schema.org/{kind}"><h1 itemprop="name">{name}</h1>'
            f'<p itemprop="description">{description}</p>'
            '<form><label>Business name<input name="business" value="DO NOT EXTRACT"></label></form>'
            '</article></main></body></html>').encode()


def report(body):
    return build_snapshot('https://example.com/tools/help', lambda url: fixture(url) if url.endswith('robots.txt')
                          else (200, {'content-type': 'text/html'}, body))


def subpage_html(url='https://example.com/tools/help'):
    """Invented content with the observed semantic structure; not site HTML."""
    from urllib.parse import urlsplit
    from html import escape
    root = urlsplit(url).scheme + '://' + urlsplit(url).netloc + '/'
    title = 'Workshop checklist | Sample'
    meta = 'A public checklist page explains how to prepare a workshop plan.'
    graph = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Organization', 'name': 'Sample company'},
        {'@type': 'SoftwareApplication', '@id': root + '#software', 'url': root,
         'name': 'Entire suite', 'description': 'GLOBAL PRODUCT TEXT', 'offers': {'@type': 'Offer', 'price': '999'}},
        {'@type': 'WebPage', '@id': url, 'url': url, 'name': title, 'description': meta}]}
    return (f'<html><head><title>{title}</title><meta name="description" content="{meta}">'
            f'<link rel="canonical" href="{escape(url)}"><meta property="og:url" content="{escape(url)}">'
            f'<meta property="og:title" content="{title}"><meta name="twitter:title" content="{title}">'
            f'<meta property="og:description" content="{meta}"><meta name="twitter:description" content="{meta}">'
            f'<script type="application/ld+json">{json.dumps(graph)}</script></head><body><main id="content">'
            '<header><p>Available without signup</p><h1>Ready for your next workshop?</h1>'
            '<p>Describe the workshop goals. This page explains the steps to prepare a useful checklist.</p></header>'
            '<form><label>Company<input name="company" value="DO NOT EXTRACT"></label></form>'
            '<section aria-labelledby="details"><h2 id="details">How it works</h2><p>SUPPLEMENT ONLY</p></section>'
            '</main></body></html>').encode()


def change_graph(body, change):
    start, end = body.index(b'{'), body.index(b'</script>')
    graph = json.loads(body[start:end]); change(graph)
    return body[:start] + json.dumps(graph).encode() + body[end:]


class StaticSubpage(unittest.TestCase):
    def test_url_bound_introduction_preserves_distinct_fields_and_sources(self):
        r = report(subpage_html())
        self.assertEqual(r['page_type'], 'static_subpage')
        self.assertEqual(set(r['facts']), {'page_name', 'heading', 'intro_description', 'meta_description'})
        self.assertNotEqual(r['facts']['page_name']['value'], r['facts']['heading']['value'])
        self.assertNotEqual(r['facts']['intro_description']['value'], r['facts']['meta_description']['value'])
        refs = {c['id']: c for c in r['snapshot']['citations']}
        for key, field in r['preview']['fields'].items():
            self.assertEqual(field['original'], field['suggested'])
            self.assertEqual(field['change'], 'unchanged'); self.assertFalse(field['improvement_verified'])
            for ref in field['citations']:
                self.assertEqual(refs[ref]['quote'], field['original'])
                self.assertEqual(refs[ref]['source_version'], r['snapshot']['version'])
        payload = json.dumps({k: r[k] for k in ('facts', 'inferences', 'preview')})
        for excluded in ('GLOBAL PRODUCT TEXT', 'Entire suite', '999', 'Available without signup', 'DO NOT EXTRACT', 'SUPPLEMENT ONLY'):
            self.assertNotIn(excluded, payload)
        self.assertFalse(r['preview']['published'])
        # No hardcoded hostname, id, class, paragraph index or H1/name equality.
        other = 'https://another.example/guide/start'
        body = subpage_html(other).replace(b'id="content"', b'id="arbitrary" class="unrelated"').replace(b'<header>', b'<header>\n')
        r2 = build_snapshot(other, lambda u: fixture(u) if u.endswith('robots.txt') else (200, {'content-type': 'text/html'}, body))
        self.assertEqual(r2['page_type'], 'static_subpage')

    def test_conflicting_or_unowned_subpages_refused(self):
        base = subpage_html()
        cases = {
            'no canonical': base.replace(b'rel="canonical"', b'rel="alternate"'),
            'duplicate canonical': base.replace(b'</head>', b'<link rel="canonical" href="https://example.com/tools/help"></head>'),
            'wrong canonical': base.replace(b'href="https://example.com/tools/help"', b'href="https://example.com/other"'),
            'duplicate title': base.replace(b'</head>', b'<title>Workshop checklist | Sample</title></head>'),
            'duplicate meta': base.replace(b'</head>', b'<meta name="description" content="Other description"></head>'),
            'OG conflict': base.replace(b'property="og:title" content="Workshop', b'property="og:title" content="Different'),
            'Twitter conflict': base.replace(b'name="twitter:description" content="A public', b'name="twitter:description" content="Another'),
            'OG URL conflict': base.replace(b'property="og:url" content="https://example.com/tools/help"', b'property="og:url" content="https://example.com/other"'),
            'duplicate main': base.replace(b'</body>', b'<main></main></body>'),
            'duplicate heading': base.replace(b'</main>', b'<h1 hidden>Other</h1></main>'),
            'duplicate header': base.replace(b'</main>', b'<header></header></main>'),
            'nested header': base.replace(b'<header>', b'<div><header>').replace(b'</header>', b'</header></div>'),
            'not adjacent': base.replace(b'</h1>', b'</h1><div>Unbound content</div>'),
            'missing intro': base.replace(b'<p>Describe', b'<div>Describe').replace(b'checklist.</p>', b'checklist.</div>'),
            'competing intro': base.replace(b'</header>', b'<p>Another competing introductory paragraph.</p></header>'),
            'nested competing intro': base.replace(b'</header>', b'<div><p>Another competing introductory paragraph.</p></div></header>'),
            'hidden intro': base.replace(b'<p>Describe', b'<p hidden>Describe'),
            'hidden descendant': base.replace(b'workshop goals.', b'workshop <span hidden>other</span>goals.'),
            'inline hidden': base.replace(b'<header>', b'<header style="display:none">'),
            'interactive heading': base.replace(b'<h1>', b'<h1 contenteditable="true">'),
            'interactive intro': base.replace(b'<p>Describe', b'<p>Describe<input value="secret">'),
            'nested scope': base.replace(b'<p>Describe', b'<p>Describe<span itemscope>mixed</span>'),
            'scoped main': base.replace(b'<main id=', b'<main itemscope id='),
            'template intro': base.replace(b'<header>', b'<template><header>').replace(b'</header>', b'</header></template>'),
            'form intro': base.replace(b'<header>', b'<form><header>').replace(b'</header>', b'</header></form>'),
            'truncated intro': base.replace(b'checklist.</p>', b'checklist.' + b' ' * 2100 + b'Unseen claim.</p>'),
            'bad JSON': base.replace(b'</head>', b'<script type="application/ld+json">{broken</script></head>'),
            'too many JSON scripts': base.replace(b'</head>', b'<script type="application/ld+json">{}</script>' * 20 + b'</head>'),
        }
        mutations = {
            'WebPage URL conflict': lambda g: g['@graph'][2].update(url='https://example.com/other'),
            'WebPage ID conflict': lambda g: g['@graph'][2].update({'@id': 'https://example.com/tools/help#page'}),
            'name conflict': lambda g: g['@graph'][2].update(name='Entire suite'),
            'description conflict': lambda g: g['@graph'][2].update(description='GLOBAL PRODUCT TEXT'),
            'wrong vocabulary': lambda g: g.update({'@context': 'https://example.com/schema'}),
            'dual type': lambda g: g['@graph'][2].update({'@type': ['WebPage', 'SoftwareApplication']}),
            'competing WebPage': lambda g: g['@graph'].append(dict(g['@graph'][2])),
            'foreign WebPage': lambda g: g['@graph'].append({'@type': 'WebPage', 'url': 'https://example.com/other'}),
            'mainEntity': lambda g: g['@graph'][2].update(mainEntity={'@id': 'https://example.com/#software'}),
            'local software': lambda g: g['@graph'][1].update(url='https://example.com/tools/help'),
            'Product mixing': lambda g: g['@graph'].append({'@type': 'Product', 'name': 'Other'}),
            'deep graph': lambda g: g.update(extra=json.loads('[' * 33 + '{}' + ']' * 33)),
            'node budget': lambda g: g.update(extra=[{}] * 5001),
        }
        cases.update({label: change_graph(base, fn) for label, fn in mutations.items()})
        for label, body in cases.items():
            with self.subTest(case=label):
                r = report(body)
                self.assertIsNone(r['preview']); self.assertEqual(r['facts'], {})
                self.assertEqual(r['page_type'], 'not_supported_static_subpage')

    def test_no_webpage_binding_is_not_promoted_and_service_keeps_contract(self):
        body = change_graph(subpage_html(), lambda g: g['@graph'].pop())
        self.assertIsNone(report(body)['preview'])
        combined = service_html().replace(b'</head>', b'<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"Unrelated"}</script></head>')
        self.assertEqual(report(combined)['page_type'], 'service')


class ServiceSource(unittest.TestCase):
    def test_explicit_types_and_traceable_unchanged_description(self):
        for kind, expected in [('Service', 'service'), ('SoftwareApplication', 'software_application')]:
            with self.subTest(kind=kind):
                r = report(service_html(kind))
                self.assertEqual(r['page_type'], expected)
                self.assertNotIn('product_name', r['facts'])
                self.assertEqual(r['preview']['status'], 'preview_only')
                self.assertEqual(r['preview']['generation'], 'extractive_rules')
                refs = {c['id']: c for c in r['snapshot']['citations']}
                for key, f in r['preview']['fields'].items():
                    self.assertFalse(f['improvement_verified'])
                    self.assertTrue(f['citations'])
                    for ref in f['citations']:
                        self.assertEqual(refs[ref]['source_version'], r['snapshot']['version'])
                        self.assertEqual(refs[ref]['snapshot_id'], r['snapshot']['id'])
                    self.assertNotIn('DO NOT EXTRACT', f['suggested'])
                self.assertEqual(r['preview']['fields']['description']['change'], 'unchanged')
                self.assertEqual(r['preview']['fields']['title']['change'], 'source_reformatted')
                self.assertIn('未產生改善', r['preview']['fields']['description']['reason'])

    def test_preserved_fields_are_not_improvements(self):
        description = 'Plan workshop tasks with a checklist of supplied requirements.'
        r = report(service_html(title='Workshop help', meta=description))
        self.assertTrue(all(f['change'] == 'unchanged' for f in r['preview']['fields'].values()))

    def test_ambiguous_hidden_mismatched_or_form_sources_refused(self):
        base = service_html()
        cases = {
            'wrong JSON-LD vocabulary': base.replace(b'"@context": "https://schema.org"', b'"@context": "https://example.com/other"'),
            'truncated visible text': base.replace(b'</p>', b' ' * 2100 + b'An omitted conflicting claim.</p>'),
            'two entities': base.replace(b'</head>', b'<script type="application/ld+json">{"@type":"SoftwareApplication","name":"Other"}</script></head>'),
            'dual type': base.replace(b'"@type": "Service"', b'"@type": ["Service","SoftwareApplication"]'),
            'product mixing': base.replace(b'</head>', b'<script type="application/ld+json">{"@type":"Product","name":"Other"}</script></head>'),
            'name mismatch': base.replace(b'<h1 itemprop="name">Workshop help', b'<h1 itemprop="name">Other'),
            'description mismatch': base.replace(b'<p itemprop="description">Plan', b'<p itemprop="description">Never'),
            'missing binding': base.replace(b'itemprop="description"', b'data-unowned="description"'),
            'wrong scope': base.replace(b'itemtype="https://schema.org/Service"', b'itemtype="https://schema.org/Product"'),
            'duplicate heading': base.replace(b'</main>', b'<h1>Other</h1></main>'),
            'duplicate description': base.replace(b'</article>', b'<p itemprop="description">Other description must not be merged.</p></article>'),
            'hidden description': base.replace(b'<p itemprop', b'<p hidden itemprop'),
            'inline hidden': base.replace(b'<p itemprop', b'<p style="display:none" itemprop'),
            'template': base.replace(b'<article ', b'<template><article ').replace(b'</article>', b'</article></template>'),
            'form ownership': base.replace(b'<article ', b'<form><article ').replace(b'</article>', b'</article></form>'),
            'nested form text': base.replace(b'<p itemprop="description">Plan workshop tasks', b'<p itemprop="description">Plan <input value="secret">workshop tasks'),
            'nested scope': base.replace(b'<p itemprop="description">', b'<p itemprop="description"><span itemscope>').replace(b'</p>', b'</span></p>'),
            'malformed metadata': base.replace(b'</head>', b'<script type="application/ld+json">{broken</script></head>'),
            'unscoped paragraph': base.replace(b'<p itemprop="description">', b'<p>'),
        }
        for label, body in cases.items():
            with self.subTest(case=label):
                r = report(body)
                self.assertEqual(r['page_type'], 'not_supported_service')
                self.assertIsNone(r['preview'])
                self.assertEqual(r['facts'], {})

    def test_graph_supported_but_duplicate_identity_refused(self):
        body = service_html()
        start, end = body.index(b'{'), body.index(b'</script>')
        entity = json.loads(body[start:end])
        graph = {'@graph': [{'@type': 'Organization', 'name': 'Example'}, entity]}
        valid = body[:start] + json.dumps(graph).encode() + body[end:]
        self.assertEqual(report(valid)['page_type'], 'service')
        graph['@graph'].append(entity)
        self.assertIsNone(report(body[:start] + json.dumps(graph).encode() + body[end:])['preview'])

    def test_generic_page_not_promoted_and_product_unchanged(self):
        r = report(b'<main><h1>A useful tool</h1><p>A paragraph and a form are not sufficient evidence.</p><form></form></main>')
        self.assertIsNone(r['preview'])
        self.assertEqual(report(PRODUCT)['page_type'], 'product')

if __name__ == '__main__': unittest.main()
