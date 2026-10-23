"""Isolated synthetic source bytes through the unchanged real producer/API.

Not a model, hosted source or product implementation. Existing frozen producer,
scanner policy and report schema are not changed. The API network dependency is
injected only in this disposable localhost test process.
"""
import html
import json
from pathlib import Path
import signal
import sys
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'prototype/public-audit'))
import app
import product_api
from product_source import build_snapshot
from scanner import ScanError


def source(kind):
    name = 'Bolt A'
    description = 'Public steel bolt for workshop assembly.'
    features = ['Hexagonal head', 'Reusable package']
    title = 'Workshop - Bolt A | Shop'
    if kind == 'opposite':
        features.append('Not made of steel.')
    if kind == 'hidden-opposite':
        features.append('Not made of steel. ' + 'Full retained background context. ' * 50)
    if kind == 'hidden-unrelated-conflict':
        features.extend(['Waterproof. ' + 'Full retained context. ' * 60,
                         'Not waterproof. ' + 'Full retained context. ' * 60])
    if kind == 'undeclared-positive':
        title = 'Made of titanium.'
    if kind == 'long':
        description = 'Public steel bolt. ' + 'Workshop context. ' * 90 + 'Not made of steel.'
    if kind == 'unicode':
        name = '工具😀'
        description = name + '公開鋼製工具。' + '😀背景內容。' * 180
    if kind == 'word-boundary':
        description = 'Bolt AB is a steel bolt for workshop assembly.'
    prefix_cases = {
        'prefix-dotted-name': ('İstanbul Bolt', 'istanbul Bolt is made of steel.'),
        'prefix-dotless-name': ('ıstanbul Bolt', 'Istanbul Bolt is made of steel.'),
        'prefix-ascii-name': ('Istanbul Bolt', 'İstanbul Bolt is made of steel.'),
        'prefix-lower-name': ('istanbul Bolt', 'ıstanbul Bolt is made of steel.'),
        'prefix-word-boundary': ('İstanbul Bolt', 'istanbul Bolts are made of steel.'),
        'prefix-literal': ('İstanbul [Bolt]+', 'istanbul [Bolt]+ is made of steel.'),
        'prefix-combining': ('I\u0307stanbul Bolt', 'İstanbul Bolt is made of steel.'),
        'prefix-long': ('İstanbul Bolt', 'istanbul Bolt is made of steel. ' + '😀 context. ' * 120),
        'prefix-opposite': ('İstanbul Bolt', 'istanbul Bolt is made of steel.'),
    }
    if kind in prefix_cases:
        name, description = prefix_cases[kind]
    if kind == 'prefix-opposite':
        features.append('Not made of steel.')
    body = '<html><head><title>' + html.escape(title) + '</title><meta name="description" content="Old generic catalog">'
    body += '<script type="application/ld+json">' + json.dumps({'@type': 'Product', 'name': name}) + '</script></head><body>'
    body += '<main itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">' + html.escape(name) + '</h1>'
    body += '<p itemprop="description">' + html.escape(description) + '</p><ul>'
    body += ''.join('<li itemprop="additionalProperty">' + html.escape(value) + '</li>' for value in features)
    return (body + '</ul></main></body></html>').encode()


def fetch(url):
    parts = urlsplit(url)
    if parts.hostname != 'example.com':
        raise ScanError('private_target', 'Synthetic fixture boundary')
    if parts.path == '/robots.txt':
        return 200, {'content-type': 'text/plain'}, b'User-agent: *\nAllow: /\n'
    return 200, {'content-type': 'text/html'}, source(parts.path.lstrip('/'))


def report_for(url):
    report = build_snapshot(url, fetch)
    kind = urlsplit(url).path.lstrip('/')
    if kind == 'mapping':
        report['preview']['fields']['title']['suggested'] = 'Unbound rewrite from controlled test'
    if kind == 'missing-citation':
        report['preview']['fields']['description']['citations'] = ['unbound-citation']
    return report


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--report':
        print(json.dumps(report_for('https://example.com/' + sys.argv[2])))
    else:
        product_api.build_snapshot = report_for
        app.DB_PATH = Path(sys.argv[1])
        class Handler(app.Handler):
            def log_message(self, *_args):
                pass
        signal.signal(signal.SIGUSR1, lambda *_args: product_api.RECENT.clear())
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        print(server.server_address[1], flush=True)
        server.serve_forever()
