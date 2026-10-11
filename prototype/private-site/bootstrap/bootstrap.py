#!/usr/bin/env python3
"""One-host bootstrap gates. No network, secret generation, or application start."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import pwd
import fcntl
import subprocess
import sys

MOUNT = '/srv/growth-private'
UNITS = ['growth-source.service', 'growth-publication.service',
         'growth-wordpress.service', 'growth-gateway.service', 'growth-private.target']
NODE = '/opt/growth-node/node-v24.19.0-linux-x64/bin/node'

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def require(ok, reason):
    if not ok:
        raise ValueError(reason)

def run(args, codes=(0,)):
    p = subprocess.run(args, text=True, capture_output=True, check=False)
    require(p.returncode in codes, 'command failed: ' + args[0])
    return p

def private_json(path):
    p = Path(path)
    s = p.lstat()
    require(p.is_absolute() and p.resolve() == p and stat.S_ISREG(s.st_mode)
            and s.st_nlink == 1 and s.st_uid == os.geteuid()
            and s.st_mode & 0o077 == 0 and s.st_size <= 65536, 'private receipt required')
    return json.loads(p.read_text())

def nodes(items):
    for n in items:
        yield n
        yield from nodes(n.get('children', []))

def inspect(by_id):
    require(re.fullmatch(r'/dev/disk/by-id/nvme-[A-Za-z0-9_.:-]+', by_id) is not None,
            'explicit NVMe by-id required')
    device = str(Path(by_id).resolve(strict=True))
    require(stat.S_ISBLK(os.stat(device).st_mode), 'not a block device')
    tree = json.loads(run(['lsblk', '--json', '--bytes', '--paths', '--output',
                          'NAME,TYPE,SIZE,SERIAL,FSTYPE,UUID,MOUNTPOINTS']).stdout)['blockdevices']
    matches = [n for n in nodes(tree) if n['name'] == device]
    require(len(matches) == 1, 'ambiguous device')
    n = matches[0]
    require(n['type'] == 'disk' and n.get('serial'), 'whole disk with serial required')
    # Any mounted descendant includes root, boot, swap or an existing data mount.
    mounted = [m for x in nodes([n]) for m in (x.get('mountpoints') or []) if m]
    holders = sorted(x.name for x in Path('/sys/class/block', Path(device).name, 'holders').iterdir())
    wipe = json.loads(run(['wipefs', '--no-act', '--json', device]).stdout)['signatures']
    blk = run(['blkid', '-p', '-o', 'export', device], codes=(0, 2))
    require(blk.returncode != 2 or not blk.stdout.strip(), 'ambiguous blkid result')
    machine = hashlib.sha256(Path('/etc/machine-id').read_bytes()).hexdigest()
    return {'machine_sha256': machine, 'by_id': by_id, 'device': device,
            'serial': n['serial'], 'bytes': int(n['size']), 'type': n['type'],
            'children': [x['name'] for x in nodes(n.get('children', []))],
            'mounts': mounted, 'holders': holders, 'fstype': n.get('fstype'),
            'wipefs': wipe, 'blkid': blk.stdout.strip(), 'blkid_exit': blk.returncode}

def blank(snapshot):
    require(snapshot['bytes'] == 8 * 1024 ** 3 and snapshot['type'] == 'disk', 'expected 8GiB whole disk')
    require(not any(snapshot[k] for k in ('children', 'mounts', 'holders', 'fstype', 'wipefs', 'blkid'))
            and snapshot['blkid_exit'] == 2, 'disk not demonstrably blank and unused')

def approval(receipt, snapshot, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    require(receipt.get('action') == 'format-single-ext4-disk', 'format action not approved')
    require(receipt.get('instance') == 'growth-os-pilot-vm', 'wrong instance')
    require(receipt.get('snapshot_sha256') == digest(snapshot), 'disk observation changed')
    require(receipt.get('by_id') == snapshot['by_id'] and receipt.get('serial') == snapshot['serial'],
            'disk identity mismatch')
    require(receipt.get('aws_disk_arn', '').startswith('arn:aws:lightsail:ap-southeast-1:558311101448:Disk/'),
            'exact AWS disk ARN required')
    require(receipt.get('owner_confirmed_mapping_and_discard') is True
            and bool(receipt.get('approval_reference')), 'Owner mapping/data-discard confirmation required')
    start = dt.datetime.fromisoformat(receipt['starts_at'].replace('Z', '+00:00'))
    end = dt.datetime.fromisoformat(receipt['expires_at'].replace('Z', '+00:00'))
    require(start.tzinfo is not None and end.tzinfo is not None and start <= now < end
            and dt.timedelta(0) < end-start <= dt.timedelta(hours=2), 'approval outside bounded window')
    blank(snapshot)

def format_disk(receipt, apply=False):
    before = inspect(receipt['by_id'])
    approval(receipt, before)
    if not apply:
        return {'status': 'DRY_RUN', 'snapshot_sha256': digest(before), 'mutation': False}
    require(os.geteuid() == 0, 'root required')
    # Re-read immediately; never accept a cached observation or a fallback device name.
    current = inspect(receipt['by_id'])
    approval(receipt, current)
    run(['mkfs.ext4', '-L', 'growth-private', current['device']])
    uuid = run(['blkid', '-s', 'UUID', '-o', 'value', current['device']]).stdout.strip()
    require(re.fullmatch(r'[0-9a-f-]{36}', uuid) is not None, 'format UUID unknown: do not retry')
    return {'status': 'FORMATTED_NOT_MOUNTED', 'uuid': uuid, 'by_id': receipt['by_id'],
            'snapshot_sha256': digest(current), 'mutation': True}

def check_mount(expected):
    require(re.fullmatch(r'[0-9a-f-]{36}', expected['uuid']) is not None, 'invalid UUID')
    require(re.fullmatch(r'/dev/disk/by-id/nvme-[A-Za-z0-9_.:-]+', expected['by_id']) is not None,
            'invalid disk identity')
    rows = json.loads(run(['findmnt', '--json', '--mountpoint', MOUNT,
                          '--output', 'TARGET,SOURCE,FSTYPE,UUID,OPTIONS']).stdout)['filesystems']
    require(len(rows) == 1, 'exact mount required')
    row = rows[0]
    require(row['target'] == MOUNT and row['fstype'] == 'ext4' and row['uuid'] == expected['uuid']
            and 'rw' in row['options'].split(','), 'wrong UUID/filesystem/mount mode')
    require(Path(row['source']).resolve(strict=True) == Path(expected['by_id']).resolve(strict=True),
            'mounted source identity mismatch')
    serial = run(['lsblk', '--nodeps', '--noheadings', '--output', 'SERIAL', expected['by_id']]).stdout.strip()
    require(serial == expected['serial'], 'mounted serial mismatch')
    return {'status': 'MOUNT_VERIFIED', 'uuid': row['uuid'], 'target': MOUNT}

def closed_status():
    states = {}
    for unit in UNITS:
        p = run(['systemctl', 'show', unit, '--property=ActiveState,UnitFileState', '--value'])
        values = p.stdout.splitlines()
        states[unit] = values
        require('inactive' in values and not any(x in values for x in ('enabled', 'enabled-runtime', 'active', 'activating')),
                'unit not closed: ' + unit)
    for name in ('docker.service', 'docker.socket', 'containerd.service'):
        values = run(['systemctl', 'show', name, '--property=ActiveState,UnitFileState', '--value']).stdout.splitlines()
        require('inactive' in values and not any(v in values for v in ('enabled', 'enabled-runtime')), 'container runtime not closed')
    listeners = run(['ss', '-H', '-lnt']).stdout.splitlines()
    for line in listeners:
        columns = line.split()
        require(len(columns) >= 5, 'unrecognized listener record')
        port = columns[3].rsplit(':', 1)[-1]
        require(port not in ('8080', '8082', '8798', '8443'), 'application listener remains')
    require(Path('/etc/growth-private/bootstrap.closed').is_file(), 'closed marker missing')
    require(not any(Path('/etc/growth-private', p).exists() for p in
                    ('publisher.json', 'tls.key', 'database.password', 'database-root.password')),
            'unexpected live configuration or secret')
    return {'status': 'CLOSED', 'units': states, 'secrets_created': False,
            'cleanup': {'application_stopped': True, 'data_deleted': False,
                        'firewall_close': 'PARENT_API_REQUIRED', 'reboot': 'PARENT_API_REQUIRED'}}

def render_unit(name, text):
    if name.endswith('.service'):
        text = text.replace('[Unit]\n', '[Unit]\nRequiresMountsFor='+MOUNT+'\n', 1)
        text = text.replace('[Service]\n', '[Service]\nExecCondition=/usr/bin/test ! -e /etc/growth-private/bootstrap.closed\n'
            'ExecStartPre=/usr/bin/python3 -B /opt/growth-os/prototype/private-site/bootstrap/bootstrap.py mount-check --receipt /etc/growth-private/mount.json\n', 1)
        text = text.replace('/usr/bin/node ', NODE+' ')
    return text

def install_closed(receipt):
    """Fresh host only. Partial installation is reconciled, never overwritten/retried."""
    require(os.geteuid() == 0, 'root required')
    now = dt.datetime.now(dt.timezone.utc)
    start = dt.datetime.fromisoformat(receipt['starts_at'].replace('Z', '+00:00'))
    end = dt.datetime.fromisoformat(receipt['expires_at'].replace('Z', '+00:00'))
    require(start.tzinfo is not None and end.tzinfo is not None and start <= now < end
            and dt.timedelta(0) < end-start <= dt.timedelta(hours=2), 'approval outside bounded window')
    require(receipt.get('action') == 'install-closed-bootstrap' and receipt.get('approval_reference')
            and receipt.get('instance') == 'growth-os-pilot-vm', 'closed installation approval required')
    require(receipt['machine_sha256'] == hashlib.sha256(Path('/etc/machine-id').read_bytes()).hexdigest(),
            'wrong host')
    check_mount(receipt['mount'])
    source = Path('/opt/growth-os')
    manifest_path = source / 'SOURCE-MANIFEST.json'
    require(hashlib.sha256(manifest_path.read_bytes()).hexdigest() == receipt['manifest_sha256'], 'wrong source manifest')
    manifest = json.loads(manifest_path.read_text())
    require(manifest['head'] == receipt['head'], 'wrong source commit')
    for name, info in manifest['files'].items():
        p = source / name
        require(p.resolve() == p and p.is_file() and p.stat().st_nlink == 1
                and hashlib.sha256(p.read_bytes()).hexdigest() == info['sha256'], 'source file mismatch')
    require(run([NODE, '--version']).stdout.strip() == 'v24.19.0', 'wrong Node')
    for account in ('growth-app', 'growth-source'):
        try:
            pwd.getpwnam(account)
        except KeyError:
            pass
        else:
            raise ValueError('service account already exists: reconcile')
    config = Path('/etc/growth-private')
    units = Path('/etc/systemd/system')
    require(not config.exists() and not config.is_symlink(), 'existing configuration: reconcile')
    for name in UNITS:
        require(not (units/name).exists() and not (units/name).is_symlink(), 'existing unit: reconcile')
        require(not (units/(name+'.d')).exists(), 'existing unit override: reconcile')
        state = run(['systemctl', 'show', name, '--property=LoadState', '--value'], codes=(0, 1)).stdout.strip()
        require(state == 'not-found', 'unit already present in another systemd location')
    require(not any(Path(MOUNT, name).exists() or Path(MOUNT, name).is_symlink()
                    for name in ('source', 'publisher', 'wordpress', 'mariadb')), 'existing data: reconcile')
    # All safety checks precede the first host mutation. No secrets or activation material.
    for account in ('growth-app', 'growth-source'):
        run(['useradd', '--system', '--user-group', '--no-create-home', '--home-dir', '/nonexistent',
             '--shell', '/usr/sbin/nologin', account])
    config.mkdir(mode=0o755)
    (config/'bootstrap.closed').write_text('Application activation requires the next approved phase.\n')
    (config/'mount.json').write_text(json.dumps(receipt['mount'])+'\n')
    (config/'mount.json').chmod(0o644)
    for name, account in (('source', 'growth-source'), ('publisher', 'growth-app')):
        p = Path(MOUNT, name)
        p.mkdir(mode=0o700)
        user = pwd.getpwnam(account)
        os.chown(p, user.pw_uid, user.pw_gid)
    for name in UNITS:
        text = render_unit(name, (source/'prototype/private-site/templates'/name).read_text())
        with (units/name).open('x') as f:
            f.write(text)
    run(['systemctl', 'daemon-reload'])
    result = closed_status()
    result.update({'head': receipt['head'], 'manifest_sha256': receipt['manifest_sha256'],
                   'uuid': receipt['mount']['uuid'], 'next_phase': 'APPLICATION_CONFIG_SECRETS_AND_ACTIVATION'})
    return result

def main():
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['inspect', 'format', 'mount-check', 'closed-status', 'install-closed'])
    p.add_argument('--by-id')
    p.add_argument('--receipt')
    p.add_argument('--apply', action='store_true')
    a = p.parse_args()
    require(not a.apply or a.action == 'format', '--apply only for format')
    if a.action == 'inspect':
        s = inspect(a.by_id)
        result = {'status': 'OBSERVED', 'snapshot': s, 'snapshot_sha256': digest(s)}
        blank(s)
        result['blank_and_unused'] = True
    elif a.action == 'format':
        if a.apply:
            require(os.geteuid() == 0, 'root required')
            with open('/run/growth-private-format.lock', 'a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                result = format_disk(private_json(a.receipt), True)
        else:
            result = format_disk(private_json(a.receipt), False)
    elif a.action == 'mount-check':
        result = check_mount(json.loads(Path(a.receipt).read_text()))
    elif a.action == 'install-closed':
        result = install_closed(private_json(a.receipt))
    else:
        result = closed_status()
    print(json.dumps(result, sort_keys=True))

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        # No subprocess stdout/stderr or secret contents in a failed receipt.
        print(json.dumps({'status': 'STOP', 'error': str(e) if isinstance(e, ValueError) else type(e).__name__,
                          'result': 'RECONCILE_BEFORE_RETRY'}))
        sys.exit(1)
