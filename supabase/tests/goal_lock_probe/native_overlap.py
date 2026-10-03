"""Synthetic local PostgreSQL proof only; no existing daemon, network, or secrets."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import select
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parent
ORG = '93a88055-0a0b-40c0-b22f-a6d312320001'
OWNER = 'e85f1a90-3565-4fc1-a7e0-3b7d08830d0e'
GOAL = '5055ca31-40cc-435d-9f52-cdf19166440c'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pg-bin', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    binaries = Path(args.pg_bin)
    child_env = os.environ.copy()
    child_env['TZ'] = 'GMT'
    # Unlinked Homebrew keg: use its own existing library directory for children.
    # No symlink, install, global environment or unrelated daemon is changed.
    libraries = binaries.parent / 'lib' / 'postgresql@14'
    if libraries.is_dir():
        child_env['DYLD_LIBRARY_PATH'] = str(libraries)
    for name in ['postgres', 'initdb', 'pg_ctl', 'psql']:
        if not (binaries / name).is_file():
            raise RuntimeError('Required existing binary missing: ' + name)
    sessions = []
    started = False
    proof = {'scope': 'isolated synthetic local PostgreSQL only', 'completed': False}
    with tempfile.TemporaryDirectory(prefix='growth-os-lock-', dir='/private/tmp') as temp:
        folder = Path(temp)
        folder.chmod(0o700)
        # Keg is unlinked: make a task-only relocatable runtime layout using
        # exact copies of installed binaries and links to existing share/libs.
        # Everything resides below this TemporaryDirectory and is removed.
        installed = binaries
        binaries = folder / 'bin'
        binaries.mkdir(mode=0o700)
        for name in ['postgres', 'initdb', 'pg_ctl', 'psql']:
            shutil.copy2(installed / name, binaries / name)
        for name in ['share', 'lib']:
            (folder / name).mkdir(mode=0o700)
            (folder / name / 'postgresql@14').symlink_to(installed.parent / name / 'postgresql@14', target_is_directory=True)
        data, socket = folder / 'data', folder / 'socket'
        socket.mkdir(mode=0o700)
        def run(command, **kwargs):
            result = subprocess.run(command, text=True, capture_output=True, timeout=30, env=child_env, **kwargs)
            if result.returncode:
                raise RuntimeError(Path(command[0]).name + ': ' + result.stderr[:1500])
            return result
        try:
            run([str(binaries / 'initdb'), '-D', str(data), '-U', 'postgres',
                 '-L', str(binaries.parent / 'share' / 'postgresql@14'), '--auth-local=trust', '--auth-host=reject'])
            run([str(binaries / 'pg_ctl'), '-D', str(data), '-l', str(folder / 'server.log'),
                 '-o', f"-k {socket} -p 55439 -c listen_addresses='' -c unix_socket_permissions=0700", '-w', 'start'])
            started = True
            base = [str(binaries / 'psql'), '-X', '-h', str(socket), '-p', '55439', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']
            def sql(command):
                return run(base + ['-U', 'postgres'], input=command).stdout.strip()
            init = """create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid$$;
grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
alter default privileges in schema public grant all on tables to anon,authenticated;"""
            for name in ['202609280001_initial.sql', '202609280002_tenant_rls.sql',
                         '20260930112010_growth_goal_intake.sql', '20260930140406_growth_goal_conflict_http.sql']:
                init += (ROOT.parent.parent / 'migrations' / name).read_text().replace('create extension if not exists pgcrypto;', '')
            init += f"""insert into auth.users values('{OWNER}');
