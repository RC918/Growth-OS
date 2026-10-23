"""Exercise only declared function files in a clean Python process, no network."""
import glob
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


def expand(pattern):
    match = re.search(r"\{([^{}]+)\}", pattern)
    if match:
        return [path for name in match[1].split(",")
                for path in expand(pattern[:match.start()] + name + pattern[match.end():])]
    return [Path(path) for path in glob.glob(str(ROOT / pattern))]


SMOKE = r'''
import importlib.util, io, json, sys
from pathlib import Path
root = Path(sys.argv[1])
def no_network(event, args):
    if event.startswith('socket.'):
        raise AssertionError('Bundle check must never make an external request')
sys.addaudithook(no_network)
spec = importlib.util.spec_from_file_location('packaged_endpoint', root / sys.argv[2])
endpoint = importlib.util.module_from_spec(spec)
spec.loader.exec_module(endpoint)
source = root / 'prototype' / 'public-audit'
# Include optional branches as well: they must not silently degrade because
# a developer checkout happened to contain files missing from the bundle.
import first_result_api, service_api, service_source, declared_product
for module in (first_result_api, service_api, service_source, declared_product):
    assert Path(module.__file__).resolve().is_relative_to(source)
handler = object.__new__(endpoint.handler)
statuses = []
handler.send_response = statuses.append
handler.send_header = lambda *args: None
handler.end_headers = lambda: None
handler.wfile = io.BytesIO()
handler.do_GET()
assert statuses == [200]
assert json.loads(handler.wfile.getvalue())['published'] is False
handler.headers = {'Content-Type': 'text/plain'}
handler.wfile = io.BytesIO()
handler.do_POST()
assert statuses[-1] == 415
assert json.loads(handler.wfile.getvalue())['code'] == 'invalid_request'
html = b'<html><head><title>Bolt A</title><script type="application/ld+json">{"@type":"Product","name":"Bolt A"}</script></head><body><main itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">Bolt A</h1><p itemprop="description">Public steel bolt for workshop assembly.</p></main></body></html>'
def fetch(url):
    if url.endswith('/robots.txt'):
        return 200, {'content-type': 'text/plain'}, b'User-agent: *\nAllow: /\n'
    return 200, {'content-type': 'text/html'}, html
report = first_result_api.build_snapshot('https://example.com/products/bolt', fetch)
assert report['facts']['product_name']['value'] == 'Bolt A'
assert report['preview']['generation'] == 'extractive_rules'
assert report['preview']['published'] is False
print('packaged handlers and source extraction PASS; network calls=0')
'''


class SourceBundleTests(unittest.TestCase):
    def materialize(self, directory, entry, omit=None):
        config = json.loads((ROOT / 'vercel.json').read_text())
        included = expand(config['functions'][entry]['includeFiles'])
        self.assertTrue(included, 'includeFiles must match source dependencies')
        for path in [ROOT / entry, *included]:
            if path.name == omit:
                continue
            target = directory / path.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)

    def run_bundle(self, directory, entry):
        return subprocess.run([sys.executable, '-I', '-B', '-c', SMOKE,
                               str(directory), entry], cwd=directory,
                              capture_output=True, text=True, timeout=15)

    def test_both_declared_bundles_execute_without_checkout_or_network(self):
        for entry in ('api/product-source.py', 'api/service-source.py'):
            with self.subTest(entry=entry), tempfile.TemporaryDirectory() as tmp:
                directory = Path(tmp)
                self.materialize(directory, entry)
                result = self.run_bundle(directory, entry)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_missing_dependency_fails_instead_of_importing_from_checkout(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            self.materialize(directory, 'api/product-source.py', omit='error_classify.py')
            result = self.run_bundle(directory, 'api/product-source.py')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("No module named 'error_classify'", result.stderr)


if __name__ == '__main__':
    unittest.main()
