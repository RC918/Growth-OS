#!/usr/bin/env python3
"""Offline acceptance: disposable Git fixtures only; no hosted calls or dependencies.

Run: python3 -B tools/vercel/test_ignored_build.py --history-repo .
Omit --history-repo for synthetic tests only (real cases are then NOT RUN).
Fixture commits exist only in TemporaryDirectory, never in the source repository.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / 'ignored-build.sh'
COMMAND = (HERE / 'dashboard-command.txt').read_text().rstrip('\n')
CHECKPOINT = 'docs/Autonomous_Manager_Checkpoint_2026-10-18.md'
BRANCH = 'takeover/muse-primary-20261016'
REAL_COMMITS = ('ef44603', '2eec93d', '50cc26a', 'f9bf50a')
GIT = shutil.which('git')
BASH = shutil.which('bash')


def run(args, cwd, env, check=True):
    return subprocess.run(args, cwd=cwd, env=env, capture_output=True,
                          text=True, check=check, timeout=30)


def put(root, path, data):
    target = root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data if isinstance(data, bytes) else data.encode())
    return target


class Fixture:
    def __init__(self, root, env):
        self.root, self.env = root, env
        root.mkdir()
        self.git('init', '-q')
        self.git('config', 'user.name', 'Offline Fixture')
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.git('config', 'commit.gpgsign', 'false')
        self.git('config', 'core.hooksPath', '/dev/null')
        self.install()

    def git(self, *args):
        return run([GIT, *args], self.root, self.env).stdout.strip()

    def install(self):
        put(self.root, 'tools/vercel/ignored-build.sh', SCRIPT.read_bytes())

    def commit(self, message):
        self.git('add', '--all')
        self.git('commit', '-qm', message)
        return self.git('rev-parse', 'HEAD')


def acceptance(temp, history_repo):
    # Do not inherit credentials, Git overrides, aliases, hooks, or network helpers.
    env = {'PATH': os.environ.get('PATH', os.defpath), 'HOME': str(temp),
           'LC_ALL': 'C', 'GIT_CONFIG_NOSYSTEM': '1',
           'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_TERMINAL_PROMPT': '0',
           'GIT_NO_LAZY_FETCH': '1'}
    results = []
    fixture = Fixture(temp / 'synthetic', env)
    root = fixture.root
    git = fixture.git
    for path, text in ((CHECKPOINT, 'initial\n'),
                       ('apps/web/README.md', 'served markdown\n'),
                       ('api/function.py', 'x=1\n'), ('vercel.json', '{}\n'),
                       ('package-lock.json', '{}\n')):
        put(root, path, text)
    base = fixture.commit('synthetic baseline')
    put(root, CHECKPOINT, 'initial\ncheckpoint\n')
    docs = fixture.commit('synthetic checkpoint')

    def check(name, expected, sha=base, environment='preview', branch=BRANCH,
              cwd=root, remove=(), updates=None, direct=False, shell='/bin/sh',
              group='original-synthetic', metadata=None):
        e = dict(env, VERCEL_ENV=environment, VERCEL_GIT_COMMIT_REF=branch,
                 VERCEL_GIT_PREVIOUS_SHA=sha)
        e.update(updates or {})
        for key in remove:
            e.pop(key, None)
        args = [BASH, str(SCRIPT)] if direct else [shell, '-c', COMMAND]
        out = run(args, cwd, e, check=False)
        actual = int(out.returncode != 0)
        results.append(dict(name=name, group=group, expected=expected, actual=actual,
                            exit=out.returncode, passed=actual == expected,
                            stderr=out.stderr.strip(), **(metadata or {})))

    # The 32 final-command cases supplied by the parent, with the nested case
    # invoking the script directly: the Dashboard relative path requires Root ./.
    check('docs only', 0)
    check('docs from nested working directory (direct script)', 0,
          cwd=root / 'apps/web', direct=True)
    check('missing previous SHA', 1, sha='')
    check('invalid SHA', 1, sha='--help')
    check('unknown valid SHA', 1, sha='f' * 40)
    check('other branch', 1, branch='another-branch')
    check('preserve production skip', 0, environment='production')
    check('development', 0, environment='development')
    check('missing environment', 0, environment='')
    check('missing branch', 1, branch='')
    put(root, 'apps/web/README.md', 'changed served markdown\n')
    served = fixture.commit('synthetic served markdown')
    check('apps/web markdown build', 1, sha=docs)
    put(root, CHECKPOINT, 'another checkpoint\n')
    mixed = fixture.commit('synthetic docs after code')
    check('code then docs since last deployment', 1, sha=docs)
    check('last commit only would miss code (negative control)', 0, sha=served)
    put(root, CHECKPOINT, 'mixed\n')
    put(root, 'api/function.py', 'x=2\n')
    both = fixture.commit('synthetic mixed')
    check('same commit docs and code', 1, sha=mixed)
    put(root, 'docs/schema.sql', 'select 1;\n')
    schema = fixture.commit('synthetic docs sql')
    check('non-Markdown under docs', 1, sha=both)
    put(root, 'docs/nested/checkpoint.md', 'nested\n')
    nested = fixture.commit('synthetic nested docs')
    check('nested Markdown conservatively builds', 1, sha=schema)
    put(root, 'vercel.json', '{"version":2}\n')
    config = fixture.commit('synthetic config')
    check('config builds', 1, sha=nested)
    put(root, 'package-lock.json', '{"lockfileVersion":3}\n')
    lock = fixture.commit('synthetic lockfile')
    check('dependency lockfile builds', 1, sha=config)
    git('mv', 'api/function.py', 'docs/renamed.md')
    renamed = fixture.commit('synthetic code rename to docs')
    check('code rename into docs still builds', 1, sha=lock)
    git('checkout', '-qb', 'unrelated', base)
    put(root, 'unrelated.txt', 'unrelated\n')
    nonancestor = fixture.commit('synthetic alternate branch')
    git('checkout', '-q', renamed)
    check('present nonancestor SHA builds', 1, sha=nonancestor)
    shallow = temp / 'shallow'
    run([GIT, 'clone', '-q', '--depth=1', root.as_uri(), str(shallow)], temp, env)
    assert run([GIT, 'rev-parse', '--is-shallow-repository'], shallow, env).stdout.strip() == 'true'
    check('history missing shallow clone builds', 1, cwd=shallow)
    notrepo = temp / 'notrepo'
    notrepo.mkdir()
    put(notrepo, 'tools/vercel/ignored-build.sh', SCRIPT.read_bytes())
    check('Git context error builds', 1, cwd=notrepo)
    put(root, 'docs/other-governance.md', 'unknown governance\n')
    governance = fixture.commit('unknown governance')
    check('unreviewed governance Markdown builds', 1, sha=renamed)
    check('ENV truly absent', 0, remove=('VERCEL_ENV',))
    check('PREVIOUS truly absent on preview', 1, remove=('VERCEL_GIT_PREVIOUS_SHA',))
    check('ENV and PREVIOUS absent', 0, remove=('VERCEL_ENV', 'VERCEL_GIT_PREVIOUS_SHA'))
    check('unknown ENV', 0, environment='unknown')
    check('production with PREVIOUS absent', 0, environment='production',
          remove=('VERCEL_GIT_PREVIOUS_SHA',))
    binpath = temp / 'bash-only'
    binpath.mkdir()
    (binpath / 'bash').symlink_to(BASH)
    check('Git executable unavailable on preview', 1, updates={'PATH': str(binpath)})
    check('production with code and invalid previous', 0, environment='production', sha='bad')
    check('unknown ENV with code', 0, environment='staging')
    check('preview on another branch missing previous builds', 1, branch='other',
          remove=('VERCEL_GIT_PREVIOUS_SHA',))
    assert len(results) == 32

    def extra(name, expected, **kwargs):
        check(name, expected, group='expanded', **kwargs)

    # Valid but inappropriate Git objects, malformed SHA boundaries, detached HEAD.
    for value in ('a' * 39, 'a' * 41, 'g' * 40, base + '\n', ' ' + base,
                  base[:8], 'HEAD', '0' * 40):
        extra('reject previous ' + repr(value), 1, sha=value)
    extra('uppercase 40-hex commit accepted', 0, sha=governance.upper())
    extra('same previous as HEAD skips', 0, sha=governance)
    for obj in (git('rev-parse', 'HEAD^{tree}'), git('rev-parse', 'HEAD:' + CHECKPOINT)):
        extra('non-commit object ' + obj, 1, sha=obj)
    git('tag', '-a', 'fixture-tag', '-m', 'annotated tag')
    extra('tag object is not a previous commit', 1, sha=git('rev-parse', 'fixture-tag'))
    for path in ('apps/web/page.mjs', 'package.json', 'vercel.ts',
                 '.github/workflows/new.yml', 'unknown.file', 'docs/checkpoint.md',
                 CHECKPOINT + '.bak', 'apps/web/' + CHECKPOINT,
                 'docs/nested/Autonomous_Manager_Checkpoint_2026-10-18.md',
                 'tools/vercel/ignored-build.sh'):
        prior = git('rev-parse', 'HEAD')
        p = root / path
        previous_bytes = p.read_bytes() if p.exists() else b''
        put(root, path, previous_bytes + b'\n# changed\n')
        fixture.commit('synthetic path ' + path)
        extra('build path ' + path, 1, sha=prior)
    for action in ('delete', 'add', 'mode'):
        prior = git('rev-parse', 'HEAD')
        if action == 'delete':
            (root / CHECKPOINT).unlink()
        elif action == 'add':
            put(root, CHECKPOINT, 'new checkpoint\n')
        else:
            (root / CHECKPOINT).chmod(0o755)
        fixture.commit('checkpoint ' + action)
        extra('checkpoint only ' + action, 0, sha=prior)
    prior = git('rev-parse', 'HEAD')
    git('mv', CHECKPOINT, 'docs/moved.md')
    fixture.commit('checkpoint renamed out')
    extra('checkpoint rename out builds', 1, sha=prior)
    prior = git('rev-parse', 'HEAD')
    git('mv', 'docs/renamed.md', CHECKPOINT)
    fixture.commit('code renamed to excluded path')
    extra('code rename to exact checkpoint builds', 1, sha=prior)
    prior = git('rev-parse', 'HEAD')
    (root / CHECKPOINT).unlink()
    put(root, CHECKPOINT + '/unknown.md', 'unknown descendant\n')
    directory_head = fixture.commit('checkpoint file replaced by directory')
    extra('checkpoint becomes directory with unknown descendant', 1, sha=prior)
    git('rm', '-qr', '--', CHECKPOINT)
    put(root, CHECKPOINT, 'restored file\n')
    fixture.commit('checkpoint directory replaced by file')
    extra('checkpoint was directory at previous endpoint', 1, sha=directory_head)

    # Real file:// shallow clones; no network fetches. A depth-2 clone that
    # contains both endpoints and proves ancestry may safely skip checkpoint-only.
    shallow_source = Fixture(temp / 'shallow-source', env)
    put(shallow_source.root, CHECKPOINT, 'one\n')
    shallow_base = shallow_source.commit('shallow baseline')
    put(shallow_source.root, CHECKPOINT, 'two\n')
    shallow_parent = shallow_source.commit('shallow middle')
    put(shallow_source.root, CHECKPOINT, 'three\n')
    shallow_head = shallow_source.commit('shallow head')
    for depth, previous, expected in ((1, shallow_parent, 1), (2, shallow_parent, 0),
                                      (2, shallow_base, 1)):
        target = temp / ('depth-' + str(depth) + '-' + previous[:7])
        run([GIT, 'clone', '-q', '--depth=' + str(depth),
             shallow_source.root.as_uri(), str(target)], temp, env)
        extra('shallow depth ' + str(depth) + ' previous ' + previous[:7], expected,
              sha=previous, cwd=target)
    # The object exists, but the shallow boundary breaks the ancestry proof.
    boundary = temp / 'boundary'
    run([GIT, 'clone', '-q', '--no-local', shallow_source.root.as_uri(),
         str(boundary)], temp, env)
    (boundary / '.git/shallow').write_text(shallow_head + '\n')
    assert run([GIT, 'cat-file', '-t', shallow_base], boundary, env).stdout.strip() == 'commit'
    extra('present previous but shallow ancestry unavailable', 1,
          sha=shallow_base, cwd=boundary)

    # Fault injection returns actual Git errors, with a no-error control.
    wrapper_dir = temp / 'git-wrapper'
    wrapper_dir.mkdir()
    wrapper = put(wrapper_dir, 'git', '#!/bin/sh\n'
                  'if [ "$1" = "$FAIL_GIT" ]; then\n'
                  '  if [ "$FAIL_GIT" = cat-file ]; then printf "commit\\n"; fi\n'
                  '  exit 128\nfi\n'
                  'exec "$REAL_GIT" "$@"\n')
    wrapper.chmod(0o755)
    for operation in ('none', 'rev-parse', 'cat-file', 'merge-base', 'ls-tree', 'diff'):
        extra('Git fault ' + operation, 0 if operation == 'none' else 1,
              sha=shallow_parent, cwd=shallow_source.root,
              updates={'PATH': str(wrapper_dir) + os.pathsep + env['PATH'],
                       'FAIL_GIT': operation, 'REAL_GIT': GIT})

    # Both the Dashboard /bin/sh entry and Bash entry must protect non-preview
    # environments before even trying to load a missing/unreadable/broken script.
    bootstrap = temp / 'bootstrap'
    bootstrap.mkdir()
    target = put(bootstrap, 'tools/vercel/ignored-build.sh', b'')
    marker = bootstrap / 'executed'
    environments = ('production', '', None, 'unknown', 'staging', 'development', 'preview')
    for state in ('missing', 'unreadable', 'syntax-error', 'sentinel'):
        if target.exists():
            target.chmod(0o644)
            target.unlink()
        if state == 'unreadable':
            target.write_text('exit 0\n')
            target.chmod(0o000)
            if os.access(target, os.R_OK):
                raise RuntimeError('Unreadable-file acceptance requires a non-root user')
        elif state == 'syntax-error':
            target.write_text('if then\n')
        elif state == 'sentinel':
            target.write_text('printf called > executed\nexit 17\n')
        for shell in ('/bin/sh', BASH):
            for value in environments:
                marker.unlink(missing_ok=True)
                extra('bootstrap ' + state + ' ENV=' + repr(value) + ' shell=' + shell,
                      int(value == 'preview'), cwd=bootstrap,
                      environment=value or '', shell=shell,
                      remove=('VERCEL_ENV',) if value is None else ())
                if state == 'sentinel':
                    assert marker.exists() == (value == 'preview')
    target.chmod(0o644)
    empty_bin = temp / 'empty-bin'
    empty_bin.mkdir()
    for value in environments:
        extra('bootstrap missing Bash ENV=' + repr(value), int(value == 'preview'),
              cwd=bootstrap, environment=value or '', updates={'PATH': str(empty_bin)},
              remove=('VERCEL_ENV',) if value is None else ())
    # The inner script also guards ENV; this does not replace the outer guard.
    for value in environments:
        extra('direct script environment ' + repr(value), int(value == 'preview'),
              cwd=notrepo, direct=True, environment=value or '',
              remove=('VERCEL_ENV',) if value is None else ())

    if history_repo:
        for short in REAL_COMMITS:
            def real(*args):
                return run([GIT, *args], history_repo, env).stdout.strip()
            sha = real('rev-parse', short + '^{commit}')
            parent = real('rev-parse', sha + '^')
            changed = real('diff', '--no-renames', '--name-only', parent, sha).splitlines()
            assert changed == [CHECKPOINT], (sha, changed)
            content = {}
            blobs = {}
            for name, ref in (('before', parent), ('after', sha)):
                # Binary capture preserves exact bytes (including line endings).
                data = subprocess.check_output([GIT, 'show', ref + ':' + CHECKPOINT],
                                               cwd=history_repo, env=env, timeout=30)
                blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
                assert blob == real('rev-parse', ref + ':' + CHECKPOINT)
                content[name], blobs[name] = data, blob
            f = Fixture(temp / ('real-' + short), env)
            put(f.root, CHECKPOINT, content['before'])
            previous = f.commit('synthetic parent with exact real blob')
            put(f.root, CHECKPOINT, content['after'])
            f.commit('synthetic child with exact real blob')
            assert f.git('diff', '--name-only', previous, 'HEAD') == CHECKPOINT
            check('real content ' + short, 0, sha=previous, cwd=f.root,
                  group='real-content', metadata={'real_commit': sha, 'real_parent': parent,
                     'before_blob': blobs['before'], 'after_blob': blobs['after'],
                     'fixture_commit_ids_synthetic': True})
            # Also run against the actual historical objects, in an isolated
            # no-checkout clone with the historical detached HEAD and new script.
            actual = temp / ('actual-' + short)
            run([GIT, 'clone', '-q', '--no-hardlinks', '--no-checkout',
                 str(history_repo), str(actual)], temp, env)
            run([GIT, 'update-ref', '--no-deref', 'HEAD', sha], actual, env)
            put(actual, 'tools/vercel/ignored-build.sh', SCRIPT.read_bytes())
            extra('actual historical range ' + short, 0, sha=parent, cwd=actual,
                  metadata={'real_commit': sha, 'real_parent': parent})

    groups = {group: {'passed': sum(r['passed'] for r in results if r['group'] == group),
                      'total': sum(r['group'] == group for r in results)}
              for group in sorted({r['group'] for r in results})}
    return {'command': COMMAND, 'command_characters': len(COMMAND),
            'command_bytes': len(COMMAND.encode()), 'groups': groups,
            'real_cases': 'executed' if history_repo else 'NOT RUN (no --history-repo)',
            'passed': sum(r['passed'] for r in results), 'total': len(results),
            'cases': results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--history-repo', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    assert GIT and BASH, 'git and bash are required'
    assert '\n' not in COMMAND and len(COMMAND.encode()) <= 256
    run([BASH, '-n', str(SCRIPT)], HERE, os.environ)
    with tempfile.TemporaryDirectory(prefix='growth-vercel-test-') as directory:
        result = acceptance(Path(directory), args.history_repo.resolve() if args.history_repo else None)
    text = json.dumps(result, indent=2) + '\n'
    if args.output:
        args.output.write_text(text)
    print(text, end='')
    if result['passed'] != result['total']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
