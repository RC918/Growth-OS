"""Real Supabase Edge Runtime user-worker import/gate smoke, synthetic CI only."""
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import sys
import uuid

from edge_runtime_support import Evidence, wait_for_startup

root = Path(__file__).resolve().parents[3]
image = 'supabase/edge-runtime:v1.76.2@sha256:edd22bef4477b900d5c300e287ce9b18bff9b81a0291bee14ee0b7c7b71a2899'  # Official Supabase compose version.
name = 'growth-model-edge-' + uuid.uuid4().hex[:12]
# Exact code allowlist, never mount the checkout, home, Docker socket or env files.
files = [
    'supabase/functions/growth-model-trial/index.js',
    'supabase/functions/_shared/model-trial/handler.mjs',
    'supabase/functions/_shared/model-trial/adapters.mjs',
    'supabase/functions/_shared/model-trial/policy.mjs',
    'supabase/functions/_shared/model-trial/hash.mjs',
    'prototype/owner-workspace/goal-inference-core.mjs',
    'apps/web/goal-intake.mjs',
]

evidence = Evidence(os.environ.get('EDGE_RUNTIME_EVIDENCE_DIR') or tempfile.mkdtemp(prefix='growth-edge-evidence-'))
print('Edge Runtime evidence: ' + str(evidence.directory), flush=True)


def invoke(method, timeout=15):
    body = b'{}' if method == 'POST' else b''
    wire = (method + ' / HTTP/1.1\r\nHost: synthetic.local\r\nConnection: close\r\nContent-Length: ' + str(len(body)) + '\r\n\r\n').encode() + body
    command = 'exec 3<>/dev/tcp/127.0.0.1/9000; printf %s ' + shlex.quote(wire.decode()) + ' >&3; cat <&3'
    return evidence.transport(['docker', 'exec', name, 'bash', '-c', command], timeout)

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
        subprocess.run(['docker', 'run', '--detach', '--network', 'none', '--name', name,
                        '--mount', f'type=bind,source={fixture},target=/fixture,readonly',
                        image, 'start', '--main-service', '/fixture/harness'],
                       check=True, stdout=subprocess.DEVNULL, timeout=120)
        config = json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]
        assert config['HostConfig']['NetworkMode'] == 'none' and not config['HostConfig']['PortBindings']
        assert all(not item.split('=', 1)[0].endswith(('KEY', 'SECRET', 'PASSWORD')) for item in config['Config']['Env'])
        status, headers, body = wait_for_startup(
            lambda timeout: invoke('POST', timeout), lambda: evidence.state(name))
        assert status == 503 and body == {'code': 'TRIAL_NOT_READY'}, (status, body)
        assert headers['x-test-user-worker'] == 'loaded' and headers['cache-control'] == 'no-store'
        status_get, headers_get, body_get = invoke('GET')
        assert status_get == 405 and body_get == {'code': 'POST_REQUIRED'} and headers_get['x-test-user-worker'] == 'loaded'
        digest = json.loads(subprocess.check_output(['docker', 'image', 'inspect', image]))[0]['RepoDigests']
        evidence.json('result.json', {'outcome': 'passed', 'source_hashes': {file: hashlib.sha256((root / file).read_bytes()).hexdigest() for file in files}})
        print(json.dumps({'runtime_image': image, 'image_digest': digest, 'network': 'none',
                          'ports_published': False, 'worker_env': [], 'provider_key': False,
                          'user_worker_import': True, 'closed_gate_status': 503,
                          'closed_gate_code': 'TRIAL_NOT_READY', 'get_status': 405,
                          'copied_source_hashes': {file: hashlib.sha256((root / file).read_bytes()).hexdigest() for file in files},
                          'provider_or_supabase_calls': 0, 'scope': 'offline user worker; not deployed gateway/Auth acceptance'}))
    except Exception as error:
        evidence.json('result.json', {'outcome': 'failed', 'error_type': type(error).__name__, 'error': str(error)})
        raise
    finally:
        # Keep exited containers until raw responses, exit state and logs are saved.
        evidence.collect(name)
        already_failed = sys.exc_info()[0] is not None
        try:
            cleanup = subprocess.run(['docker', 'rm', '--force', name], capture_output=True, timeout=20)
            evidence.json('cleanup.json', {'returncode': cleanup.returncode, 'stdout': cleanup.stdout.decode(errors='replace'), 'stderr': cleanup.stderr.decode(errors='replace')})
            if not already_failed:
                cleanup.check_returncode()
        except Exception as error:
            evidence.json('cleanup-error.json', {'error': repr(error)})
            if not already_failed:
                raise
