"""Synthetic explicit source contracts; no live site content or network."""
import json
import unittest
from product_source import build_snapshot
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