insert into public.organizations(id,name,business_model) values('{ORG}','Synthetic local lock A','ecommerce');
insert into public.organization_members values('{ORG}','{OWNER}','owner');
insert into public.growth_goals values('{GOAL}','{ORG}','{OWNER}',now());
insert into public.growth_goal_turns(organization_id,goal_id,actor_user_id,request_id,version_number,question_key,question_text,answer_text)
select '{ORG}','{GOAL}','{OWNER}',gen_random_uuid(),n,
(array['goal','offering','audience','market','channel','asset','metric','confirm','audience','confirm','audience','audience','audience'])[n],
'synthetic seed','synthetic seed '||n from generate_series(1,13)n;"""
            sql(init)
            start = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=1)
            deadline = start + dt.timedelta(hours=2)
            def render(name):
                return (ROOT / name).read_text().replace('__PROBE_START__', start.isoformat()).replace('__PROBE_DEADLINE__', deadline.isoformat())
            sql(render('create.sql.template'))
            # Local trust is limited to a private 0700 Unix socket, no host listeners.
            # This validates actual SQL LOGIN identity, never a remote password/SSO.
            sql(render('activate.sql.template'))
            history_sql = "select jsonb_agg(to_jsonb(t) order by version_number) from public.growth_goal_turns t;"
            before = sql(history_sql)
            class Session:
                def __init__(self, label):
                    self.process = subprocess.Popen(base + ['-U', 'growth_os_probe_login'], stdin=subprocess.PIPE,
                                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=child_env)
                    self.buffer = b''
                    self.counter = 0
                    self.pending = None
                    sessions.append(self)
                    self.command(f"set application_name='growth_probe_{label}';set statement_timeout='15s';set idle_in_transaction_session_timeout='30s';")
                    self.pid = int(self.command('select pg_backend_pid();').strip())
                    identity = self.command('select session_user||\'/\'||current_user;').strip()
                    if identity != 'growth_os_probe_login/growth_os_probe_login':
                        raise RuntimeError('Unexpected native session identity')
                def send(self, command):
                    if self.pending:
                        raise RuntimeError('Previous query pending')
                    self.counter += 1
                    self.pending = f'PROBE_END_{self.counter}'
                    self.process.stdin.write((command + '\n\\echo ' + self.pending + '\n').encode())
                    self.process.stdin.flush()
                def receive(self, timeout=20):
                    limit = time.monotonic() + timeout
                    marker = self.pending.encode() + b'\n'
                    while marker not in self.buffer:
                        remaining = limit - time.monotonic()
                        if remaining <= 0:
                            raise TimeoutError('Native query deadline')
                        ready, _, _ = select.select([self.process.stdout], [], [], min(remaining, 0.5))
                        if ready:
                            chunk = os.read(self.process.stdout.fileno(), 65536)
                            if not chunk:
                                raise RuntimeError(self.process.stderr.read().decode()[:1000])
                            self.buffer += chunk
                    output, self.buffer = self.buffer.split(marker, 1)
                    self.pending = None
                    return output.decode().strip()
                def command(self, command):
                    self.send(command)
                    return self.receive()
            a, b, c = [Session(label) for label in ['A', 'B', 'C']]
            assert len({a.pid, b.pid, c.pid}) == 3
            a.command('begin;')
            first = json.loads(a.command('select growth_os_probe.append_fixture_turn();'))
            assert first['version_number'] == 14
            b.command('begin;')
            b.send('select growth_os_probe.append_fixture_turn();')
            observation = None
            until = time.monotonic() + 4
            while time.monotonic() < until:
                rows = json.loads(c.command("select coalesce(jsonb_agg(jsonb_build_object('pid',pid,'state',state,'wait_event_type',wait_event_type,'blockers',pg_blocking_pids(pid),'observed_at',clock_timestamp())),'[]'::jsonb) from pg_stat_activity where usename='growth_os_probe_login';"))
                observation = next((row for row in rows if row['pid'] == b.pid and row['wait_event_type'] == 'Lock' and a.pid in row['blockers']), None)
                if observation:
                    break
                time.sleep(0.025)
            assert observation, 'B lock wait with A blocker not observed'
            a.command('rollback;')
            second = json.loads(b.receive())
            assert second['version_number'] == 14
            b.command('rollback;')
            assert sql(history_sql) == before
            assert sql('select count(*) from public.audit_events;') == '0'
            proof.update(completed=True, postgres_version=sql('select version();'), holder_pid=a.pid,
                         contender_pid=b.pid, observer_pid=c.pid, overlap=observation,
                         holder_rollback=True, contender_rollback=True, history_13_unchanged=True,
                         audit_no_residue=True, session_user='growth_os_probe_login',
                         limitations=['Synthetic local claims and fixtures only', 'No remote Supabase, password authentication or pooler proof'])
            # Connections must close before the exact probe cleanup.
            for session in sessions:
                session.process.stdin.write(b'\\q\n')
                session.process.stdin.flush()
                session.process.wait(timeout=5)
            sql((ROOT / 'cleanup.sql').read_text())
            proof['probe_cleanup_passed'] = True
        except Exception as error:
            proof['error'] = str(error)
            proof['temporary_path'] = str(folder)
            raise
        finally:
            for session in sessions:
                if session.process.poll() is None:
                    session.process.terminate()
                    session.process.wait(timeout=5)
            if started:
                run([str(binaries / 'pg_ctl'), '-D', str(data), '-m', 'immediate', '-w', 'stop'])
                proof['temporary_cluster_stopped'] = True
            Path(args.output).write_text(json.dumps(proof, indent=2))
    proof['temporary_files_removed'] = True
    Path(args.output).write_text(json.dumps(proof, indent=2))
    print(json.dumps(proof, indent=2))

if __name__ == '__main__':
    main()
