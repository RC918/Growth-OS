"""Ephemeral PG17 test only: Unix sockets, no network/ports/credentials/cloud."""
import json
from pathlib import Path
import subprocess
import time
import uuid

name = 'growth-model-ledger-' + uuid.uuid4().hex[:12]
actor = '11111111-1111-4111-8111-111111111111'
org = '22222222-2222-4222-8222-222222222222'
root = Path(__file__).resolve().parents[2]

def argv(app='ledger-observer'):
    return ['docker', 'exec', '-i', '-e', 'PGAPPNAME=' + app, name,
            'psql', '-X', '-w', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']

def query(sql, app='ledger-observer'):
    return subprocess.run(argv(app), input=sql, text=True, capture_output=True,
                          check=True, timeout=20).stdout.strip()

def reserve(n):
    return "select public.model_trial_reserve('aaaaaaaa-aaaa-4aaa-8aaa-%012d','%s','%s','synth-parts-v1','%s',1);" % (n, actor, org, 'a' * 64)

def state():
    return json.loads(query("select json_build_object('calls',calls_reserved,'held',held_nusd,'spent',spent_nusd,'active',active_request) from private.model_trial;"))

try:
    subprocess.run(['docker', 'run', '--detach', '--rm', '--network', 'none',
                    '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
                    'postgres:17.6', 'postgres', '-c', 'listen_addresses='],
                   check=True, stdout=subprocess.DEVNULL, timeout=120)
    until = time.monotonic() + 40
    while True:
        try:
            query('select 1;')
            break
        except subprocess.CalledProcessError:
            if time.monotonic() >= until:
                raise
            time.sleep(.2)
    assert query('show server_version;').startswith('17.6')
    assert query('show listen_addresses;') == ''
    query("create schema auth;create schema private;create role anon nologin;create role authenticated nologin;create role service_role nologin;"
          "create table auth.users(id uuid primary key);create table organizations(id uuid primary key);"
          "create table organization_members(organization_id uuid,user_id uuid,role text);"
          f"insert into auth.users values('{actor}');insert into organizations values('{org}');insert into organization_members values('{org}','{actor}','owner');")
    query((root / 'migrations/20261001083611_growth_model_trial_budget.sql').read_text())
    assert state() == {'calls': 0, 'held': 0, 'spent': 0, 'active': None}
    template = (Path(__file__).parent / 'activate.sql.template').read_text()
    for key, value in {'__READY_POLICY__': 'gpt41mini-20250414-v1', '__COUNTING_ZERO_EXTRA_CHARGE__': 'confirmed',
                       '__RUNTIME_REVIEWED__': 'confirmed', '__ACTOR_UUID__': actor, '__ORG_UUID__': org}.items():
        template = template.replace(key, value)
    query(template)
    # A holds the real row lock; B is an independent backend. C observes blocking.
    a = subprocess.Popen(argv('ledger-holder'), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    a.stdin.write('begin;set local role service_role;' + reserve(1) + 'select pg_sleep(4);commit;\n')
    a.stdin.close()
    until = time.monotonic() + 3
    while query("select exists(select from pg_stat_activity where application_name='ledger-holder' and wait_event='PgSleep');") != 't':
        if time.monotonic() >= until:
            raise AssertionError('Holder barrier missing')
        time.sleep(.05)
    b = subprocess.Popen(argv('ledger-contender'), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    b.stdin.write('set role service_role;' + reserve(2) + '\n')
    b.stdin.close()
    observed = None
    until = time.monotonic() + 3
    while time.monotonic() < until:
        raw = query("select json_build_object('holder',h.pid,'contender',b.pid,'observer',pg_backend_pid(),'wait',b.wait_event_type) from pg_stat_activity h,pg_stat_activity b where h.application_name='ledger-holder' and b.application_name='ledger-contender' and b.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(b.pid));")
        if raw:
            observed = json.loads(raw)
            break
        time.sleep(.05)
    assert observed and len({observed['holder'], observed['contender'], observed['observer']}) == 3, 'No independent blocking proof'
    assert a.wait(timeout=10) == 0, a.stderr.read()
    assert b.wait(timeout=10) != 0
    assert 'Trial busy' in b.stderr.read()
    assert state()['calls'] == 2 and state()['held'] == 420668800
    query("set role service_role;select public.model_trial_settle('aaaaaaaa-aaaa-4aaa-8aaa-000000000001',1000,100,'ok');")
    assert state()['spent'] == 560000 and state()['held'] == 0
    before = state()
    failed = subprocess.run(argv(), input='begin;set local role service_role;' + reserve(3) + 'select 1/0;commit;', text=True, capture_output=True, timeout=20)
    assert failed.returncode != 0 and state() == before, 'Partial reservation persisted after rollback'
    print(json.dumps({'runtime': 'PostgreSQL 17.6', 'network': 'none', 'tcp_listener': False,
                      'real_lock_overlap': observed, 'one_dispatch_only': True,
                      'reservation_rollback_atomic': True, 'cloud_calls': 0}))
finally:
    subprocess.run(['docker', 'rm', '--force', name], capture_output=True, timeout=20)
