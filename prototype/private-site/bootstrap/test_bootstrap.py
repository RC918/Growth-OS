import copy
import datetime as dt
import importlib.util
import io
import json
import os
import selectors
import signal
import stat
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import sys
sys.path.insert(0, str(Path(__file__).parent))
import bootstrap as b
import bundle

NOW = dt.datetime(2026, 10, 6, 12, tzinfo=dt.timezone.utc)
SNAPSHOT = dict(machine_sha256='a'*64, by_id='/dev/disk/by-id/nvme-SYNTHETIC_DISK',
                device='/dev/nvme99n1', serial='SYNTHETIC_DISK', bytes=8*1024**3,
                type='disk', children=[], mounts=[], holders=[], fstype=None,
                wipefs=[], blkid='', blkid_exit=2)

def receipt():
    return dict(action='format-single-ext4-disk', instance='growth-os-pilot-vm',
                snapshot_sha256=b.digest(SNAPSHOT), by_id=SNAPSHOT['by_id'], serial=SNAPSHOT['serial'],
                aws_disk_arn='arn:aws:lightsail:ap-southeast-1:558311101448:Disk/SYNTHETIC',
                owner_confirmed_mapping_and_discard=True, approval_reference='SYNTHETIC-NOT-AUTHORIZATION',
                starts_at='2026-10-06T11:30:00Z', expires_at='2026-10-06T12:30:00Z')

