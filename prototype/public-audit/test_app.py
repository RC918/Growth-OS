import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request


class AppTests(unittest.TestCase):
    def test_ui_api_and_private_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            port = 18391
            base = f'http://127.0.0.1:{port}'
            env = {**os.environ, 'COMMERCE_GROWTH_PORT': str(port),
                   'COMMERCE_GROWTH_DB': os.path.join(tmp, 'test.sqlite3')}
            server = subprocess.Popen([sys.executable, 'app.py'], env=env,
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                for _ in range(40):
                    try:
                        with urllib.request.urlopen(base + '/') as response:
                            self.assertEqual(response.status, 200)
                            self.assertIn(b'Visitors arrive.', response.read())
                        break
                    except urllib.error.URLError:
                        time.sleep(.05)
                else:
                    self.fail('Local server did not start')

                def post(url):
                    payload = json.dumps({'url': url, 'business_model': 'trade'}).encode()
                    request = urllib.request.Request(base + '/api/v1/scans', data=payload,
                                                     headers={'Content-Type': 'application/json'})
                    return urllib.request.urlopen(request)

                with self.assertRaises(urllib.error.HTTPError) as error:
                    post('http://example.com')
                self.assertEqual(error.exception.code, 400)

                with post('https://127.0.0.1/private') as response:
                    job = json.load(response)
                    self.assertEqual(response.status, 202)
                for _ in range(40):
                    with urllib.request.urlopen(base + '/api/v1/scans/' + job['id']) as response:
                        result = json.load(response)
                    if result['status'] == 'failed':
                        break
                    time.sleep(.05)
                self.assertEqual(result['status'], 'failed')
                self.assertEqual(result['error']['code'], 'private_target')
            finally:
                server.terminate()
                server.wait(timeout=5)


if __name__ == '__main__':
    unittest.main()
