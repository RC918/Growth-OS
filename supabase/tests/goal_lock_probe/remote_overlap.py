"""HUMAN-run psql controller. Never reads, forwards, or stores a password.

psql -W alone uses the controlling /dev/tty with echo disabled. Controller
pipes contain only fixed SQL and non-secret query results. No credential API.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parent
PSQL = '/opt/homebrew/bin/psql'
OPENSSL = '/opt/homebrew/bin/openssl'
HOST = 'aws-0-ap-southeast-1.pooler.supabase.com'
ROLE = 'growth_os_probe_login'
PROJECT = 'vhzryhibmpvglzcmfnaa'
FINGERPRINT = 'sha256 Fingerprint=80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA'
APPEND = 'select growth_os_probe.append_fixture_turn();'
OBSERVE = """select coalesce(jsonb_agg(jsonb_build_object('pid',pid,'state',state,
 'wait_event_type',wait_event_type,'blockers',pg_blocking_pids(pid),
 'observed_at',clock_timestamp())),'[]'::jsonb) from pg_stat_activity
 where usename='growth_os_probe_login';"""


def check_window(path, now=None):
    data = json.loads(Path(path).read_text())
    if data.get('approved') is not True or data.get('project') != PROJECT:
        raise ValueError('Reviewed explicit window approval for this project required')
    start = dt.datetime.fromisoformat(data['start'].replace('Z', '+00:00'))
    end = dt.datetime.fromisoformat(data['deadline'].replace('Z', '+00:00'))
    if start.utcoffset() != dt.timedelta(0) or end.utcoffset() != dt.timedelta(0):
        raise ValueError('Window must be exact UTC')
    now = now or dt.datetime.now(dt.timezone.utc)
    if end - start != dt.timedelta(hours=2) or not start <= now < end - dt.timedelta(minutes=15):
        raise ValueError('Window not started, expired, or less than 15 minutes remains')
    return {'start': data['start'], 'deadline': data['deadline']}, end


def environment(empty_passfile):
    # Whitelist: no inherited PGPASSWORD, connection URI, service, PGOPTIONS,
    # SSL overrides, saved password source, or unrelated credential environment.
    return {'PATH': '/opt/homebrew/bin:/usr/bin:/bin', 'LC_ALL': 'C',
            'PGPASSFILE': str(empty_passfile), 'PGCONNECT_TIMEOUT': '15',
            'PGSSLMODE': 'verify-full', 'PGSSLROOTCERT': str(ROOT / 'prod-ca-2021.crt')}


def command_args(role):
    return [PSQL, '-X', '-W', '-qAt', '-h', HOST, '-p', '5432', '-d', 'postgres',
            '-U', role + '.' + PROJECT, '-v', 'ON_ERROR_STOP=1']


class Session:
    def __init__(self, label, env, sessions):
        print('本人輸入 probe 密碼：連線 ' + label, flush=True)
        self.process = subprocess.Popen(command_args(ROLE), stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=None, env=env)
        sessions.append(self)  # Also close sessions whose authentication fails.
        self.pending = None
        self.buffer = b''
        self.send("select jsonb_build_object('pid',pg_backend_pid(),'session_user',session_user,'current_user',current_user);")
        identity = json.loads(self.receive(180))
        if identity['session_user'] != ROLE or identity['current_user'] != ROLE:
            raise ValueError('Unexpected session identity')
        self.pid = identity['pid']
        self.command("set application_name='growth_probe_" + label + "';set statement_timeout='15s';"
                     "set lock_timeout='5s';set idle_in_transaction_session_timeout='30s';")

    def send(self, sql):
        if self.pending is not None:
            raise RuntimeError('Query already pending')
        self.pending = 'PROBE_END_' + uuid.uuid4().hex
        self.process.stdin.write((sql + '\n\\echo ' + self.pending + '\n').encode())
        self.process.stdin.flush()

    def receive(self, timeout=20):
        end = time.monotonic() + timeout
        marker = (self.pending + '\n').encode()
        while marker not in self.buffer:
            remaining = end - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('Controller deadline')
            ready, _, _ = select.select([self.process.stdout], [], [], min(remaining, 0.25))
            if ready:
                chunk = os.read(self.process.stdout.fileno(), 65536)
                if not chunk:
                    raise RuntimeError('psql failed; see Terminal error, not captured')
                self.buffer += chunk
                if len(self.buffer) > 65536:
                    raise RuntimeError('Unexpected response size')
        result, self.buffer = self.buffer.split(marker, 1)
        self.pending = None
        return result.decode().strip()

    def command(self, sql):
        self.send(sql)
        return self.receive()

    def close(self):
        # EOF/termination disconnect rolls back even when SQL is blocked/failed.
        if self.process.poll() is None:
            self.process.stdin.close()
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.terminate()
                try:
                    self.process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=2)
        self.process.stdout.close()


def overlap(a, b, c, proof):
    if len({a.pid, b.pid, c.pid}) != 3:
        raise ValueError('Three independent backend PIDs required')
    proof['pids'] = {'A': a.pid, 'B': b.pid, 'C': c.pid}
    a.command('begin;')
    first = json.loads(a.command(APPEND))
    if first.get('version_number') != 14:
        raise ValueError('Unexpected holder version')
    b.command('begin;')
    b.send(APPEND)
    end = time.monotonic() + 4
    observation = None
    while time.monotonic() < end:
        rows = json.loads(c.command(OBSERVE))
        observation = next((r for r in rows if r['pid'] == b.pid and
                            r['wait_event_type'] == 'Lock' and a.pid in r['blockers']), None)
        if observation:
            break
        time.sleep(0.025)
    if observation is None:
        raise ValueError('No simultaneous B Lock / A blocker evidence')
    proof['overlap'] = observation
    a.command('rollback;')
    proof['holder_rollback'] = True
    second = json.loads(b.receive())
    if second.get('version_number') != 14:
        raise ValueError('Unexpected contender version after rollback')
    b.command('rollback;')
    proof['contender_rollback'] = True
    proof['overlap_observed'] = True


def run_session_phase(factory, env, proof, end):
    sessions = []
    try:
        a, b, c = [factory(label, env, sessions) for label in ['A', 'B', 'C']]
        if dt.datetime.now(dt.timezone.utc) >= end - dt.timedelta(minutes=2):
            raise TimeoutError('Insufficient window remaining after human authentication')
        overlap(a, b, c, proof)
    finally:
        for session in sessions:
            try:
                session.close()
            except Exception:
                proof['session_close_error'] = True
        proof['client_connections_closed'] = all(s.process.poll() is not None for s in sessions)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--window', required=True, help='reviewed, approved UTC window JSON; no secret')
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    # BEFORE authentication. If already activated, supervisor must cleanup on
    # failure here; this program cannot authenticate without human passwords.
    try:
        window, end = check_window(args.window)
        if not sys.stdin.isatty():
            raise RuntimeError('Human controlling Terminal required; no piped credential input')
        with open('/dev/tty', 'rb'):
            pass
        ca = subprocess.check_output([OPENSSL, 'x509', '-in', str(ROOT / 'prod-ca-2021.crt'),
                                      '-noout', '-fingerprint', '-sha256'], text=True).strip()
        if ca != FINGERPRINT:
            raise ValueError('Official CA fingerprint differs')
        output = Path(args.output_dir)
        output.mkdir(parents=True, exist_ok=True)
    except (Exception, KeyboardInterrupt) as error:
        print('前置檢查失敗（' + type(error).__name__ + '），未嘗試登入。')
        print('若窗口已啟用：停止並通知主管立即以既有管理 MCP 執行 cleanup.sql。不要開新窗口或延長。')
        return 1
    destination = output / ('Growth-OS-probe-overlap-' + uuid.uuid4().hex + '.json')
    proof = {'window': window, 'overlap_observed': False, 'cleanup_exit_code': None,
             'full_acceptance': False, 'remote_history_readback_pending': True}
    with tempfile.TemporaryDirectory(prefix='growth-os-empty-passfile-') as temp:
        empty = Path(temp) / 'empty'
        empty.touch(mode=0o600)
        env = environment(empty)
        try:
            run_session_phase(Session, env, proof, end)
        except (Exception, KeyboardInterrupt) as error:
            # Exception text/tracebacks and stderr are not saved as evidence.
            proof['failure_type'] = type(error).__name__
            print('未完成 overlap；已停止，將關閉三連線並清理。', flush=True)
        finally:
            save_proof(destination, proof)
            print('本人輸入管理密碼一次：只執行既有精確 cleanup，不啟用窗口。', flush=True)
            # Fourth connection is the human administrator, after A/B/C close.
            # Inherited TTY, no controller capture of prompt or password.
            human_cleanup(env, proof)
            save_proof(destination, proof)
    print('非敏感證據：' + str(destination), flush=True)
    print('需管理者唯讀核對原 13 筆歷史、audit 及角色/schema/session 撤回，才算完整驗收。')
    if proof['cleanup_exit_code'] != 0:
        print('清理未確認成功：主管須立即以既有管理 MCP 執行 cleanup.sql，勿等待 VALID UNTIL 自動關閉。')
    return 0 if (proof['overlap_observed'] and proof['cleanup_exit_code'] == 0
                 and proof['client_connections_closed'] and not proof.get('evidence_write_error')) else 1


def save_proof(destination, proof):
    try:
        destination.write_text(json.dumps(proof, indent=2))
    except OSError:
        # Evidence failure must not prevent closing sessions or cleanup prompt.
        proof['evidence_write_error'] = True
        print('證據檔無法寫入；繼續必要清理，不算通過。', flush=True)


def human_cleanup(env, proof):
    try:
        proof['cleanup_exit_code'] = subprocess.call(
            command_args('postgres') + ['-f', str(ROOT / 'cleanup.sql')], env=env)
    except (Exception, KeyboardInterrupt) as error:
        proof['cleanup_failure_type'] = type(error).__name__


if __name__ == '__main__':
    raise SystemExit(main())
