"""Real Supabase Edge Runtime user-worker import/gate smoke, synthetic CI only."""
import hashlib
import json
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import time
import uuid

root = Path(__file__).resolve().parents[3]
image = 'supabase/edge-runtime:v1.76.2'  # Official Supabase compose version.
name = 'growth-model-edge-' + uuid.uuid4().hex[:12]
# Exact code allowlist, never mount the checkout, home, Docker socket or env files.
files = [
    'supabase/functions/growth-model-trial/index.js',
    'supabase/functions/_shared/model-trial/handler.mjs',
    'supabase/functions/_shared/model-trial/adapters.mjs',
    'supabase/functions/_shared/model-trial/policy.mjs',
    'prototype/owner-workspace/goal-inference-contract.mjs',
    'apps/web/goal-intake.mjs',
]

def invoke(method):
    body = b'{}' if method == 'POST' else b''
    wire = (method + ' / HTTP/1.1\r\nHost: synthetic.local\r\nConnection: close\r\nContent-Length: ' + str(len(body)) + '\r\n\r\n').encode() + body
    command = 'exec 3<>/dev/tcp/127.0.0.1/9000; printf %s ' + shlex.quote(wire.decode()) + ' >&3; cat <&3'
    result = subprocess.run(['docker', 'exec', name, 'bash', '-c', command], capture_output=True, check=True, timeout=15)
    head, payload = result.stdout.split(b'\r\n\r\n', 1)
    lines = head.decode().split('\r\n')
    status = int(lines[0].split()[1])
    headers = {key.strip().lower(): value.strip() for line in lines[1:] for key, value in [line.split(':', 1)]}
    if headers.get('transfer-encoding', '').lower() == 'chunked':
        chunks = []
        while True:
            size, payload = payload.split(b'\r\n', 1)
            count = int(size.split(b';')[0], 16)
            if count == 0:
                break
            chunks.append(payload[:count])
            payload = payload[count + 2:]
        payload = b''.join(chunks)
    return status, headers, json.loads(payload)

with tempfile.TemporaryDirectory(prefix='growth-model-edge-') as directory:
    fixture = Path(directory)
    fixture.chmod(0o755)  # Only allowlisted public code; no secrets are copied.
    for relative in files:
        target = fixture / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / relative, target)
    (fixture / 'harness').mkdir()
    shutil.copyfile(Path(__file__).parent / 'edge_harness/index.ts', fixture / 'harness/index.ts')
    try:
        subprocess.run(['docker', 'run', '--detach', '--rm', '--network', 'none', '--name', name,
                        '--mount', f'type=bind,source={fixture},target=/fixture,readonly',
                        image, 'start', '--main-service', '/fixture/harness'],
                       check=True, stdout=subprocess.DEVNULL, timeout=120)
        config = json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]
        assert config['HostConfig']['NetworkMode'] == 'none' and not config['HostConfig']['PortBindings']
        assert all(not item.split('=', 1)[0].endswith(('KEY', 'SECRET', 'PASSWORD')) for item in config['Config']['Env'])
        until = time.monotonic() + 30
        while True:
            try:
                status, headers, body = invoke('POST')
                break
            except subprocess.CalledProcessError:
                if time.monotonic() >= until:
                    raise
                time.sleep(.2)
        assert status == 503 and body == {'code': 'TRIAL_NOT_READY'}, (status, body)
        assert headers['x-test-user-worker'] == 'loaded' and headers['cache-control'] == 'no-store'
        status_get, headers_get, body_get = invoke('GET')
        assert status_get == 405 and body_get == {'code': 'POST_REQUIRED'} and headers_get['x-test-user-worker'] == 'loaded'
        digest = json.loads(subprocess.check_output(['docker', 'image', 'inspect', image]))[0]['RepoDigests']
        print(json.dumps({'runtime_image': image, 'image_digest': digest, 'network': 'none',
                          'ports_published': False, 'worker_env': [], 'provider_key': False,
                          'user_worker_import': True, 'closed_gate_status': 503,
                          'closed_gate_code': 'TRIAL_NOT_READY', 'get_status': 405,
                          'copied_source_hashes': {file: hashlib.sha256((root / file).read_bytes()).hexdigest() for file in files},
                          'provider_or_supabase_calls': 0, 'scope': 'offline user worker; not deployed gateway/Auth acceptance'}))
    except Exception:
        # Container is synthetic and has no secrets; import errors are useful diagnostics.
        subprocess.run(['docker', 'logs', name], timeout=10)
        raise
    finally:
        subprocess.run(['docker', 'rm', '--force', name], capture_output=True, timeout=20)
