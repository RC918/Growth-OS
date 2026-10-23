"""Test-only transport/evidence for the isolated, closed-gate Edge smoke."""
import json
import subprocess
import time
from pathlib import Path


class EmptyResponse(Exception):
    """EOF before an HTTP response; only retryable during bounded startup."""


class Evidence:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.attempt = 0

    def json(self, name, value):
        (self.directory / name).write_text(json.dumps(value, indent=2) + '\n')

    def transport(self, command, timeout):
        self.attempt += 1
        prefix = self.directory / f'transport-{self.attempt:03}'
        try:
            result = subprocess.run(command, capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired as error:
            prefix.with_suffix('.stdout.bin').write_bytes(error.stdout or b'')
            prefix.with_suffix('.stderr.bin').write_bytes(error.stderr or b'')
            self.json(prefix.name + '.json', {'returncode': None, 'timeout': True})
            raise
        prefix.with_suffix('.stdout.bin').write_bytes(result.stdout)
        prefix.with_suffix('.stderr.bin').write_bytes(result.stderr)
        self.json(prefix.name + '.json', {'returncode': result.returncode, 'timeout': False,
                                        'stdout_bytes': len(result.stdout), 'stderr_bytes': len(result.stderr)})
        result.check_returncode()
        return parse_response(result.stdout)

    def state(self, name):
        result = subprocess.run(['docker', 'inspect', '--format', '{{json .State}}', name],
                                capture_output=True, timeout=10)
        (self.directory / 'container-inspect.stderr').write_bytes(result.stderr)
        self.json('container-inspect.json', {'returncode': result.returncode})
        result.check_returncode()
        state = json.loads(result.stdout)
        self.json('container-state.json', state)
        return state

    def collect(self, name):
        # Collection errors never replace the original failure. Every error remains evidence.
        errors = []
        try:
            self.state(name)
        except Exception as error:
            errors.append({'stage': 'inspect', 'error': repr(error)})
        try:
            result = subprocess.run(['docker', 'logs', name], capture_output=True, timeout=10)
            (self.directory / 'container.stdout').write_bytes(result.stdout)
            (self.directory / 'container.stderr').write_bytes(result.stderr)
            self.json('container-logs.json', {'returncode': result.returncode})
            if result.returncode:
                errors.append({'stage': 'logs', 'returncode': result.returncode})
        except Exception as error:
            errors.append({'stage': 'logs', 'error': repr(error)})
        self.json('collection-errors.json', errors)


def parse_response(raw):
    if not raw:
        raise EmptyResponse('EOF before HTTP response')
    if b'\r\n\r\n' not in raw:
        raise ValueError('Incomplete HTTP headers (raw response retained)')
    head, payload = raw.split(b'\r\n\r\n', 1)
    lines = head.decode().split('\r\n')
    protocol, code, *_ = lines[0].split()
    if protocol not in ('HTTP/1.0', 'HTTP/1.1'):
        raise ValueError('Invalid HTTP protocol')
    status = int(code)
    headers = {key.strip().lower(): value.strip() for line in lines[1:]
               for key, value in [line.split(':', 1)]}
    if headers.get('transfer-encoding', '').lower() == 'chunked':
        chunks = []
        while True:
            size, payload = payload.split(b'\r\n', 1)
            count = int(size.split(b';')[0], 16)
            if count < 0 or len(payload) < count + 2 or payload[count:count + 2] != b'\r\n':
                raise ValueError('Incomplete HTTP chunk')
            if count == 0:
                break
            chunks.append(payload[:count])
            payload = payload[count + 2:]
        payload = b''.join(chunks)
    elif 'content-length' in headers and len(payload) != int(headers['content-length']):
        raise ValueError('Incomplete HTTP body')
    return status, headers, json.loads(payload)


def wait_for_startup(invoke, state, *, timeout=30, clock=time.monotonic, sleep=time.sleep):
    deadline = clock() + timeout
    while True:
        remaining = deadline - clock()
        if remaining <= 0:
            raise TimeoutError('Edge Runtime startup deadline exceeded')
        try:
            # Only this first closed-gate readiness request is retried, in the same container.
            return invoke(min(15, remaining))
        except (subprocess.CalledProcessError, EmptyResponse) as error:
            # A received response must never be hidden by a transport exit failure.
            if isinstance(error, subprocess.CalledProcessError) and error.stdout:
                raise
            current = state()
            if not current.get('Running') or current.get('Restarting'):
                raise RuntimeError('Edge Runtime stopped during startup: ' + json.dumps(current)) from error
            if clock() >= deadline:
                raise TimeoutError('Edge Runtime startup deadline exceeded') from error
            sleep(min(.2, max(0, deadline - clock())))
