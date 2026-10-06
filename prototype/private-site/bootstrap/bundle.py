#!/usr/bin/env python3
"""Deterministic tracked-source artifact; never includes worktree files or evidence."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile

ROOTS = ('apps/web/', 'prototype/public-audit/', 'prototype/wordpress-pilot/',
         'prototype/wordpress-publish/', 'prototype/private-site/')
EXACT = ('package.json', 'package-lock.json', 'prototype/internal-rc/authority.mjs')

def allowed(name):
    return name in EXACT or name.startswith(ROOTS)

def require(ok, message='bundle refused'):
    if not ok:
        raise ValueError(message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.check_output(['git', *args])

def build(head, output):
    require(re.fullmatch('[0-9a-f]{40}', head), 'exact commit required')
    files = {}
    for line in git('ls-tree', '-rz', head).split(b'\0'):
        if not line:
            continue
        meta, raw = line.split(b'\t')
        mode, kind, oid = meta.decode().split()
        name = raw.decode()
        if allowed(name):
            require(kind == 'blob' and mode in ('100644', '100755'), 'regular source only')
            files[name] = (int(mode[-3:], 8), git('cat-file', 'blob', oid))
    require(files and 'prototype/private-site/bootstrap/bootstrap.py' in files, 'bootstrap source missing')
    manifest = {'format': 'growth-private-bootstrap-source-1', 'head': head,
                'purpose': 'closed-host-bootstrap; not evidence or deployment approval',
                'files': {n: {'sha256': sha(data), 'bytes': len(data), 'mode': mode}
                          for n, (mode, data) in sorted(files.items())}}
    payload = json.dumps(manifest, sort_keys=True, indent=2).encode() + b'\n'
    with open(output, 'xb') as f, tarfile.open(fileobj=f, mode='w', format=tarfile.USTAR_FORMAT) as tar:
        for name, (mode, data) in [('SOURCE-MANIFEST.json', (0o644, payload)), *sorted(files.items())]:
            info = tarfile.TarInfo(name)
            info.size, info.mode, info.mtime = len(data), mode, 0
            tar.addfile(info, io.BytesIO(data))
    return {'head': head, 'bundle_sha256': sha(Path(output).read_bytes()),
            'manifest_sha256': sha(payload), 'files': len(files)}

def verify(path, expected_hash, head, destination=None):
    require(re.fullmatch('[0-9a-f]{64}', expected_hash), 'trusted bundle SHA256 required')
    raw = Path(path).read_bytes()
    require(len(raw) < 64 * 1024 * 1024 and sha(raw) == expected_hash, 'bundle hash mismatch')
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as tar:
        members = tar.getmembers()
        names = [m.name for m in members]
        require(len(names) == len(set(names)), 'duplicate paths')
        for m in members:
            p = PurePosixPath(m.name)
            require(m.isfile() and not p.is_absolute() and '..' not in p.parts and str(p) == m.name, 'unsafe member')
            require(m.name == 'SOURCE-MANIFEST.json' or allowed(m.name), 'out of scope')
        manifest = json.load(tar.extractfile('SOURCE-MANIFEST.json'))
        require(manifest['format'] == 'growth-private-bootstrap-source-1' and manifest['head'] == head, 'wrong commit/format')
        require(set(names) == set(manifest['files']) | {'SOURCE-MANIFEST.json'}, 'inventory mismatch')
        for m in members:
            if m.name == 'SOURCE-MANIFEST.json':
                continue
            data, expected = tar.extractfile(m).read(), manifest['files'][m.name]
            require({'sha256': sha(data), 'bytes': len(data), 'mode': m.mode} == expected, 'source mismatch')
        if destination:
            root = Path(destination)
            require(root.is_absolute() and root.parent.resolve() == root.parent and not root.exists() and not root.is_symlink(), 'new canonical destination required')
            root.mkdir(mode=0o755)
            # Validated regular files only, exclusively created; never tar.extractall.
            for m in members:
                target = root / m.name
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as f:
                    f.write(tar.extractfile(m).read())
                target.chmod(m.mode)
    return {'status': 'VERIFIED', 'head': head, 'bundle_sha256': expected_hash,
            'files': len(manifest['files']), 'extracted': bool(destination)}

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['build', 'verify'])
    p.add_argument('--head', required=True)
    p.add_argument('--file', required=True)
    p.add_argument('--sha256')
    p.add_argument('--extract')
    a = p.parse_args()
    try:
        result = build(a.head, a.file) if a.action == 'build' else verify(a.file, a.sha256, a.head, a.extract)
        print(json.dumps(result, sort_keys=True))
    except Exception as e:
        print(json.dumps({'status': 'STOP', 'error': str(e)}))
        raise SystemExit(1)
