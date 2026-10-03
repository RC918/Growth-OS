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

def invariants():
    tables = query("select tablename from pg_tables where schemaname='public' order by tablename;").splitlines()
    assert len(tables) == 20
    business = {}
    for table in tables:
        assert table.replace('_', '').isalpha()
        business[table] = json.loads(query(f"select json_build_object('count',count(*),'hash',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex')) from public.\"{table}\" t;"))
    metadata = query("select json_build_object('tables',(select json_agg(x) from (select n.nspname,c.relname,c.relrowsecurity,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','private') order by 1,2) x),'functions',(select json_agg(x) from (select n.nspname,p.proname,p.proowner,p.proacl::text,p.proconfig,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname in ('public','private') order by 1,2,p.oid) x),'policies',(select json_agg(x) from (select * from pg_policies order by schemaname,tablename,policyname) x),'defaults',(select json_agg(x) from (select * from pg_default_acl order by oid) x),'roles',(select json_agg(x) from (select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls from pg_roles order by rolname) x),'constraints',(select json_agg(x) from (select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='private.model_trial'::regclass and conname<>'model_trial_check1' order by conname) x));")
    return {'business': business, 'metadata': json.loads(metadata), 'money': state(),
            'attempts': int(query('select count(*) from private.model_trial_attempts;'))}

def blocked(holder, contender):
    until = time.monotonic() + 3
    while time.monotonic() < until:
        raw = query(f"select json_build_object('holder',h.pid,'contender',b.pid,'observer',pg_backend_pid(),'wait',b.wait_event_type) from pg_stat_activity h,pg_stat_activity b where h.application_name='{holder}' and b.application_name='{contender}' and b.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(b.pid));")
        if raw:
            proof = json.loads(raw)
            assert len({proof['holder'], proof['contender'], proof['observer']}) == 3
            return proof
        time.sleep(.05)
    raise AssertionError('No independent readiness blocking proof')

try:
    subprocess.run(['docker', 'run', '--detach', '--rm', '--network', 'none',
                    '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
                    'postgres:17.6@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929', 'postgres', '-c', 'listen_addresses='],
                   check=True, stdout=subprocess.DEVNULL, timeout=120)
    until = time.monotonic() + 40
    while True:
        try:
            # Ignore the bootstrap server; entrypoint restarts it before exec.
            process = subprocess.run(['docker', 'exec', name, 'cat', '/proc/1/comm'], text=True, capture_output=True, check=True, timeout=10)
            if process.stdout.strip() != 'postgres':
                if time.monotonic() >= until:
                    raise AssertionError('Final server did not start')
                time.sleep(.2)
                continue
            query('select 1;')
            break
        except subprocess.CalledProcessError:
            if time.monotonic() >= until:
                raise
            time.sleep(.2)
    assert query('show server_version;').startswith('17.6')
    assert query('show listen_addresses;') == ''
    query("create schema auth;create role anon nologin;create role authenticated nologin;create role service_role nologin;"
          "create table auth.users(id uuid primary key);"
          "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;"
          "grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;")
    patch_file = root / 'migrations/20261001120704_growth_model_trial_bounded_deadline.sql'
    for migration in sorted((root / 'migrations').glob('*.sql')):
        if migration.name < patch_file.name:
            query(migration.read_text())
    query(f"insert into auth.users values('{actor}');insert into organizations(id,name,business_model) values('{org}','Synthetic native deadline','trade');insert into organization_members values('{org}','{actor}','owner');")
    protected = invariants()
    query(patch_file.read_text())
    assert invariants() == protected, 'Constraint migration changed protected state'
    assert state() == {'calls': 0, 'held': 0, 'spent': 0, 'active': None}
    template = (Path(__file__).parent / 'activate.sql.template').read_text()
    for key, value in {'__READY_POLICY__': 'gpt41mini-20250414-v2-postusage', '__RUNTIME_REVIEWED__': 'confirmed', '__ACTOR_UUID__': actor, '__ORG_UUID__': org}.items():
        template = template.replace(key, value)
    # Test-only replacement avoids expiring CI after the real human cutoff C.
    template = template.replace("TIMESTAMPTZ '2026-10-07T11:50:00Z'", "statement_timestamp()+interval '3 days'")
    for cutoff in ["clock_timestamp()-interval '1 minute'", "clock_timestamp()+interval '2 minutes'", "ready_at+interval '3 minutes'"]:
        too_short = subprocess.run(argv(), input=template.replace("statement_timestamp()+interval '3 days'", cutoff), text=True, capture_output=True, timeout=10)
        assert too_short.returncode != 0 and 'Insufficient trial window' in too_short.stderr
        assert invariants() == protected, 'Rejected activation changed protected state'
    for end in ["NULL", "statement_timestamp()", "statement_timestamp()-interval '1 second'", "statement_timestamp()+interval '7 days 1 second'"]:
        bad = subprocess.run(argv(), input=f"update private.model_trial set actor_user_id='{actor}',organization_id='{org}',state='active',starts_at=statement_timestamp(),deadline={end};", text=True, capture_output=True, timeout=10)
        assert bad.returncode != 0 and 'model_trial_check1' in bad.stderr
        assert invariants() == protected
    for end in ["statement_timestamp()+interval '4 minutes'", "statement_timestamp()+interval '7 days'"]:
        query(f"begin;update private.model_trial set actor_user_id='{actor}',organization_id='{org}',state='active',starts_at=statement_timestamp(),deadline={end};rollback;")
        assert invariants() == protected
    activation_a = subprocess.Popen(argv('ready-holder'), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    activation_a.stdin.write(template.replace('COMMIT;', 'SELECT pg_sleep(4);COMMIT;'))
    activation_a.stdin.close()
    until = time.monotonic() + 3
    while query("select exists(select from pg_stat_activity where application_name='ready-holder' and wait_event='PgSleep');") != 't':
        if time.monotonic() >= until:
            raise AssertionError('Ready holder barrier missing')
        time.sleep(.05)
    activation_b = subprocess.Popen(argv('ready-contender'), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    activation_b.stdin.write(template)
    activation_b.stdin.close()
    readiness_overlap = blocked('ready-holder', 'ready-contender')
    assert activation_a.wait(timeout=10) == 0, activation_a.stderr.read()
    assert activation_b.wait(timeout=10) != 0 and 'Staging state differs' in activation_b.stderr.read()
    activation_clock = query("select json_build_object('start',starts_at,'deadline',deadline,'within_cap',deadline>starts_at and deadline<=starts_at+interval '3 days') from private.model_trial;")
    assert json.loads(activation_clock)['within_cap'] is True
    repeated = subprocess.run(argv(), input=template, text=True, capture_output=True, timeout=10)
    assert repeated.returncode != 0 and 'Staging state differs' in repeated.stderr
    assert query("select json_build_object('start',starts_at,'deadline',deadline,'within_cap',deadline>starts_at and deadline<=starts_at+interval '3 days') from private.model_trial;") == activation_clock
    assert invariants() == protected, 'Activation changed protected accounting/business/security'
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
                      'reservation_rollback_atomic': True, 'simultaneous_ready_no_extension': True, 'readiness_lock_overlap': readiness_overlap,
                      'repeat_activation_no_extension': True, 'deadline_boundary_cases': True,
                      'all20_business_hashes_security_and_zero_counters_unchanged': True,
                      'activation_clock': json.loads(activation_clock), 'production_cutoff_replaced_only_in_offline_copy': True, 'cloud_calls': 0}))
finally:
    subprocess.run(['docker', 'rm', '--force', name], capture_output=True, timeout=20)
