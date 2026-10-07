#!/usr/bin/env python3
"""Deterministic tracked-source artifact; never includes worktree files or evidence."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import tempfile

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
    output = Path(output).absolute()
    # A same-directory hard link publishes a complete inode atomically and refuses
    # every existing destination (including dangling symlinks). Never rename over it.
    directory = os.open(output.parent, os.O_RDONLY | os.O_DIRECTORY)
    temporary = None
    published = False
    try:
        fd, name = tempfile.mkstemp(prefix=f'.{output.name}.', suffix='.tmp', dir=output.parent)
        temporary = Path(name)
        with os.fdopen(fd, 'wb') as f:
            with tarfile.open(fileobj=f, mode='w', format=tarfile.USTAR_FORMAT) as tar:
                for name, (mode, data) in [('SOURCE-MANIFEST.json', (0o644, payload)), *sorted(files.items())]:
                    info = tarfile.TarInfo(name)
                    info.size, info.mode, info.mtime = len(data), mode, 0
                    tar.addfile(info, io.BytesIO(data))
            f.flush()
            os.fsync(f.fileno())
        receipt = {'head': head, 'bundle_sha256': sha(temporary.read_bytes()),
                   'manifest_sha256': sha(payload), 'files': len(files)}
        verify(temporary, receipt['bundle_sha256'], head)
        os.link(temporary, output)
        published = True
        os.fsync(directory)
        temporary.unlink()
        temporary = None
        os.fsync(directory)
        return receipt
    except Exception as e:
        if published:
            raise RuntimeError('publication applied; durability/cleanup/receipt uncertain; '
                               'verify existing output before any retry') from e
        raise
    finally:
        # A killed process can leave this private temp. After publication retain it
        # on failure for reconciliation; never remove or replace the final path.
        try:
            if temporary is not None and not published:
                temporary.unlink()
                os.fsync(directory)
        finally:
            os.close(directory)

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