class Gates(unittest.TestCase):
    def test_receipt_exact_and_expiry(self):
        b.approval(receipt(), SNAPSHOT, NOW)
        for key, value in [('action', 'mount'), ('serial', 'OTHER'), ('by_id', '/dev/xvdf'),
                           ('snapshot_sha256', '0'*64), ('owner_confirmed_mapping_and_discard', False),
                           ('expires_at', '2026-10-06T11:59:00Z'), ('starts_at', '2026-10-05T00:00:00Z'),
                           ('aws_disk_arn', 'arn:wrong')]:
            with self.subTest(key=key), self.assertRaises((ValueError, TypeError)):
                r = receipt(); r[key] = value; b.approval(r, SNAPSHOT, NOW)

    def test_each_dangerous_disk_state_refused_even_with_matching_hash(self):
        for key, value in [('bytes', 80*1024**3), ('children', ['/dev/nvme99n1p1']),
                           ('mounts', ['/']), ('mounts', ['[SWAP]']), ('holders', ['dm-0']),
                           ('fstype', 'ext4'), ('wipefs', [{'type': 'gpt'}]), ('blkid', 'TYPE=ext4'),
                           ('blkid_exit', 0)]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                s = copy.deepcopy(SNAPSHOT); s[key] = value
                r = receipt(); r['snapshot_sha256'] = b.digest(s); b.approval(r, s, NOW)

    def test_dryrun_and_format_use_same_gate_no_real_device(self):
        real_gate = b.approval
        with patch.object(b, 'inspect', return_value=SNAPSHOT), patch.object(b, 'approval', side_effect=lambda r,s: real_gate(r,s,NOW)), patch.object(b, 'run') as run, patch.object(b.os, 'geteuid', return_value=0):
            self.assertEqual(b.format_disk(receipt())['status'], 'DRY_RUN')
            run.assert_not_called()
            run.return_value.stdout = '11111111-1111-1111-1111-111111111111\n'
            self.assertEqual(b.format_disk(receipt(), True)['status'], 'FORMATTED_NOT_MOUNTED')
            self.assertEqual(run.call_args_list[0].args[0], ['mkfs.ext4', '-L', 'growth-private', '/dev/nvme99n1'])
            self.assertEqual(run.call_count, 2)

    def test_changed_second_observation_never_formats(self):
        changed = dict(SNAPSHOT, serial='SWAPPED')
        real_gate = b.approval
        with patch.object(b, 'inspect', side_effect=[SNAPSHOT, changed]), patch.object(b, 'approval', side_effect=lambda r,s: real_gate(r,s,NOW)), patch.object(b, 'run') as run, patch.object(b.os, 'geteuid', return_value=0), self.assertRaises(ValueError):
            b.format_disk(receipt(), True)
        run.assert_not_called()

    def test_mount_uuid_and_exact_mountpoint(self):
        expected = dict(uuid='11111111-1111-1111-1111-111111111111', by_id=SNAPSHOT['by_id'], serial=SNAPSHOT['serial'])
        good = dict(target=b.MOUNT, source=SNAPSHOT['by_id'], fstype='ext4', uuid=expected['uuid'], options='rw,nosuid,nodev')
        for field, value in [('uuid', '22222222-2222-2222-2222-222222222222'), ('target', '/'), ('fstype', 'xfs'), ('options', 'ro')]:
            row = dict(good); row[field] = value
            with patch.object(b, 'run', return_value=subprocess.CompletedProcess([], 0, json.dumps({'filesystems':[row]}))), self.assertRaises(ValueError):
                b.check_mount(expected)
        with patch.object(b, 'run', side_effect=[subprocess.CompletedProcess([],0,json.dumps({'filesystems':[good]})), subprocess.CompletedProcess([],0,SNAPSHOT['serial'])]), patch.object(Path, 'resolve', return_value=Path('/dev/nvme99n1')):
            self.assertEqual(b.check_mount(expected)['status'], 'MOUNT_VERIFIED')
        with patch.object(b, 'run', side_effect=ValueError('findmnt failed')), self.assertRaises(ValueError):
            b.check_mount(expected)

    def test_private_approval_permissions(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'approval.json'; path.write_text(json.dumps(receipt())); path.chmod(0o600)
            self.assertEqual(b.private_json(str(path)), receipt())
            path.chmod(0o644)
            with self.assertRaises(ValueError): b.private_json(str(path))
            link = Path(tmp)/'link'; link.symlink_to(path)
            with self.assertRaises(ValueError): b.private_json(str(link))

    def test_every_service_closed_and_mount_guarded(self):
        templates = Path(__file__).parents[1]/'templates'
        for name in b.UNITS:
            text = b.render_unit(name, (templates/name).read_text())
            self.assertNotIn('[Install]', text)
            if name.endswith('.service'):
                self.assertIn('ExecCondition=/usr/bin/test ! -e /etc/growth-private/bootstrap.closed', text)
                self.assertIn('RequiresMountsFor=/srv/growth-private', text)
                self.assertIn('bootstrap.py mount-check', text)
                self.assertNotIn('ExecStart=/usr/bin/node ', text)
            self.assertNotIn('Restart=always', text)

    def test_cleanup_receipt_does_not_claim_firewall_or_delete(self):
        with patch.object(b, 'run', side_effect=lambda args: subprocess.CompletedProcess([],0,'' if args[0]=='ss' else 'inactive\nstatic\n')), patch.object(Path, 'is_file', return_value=True), patch.object(Path, 'exists', return_value=False):
            result = b.closed_status()
            self.assertEqual(result['cleanup']['firewall_close'], 'PARENT_API_REQUIRED')
            self.assertFalse(result['cleanup']['data_deleted'])
        with patch.object(b, 'run', return_value=subprocess.CompletedProcess([],0,'active\nstatic\n')), self.assertRaises(ValueError): b.closed_status()

    def test_listener_blocks_clean_exit_receipt(self):
        with patch.object(b, 'run', side_effect=lambda args: subprocess.CompletedProcess([],0,'LISTEN 0 32 127.0.0.1:8443 0.0.0.0:*\n' if args[0]=='ss' else 'inactive\nstatic\n')), self.assertRaises(ValueError):
            b.closed_status()

    def test_host_install_without_scope_never_mutates(self):
        r = receipt(); r['starts_at']='2000-01-01T00:00:00Z'; r['expires_at']='2000-01-01T01:00:00Z'
        with patch.object(b.os, 'geteuid', return_value=0), patch.object(b, 'run') as run, self.assertRaises(ValueError):
            b.install_closed(r)
        run.assert_not_called()

    def test_closed_install_on_synthetic_filesystem_and_commands(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root/'opt/growth-os'; source.mkdir(parents=True)
            templates = source/'prototype/private-site/templates'; templates.mkdir(parents=True)
            inventory = {}
            for name in b.UNITS:
                data = (Path(__file__).parents[1]/'templates'/name).read_bytes()
                (templates/name).write_bytes(data)
                inventory['prototype/private-site/templates/'+name] = {'sha256': bundle.sha(data)}
            manifest = json.dumps({'head':'a'*40,'files':inventory})
            (source/'SOURCE-MANIFEST.json').write_text(manifest)
            (root/'etc/systemd/system').mkdir(parents=True)
            (root/'srv/growth-private').mkdir(parents=True)
            (root/'etc/machine-id').write_bytes(b'synthetic-host')
            actual_path = Path
            def fake_path(first, *rest):
                value = str(first)
                if value.startswith(('/opt/', '/etc/', '/srv/')):
                    return actual_path(tmp, value.lstrip('/'), *rest)
                return actual_path(first, *rest)
            accounts = {}
            calls = []
            def account(name):
                if name not in accounts: raise KeyError(name)
                return accounts[name]
            def command(args, codes=(0,)):
                calls.append(args)
                if args[0] == 'useradd':
                    from types import SimpleNamespace
                    accounts[args[-1]] = SimpleNamespace(pw_uid=900+len(accounts),pw_gid=900+len(accounts))
                value = '' if args[0]=='ss' else 'v24.19.0\n' if args[0] == b.NODE else ('not-found\n' if '--property=LoadState' in args else 'inactive\nstatic\n')
                return subprocess.CompletedProcess(args,0,value)
            now = dt.datetime.now(dt.timezone.utc)
            r = dict(action='install-closed-bootstrap',instance='growth-os-pilot-vm',approval_reference='SYNTHETIC',
                     starts_at=(now-dt.timedelta(minutes=1)).isoformat(),expires_at=(now+dt.timedelta(minutes=10)).isoformat(),
                     machine_sha256=bundle.sha(b'synthetic-host'),head='a'*40,manifest_sha256=bundle.sha(manifest.encode()),
                     mount=dict(uuid='11111111-1111-1111-1111-111111111111',by_id=SNAPSHOT['by_id'],serial=SNAPSHOT['serial']))
            with patch.object(b,'Path',side_effect=fake_path), patch.object(b.os,'geteuid',return_value=0), patch.object(b.os,'chown'), patch.object(b.pwd,'getpwnam',side_effect=account), patch.object(b,'run',side_effect=command), patch.object(b,'check_mount',return_value={'status':'MOUNT_VERIFIED'}):
                result = b.install_closed(r)
                self.assertEqual(result['status'],'CLOSED')
                self.assertFalse(result['secrets_created'])
                self.assertEqual((root/'srv/growth-private/source').stat().st_mode & 0o777,0o700)
                self.assertTrue((root/'etc/growth-private/bootstrap.closed').is_file())
                self.assertFalse((root/'srv/growth-private/mariadb').exists())
                self.assertFalse(any('start' in c or 'enable' in c or c[0]=='docker' for c in calls))
                with self.assertRaises(ValueError): b.install_closed(r)

class Bundle(unittest.TestCase):
    GOLDEN = 'bf490758bb494038e77da66649e91246253c73808c246b1c9da4917fdcf7c7bf'

    @staticmethod
    def fixture_git(*args):
        if args[0] == 'ls-tree':
            return b'100644 blob ' + b'b'*40 + b'\tprototype/private-site/bootstrap/bootstrap.py\0'
        return b'# synthetic\n'

    def test_legacy_bytes_and_sync_order(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(bundle, 'git', side_effect=self.fixture_git):
            output = Path(tmp)/'source.tar'
            calls = []
            real_sync, real_link = os.fsync, os.link
            def sync(fd):
                calls.append('directory' if stat.S_ISDIR(os.fstat(fd).st_mode) else 'file')
                return real_sync(fd)
            def link(src, dst):
                self.assertEqual(calls, ['file'])
                bundle.verify(src, self.GOLDEN, 'a'*40)
                calls.append('publish')
                return real_link(src, dst)
            with patch.object(bundle.os, 'fsync', side_effect=sync), patch.object(bundle.os, 'link', side_effect=link):
                receipt = bundle.build('a'*40, output)
            self.assertEqual(receipt['bundle_sha256'], self.GOLDEN)
            self.assertEqual(calls, ['file', 'publish', 'directory', 'directory'])
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            self.assertEqual(list(Path(tmp).iterdir()), [output])

    def test_existing_paths_are_never_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(bundle, 'git', side_effect=self.fixture_git):
            root = Path(tmp)
            valid = root/'valid.tar'
            bundle.build('a'*40, valid)
            existing = root/'existing.tar'; existing.write_bytes(b'keep incomplete evidence')
            dangling = root/'dangling.tar'; dangling.symlink_to(root/'missing')
            linked = root/'linked.tar'; linked.symlink_to(valid)
            directory = root/'directory'; directory.mkdir()
            for output in (valid, existing, dangling, linked, directory):
                before = output.lstat()
                with self.subTest(path=output.name), self.assertRaises(FileExistsError):
                    bundle.build('a'*40, output)
                self.assertEqual(output.lstat(), before)
            self.assertEqual(existing.read_bytes(), b'keep incomplete evidence')
            bundle.verify(valid, self.GOLDEN, 'a'*40)
            self.assertFalse(list(root.glob('.*.tmp')))

    def child(self, output, stage):
        # Test-only hooks: a real child stops at a precise boundary, then the
        # parent SIGKILLs it. No fault flags exist in the production CLI.
        script = r'''
import sys, os
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import bundle
bundle.git = lambda *a: (b'100644 blob '+b'b'*40+b'\tprototype/private-site/bootstrap/bootstrap.py\0') if a[0]=='ls-tree' else b'# synthetic\n'
stage = sys.argv[3]
def pause():
    print('READY', flush=True)
    sys.stdin.readline()
if stage == 'writing':
    original = bundle.tarfile.TarFile.addfile
    def addfile(self, *a, **kw):
        result = original(self, *a, **kw)
        self.fileobj.flush()
        pause()
        return result
    bundle.tarfile.TarFile.addfile = addfile
elif stage in ('before', 'after', 'race'):
    original = os.link
    def link(*a, **kw):
        if stage != 'after': pause()
        result = original(*a, **kw)
        if stage == 'after': pause()
        return result
    os.link = link
elif stage == 'receipt':
    original = bundle.build
    def build(*a):
        result = original(*a)
        pause()
        return result
    bundle.build = build
try:
    print(bundle.build('a'*40, sys.argv[2]), flush=True)
except FileExistsError:
    sys.exit(3)
'''
        child = subprocess.Popen([sys.executable, '-B', '-c', script,
                                  str(Path(bundle.__file__).parent), str(output), stage],
                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        def cleanup():
            if child.poll() is None: child.kill()
            child.communicate(timeout=10)
        self.addCleanup(cleanup)
        with selectors.DefaultSelector() as selector:
            selector.register(child.stdout, selectors.EVENT_READ)
            self.assertTrue(selector.select(timeout=10), 'child failed to reach boundary')
        self.assertEqual(child.stdout.readline().strip(), 'READY')
        return child

    def test_sigkill_boundaries_and_readonly_reconciliation(self):
        for stage in ('writing', 'before', 'after', 'receipt'):
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as tmp:
                output = Path(tmp)/'source.tar'
                child = self.child(output, stage)
                child.kill()
                stdout, stderr = child.communicate(timeout=10)
                self.assertEqual(child.returncode, -signal.SIGKILL)
                self.assertEqual((stdout, stderr), ('', ''))
                leftovers = list(Path(tmp).glob('.source.tar.*.tmp'))
                if stage in ('writing', 'before'):
                    self.assertFalse(output.exists())
                    self.assertEqual(len(leftovers), 1)
                    if stage == 'before': bundle.verify(leftovers[0], self.GOLDEN, 'a'*40)
                    else: self.assertNotEqual(bundle.sha(leftovers[0].read_bytes()), self.GOLDEN)
                else:
                    identity = output.stat()
                    bundle.verify(output, self.GOLDEN, 'a'*40)
                    if stage == 'after':
                        self.assertEqual(len(leftovers), 1)
                        self.assertEqual(leftovers[0].stat().st_ino, identity.st_ino)
                    else: self.assertEqual(leftovers, [])
                    with patch.object(bundle, 'git', side_effect=self.fixture_git), self.assertRaises(FileExistsError):
                        bundle.build('a'*40, output)
                    self.assertEqual(output.stat().st_ino, identity.st_ino)

    def test_two_process_publication_race(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)/'source.tar'
            children = [self.child(output, 'race') for _ in range(2)]
            for child in children:
                child.stdin.write('\n'); child.stdin.flush()
            for child in children: child.communicate(timeout=10)
            self.assertEqual(sorted(c.returncode for c in children), [0, 3])
            bundle.verify(output, self.GOLDEN, 'a'*40)
            self.assertFalse(list(Path(tmp).glob('.*.tmp')))

    def test_sync_failure_after_publication_preserves_applied_output(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(bundle, 'git', side_effect=self.fixture_git):
            output = Path(tmp)/'source.tar'
            real_sync = os.fsync
            def sync(fd):
                if stat.S_ISDIR(os.fstat(fd).st_mode): raise OSError('synthetic directory sync failure')
                return real_sync(fd)
            with patch.object(bundle.os, 'fsync', side_effect=sync), self.assertRaisesRegex(RuntimeError, 'publication applied'):
                bundle.build('a'*40, output)
            bundle.verify(output, self.GOLDEN, 'a'*40)
            self.assertEqual(len(list(Path(tmp).glob('.*.tmp'))), 1)

    def test_deterministic_exact_tree_and_tamper_refusals(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(['git','init','-q',tmp],check=True)
            path = root/'prototype/private-site/bootstrap/bootstrap.py'; path.parent.mkdir(parents=True); path.write_text('# synthetic\n')
            subprocess.run(['git','-C',tmp,'add','.'],check=True)
            subprocess.run(['git','-C',tmp,'-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','commit','-qm','fixture'],check=True)
            head = subprocess.check_output(['git','-C',tmp,'rev-parse','HEAD'],text=True).strip()
            real_git = bundle.git
            with patch.object(bundle, 'git', side_effect=lambda *args: subprocess.check_output(['git','-C',tmp,*args])):
                a = bundle.build(head,root/'a.tar'); c = bundle.build(head,root/'b.tar')
            self.assertEqual(a,c)
            bundle.verify(root/'a.tar',a['bundle_sha256'],head,root/'extract')
            with self.assertRaises(ValueError): bundle.verify(root/'a.tar','0'*64,head)
            with self.assertRaises(ValueError): bundle.verify(root/'a.tar',a['bundle_sha256'],'0'*40)
            with self.assertRaises(ValueError): bundle.verify(root/'a.tar',a['bundle_sha256'],head,root/'extract')
            raw = (root/'a.tar').read_bytes().replace(b'# synthetic\n',b'# corrupted\n')
            (root/'bad.tar').write_bytes(raw)
            with self.assertRaises(ValueError): bundle.verify(root/'bad.tar',bundle.sha(raw),head)
            with tarfile.open(root/'evil.tar','w') as t:
                m=tarfile.TarInfo('../escape'); m.size=1; t.addfile(m,io.BytesIO(b'x'))
            with self.assertRaises(ValueError): bundle.verify(root/'evil.tar',bundle.sha((root/'evil.tar').read_bytes()),head)
            self.assertFalse((root.parent/'escape').exists())

if __name__ == '__main__': unittest.main()
