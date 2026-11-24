#!/usr/bin/env python3
"""Destructive synthetic fixture: runs ONLY in the named, networkless tmpfs container.

No Supabase Auth is involved; JWT claims are deliberately mocked. Run once on a
fresh container. All failures are fatal. Never point this at an existing DB.
"""
import hashlib
import json
import pathlib
import re
import subprocess
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
NAME = 'flowstate-sync-23b3-test'
DB = 'flowstate_sync_test_23b3'
A = '10000000-0000-4000-8000-000000000001'
B = '10000000-0000-4000-8000-000000000002'
SA = '11000000-0000-4000-8000-000000000001'
SB = '11000000-0000-4000-8000-000000000002'


def run(args, **kw):
    return subprocess.run(args, check=True, text=True, capture_output=True, timeout=25, **kw)


inspect = json.loads(run(['podman', 'inspect', NAME]).stdout)[0]
assert inspect['Config']['Image'] == 'docker.io/library/postgres:17'
assert inspect['HostConfig']['NetworkMode'] == 'none'
assert '/var/lib/postgresql/data' in inspect['HostConfig']['Tmpfs']
assert not any(inspect['NetworkSettings']['Ports'].values())


def command(app='flow_test_admin'):
    return ['podman', 'exec', '-i', '-e', f'PGAPPNAME={app}', NAME,
            'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DB]


def sql(s, app='flow_test_admin'):
    return run(command(app), input="set statement_timeout='12s'; set lock_timeout='8s';\n" + s).stdout.strip()


assert sql("select current_database() || ':' || coalesce(inet_server_addr()::text,'socket')") == DB + ':socket'
assert sql("select count(*) from pg_namespace where nspname in ('auth','flow_sync_private')") == '0'
setup = (ROOT / 'tests/task-sync-postgres.test.mjs').read_text()
setup = setup.split('await db.exec(`', 1)[1].split('`);', 1)[0]
for key, value in {'A': A, 'B': B, 'SA': SA, 'SB': SB,
                   'ORPHAN': '20000000-0000-4000-8000-000000000002',
                   'ORIGINAL': '20000000-0000-4000-8000-000000000003'}.items():
    setup = setup.replace('${' + key + '}', value)
assert '${' not in setup
sql(setup)


def draft(filename, message):
    s = (ROOT / 'supabase/proposals' / filename).read_text()
    guard = f"do $$ begin raise exception '{message}'; end $$;"
    assert s.count(guard) == 1 and re.search(r'rollback;\s*$', s, re.I)
    return re.sub(r'rollback;\s*$', 'commit;', s.replace(guard, ''), flags=re.I)


for file, msg in [
    ('flow23_3b_01_storage_DRAFT.sql', '23.3b draft: not a deployable migration'),
    ('flow23_3b_04_role_DRAFT.sql', '23.3b role draft: not a deployable migration'),
    ('flow23_3b_05_task_triggers_DRAFT.sql', '23.3b.1 trigger draft: not a deployable migration'),
    ('flow23_3b_06_auth_gates_DRAFT.sql', '23.3b.2 Auth gates draft: not a deployable migration'),
    ('flow23_3b_03_rpc_DRAFT.sql', '23.3b RPC draft: not a deployable migration')]:
    sql(draft(file, msg))

sql('''grant select(id) on auth.users to flow_task_identity_trigger;
alter function flow_sync_private.maintain_task_identity() owner to flow_task_identity_trigger;
revoke all on function flow_sync_private.maintain_task_identity() from public, anon, authenticated, service_role;
create trigger flow_task_identity before insert or update or delete on public.tasks for each row execute function flow_sync_private.maintain_task_identity();
alter function flow_sync_private.provision_auth_gate() owner to flow_auth_lifecycle_trigger;
revoke all on function flow_sync_private.provision_auth_gate() from public, anon, authenticated, service_role;
create trigger flow_user_gate after insert on auth.users for each row execute function flow_sync_private.provision_auth_gate();
create trigger flow_session_gate after insert on auth.sessions for each row execute function flow_sync_private.provision_auth_gate();
alter function public.apply_task_sync(jsonb) owner to flow_task_sync_executor;
revoke all on function public.apply_task_sync(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.apply_task_sync(jsonb) to authenticated;
revoke insert, update, delete on public.tasks from public, anon, authenticated;''')
assert sql("select session_policy_ready from flow_sync_private.protocol_readiness") == 'f'
assert subprocess.run(command(), input='update flow_sync_private.protocol_readiness set session_policy_ready=true;', text=True, capture_output=True).returncode != 0
# TEST COPY ONLY: the unimplemented production readiness policy stays guarded in the source.
sql('alter table flow_sync_private.protocol_readiness drop constraint flow_session_policy_not_implemented; update flow_sync_private.protocol_readiness set session_policy_ready=true;')


def gate(session):
    return json.loads(sql(f"select json_build_object('a',account_generation::text,'s',session_generation::text) from flow_sync_private.session_gate where session_id='{session}'"))


def claims(user, session):
    g = gate(session)
    return {'sub': user, 'session_id': session, 'flowstate_account_generation': g['a'],
            'flowstate_session_generation': g['s'], 'exp': int(time.time()) + 3600}


def request(g, kind, task, version=None, title='synthetic', nonce=None):
    nonce = nonce or str(uuid.uuid4())
    raw = bytearray(hashlib.sha256(f'flowstate.task-sync.v2:{g}:{nonce}'.encode()).digest()[:16])
    raw[6] = (raw[6] & 15) | 128
    raw[8] = (raw[8] & 63) | 128
    return {'protocol': 2, 'operation_id': str(uuid.UUID(bytes=bytes(raw))), 'operation_nonce': nonce,
            'task_id': task, 'kind': kind, 'account_generation': g, 'expected_version': version,
            'payload': None if kind == 'delete' else {'title': title}}


def prefix(jwt):
    return "set role authenticated; select set_config('request.jwt.claims', '" + json.dumps(jwt) + "', false);\n"


def call(jwt, req):
    return prefix(jwt) + "select public.apply_task_sync('" + json.dumps(req) + "'::jsonb);\n"


def result(output):
    lines = [x for x in output.splitlines() if x.startswith('{')]
    return json.loads(lines[-1])


def invoke(jwt, req):
    return result(sql(call(jwt, req)))


jwt = claims(A, SA)
g = jwt['flowstate_account_generation']
task = str(uuid.uuid4())
create = request(g, 'create', task)
first = invoke(jwt, create)
assert first['outcome'] == 'applied' and first['version'] == '1'
assert invoke(jwt, create) == first
assert invoke(jwt, dict(create, payload={'title': 'different'}))['reason'] == 'operation_id_unavailable'
assert invoke(jwt, request(g, 'update', task, '1'))['version'] == '2'
assert invoke(jwt, request(g, 'update', task, '1'))['reason'] == 'version'
assert invoke(claims(B, SB), request(gate(SB)['a'], 'update', task, '2'))['reason'] == 'not_found_or_forbidden'
assert subprocess.run(command(), input=prefix(jwt)+'select * from flow_sync_private.task_operations;', text=True, capture_output=True).returncode != 0
assert subprocess.run(command(), input=prefix(jwt)+f"update public.tasks set title='bypass' where id='{task}';", text=True, capture_output=True).returncode != 0
assert sql("select (not rolcanlogin and not rolbypassrls and not rolsuper)::text from pg_roles where rolname='flow_task_sync_executor'") == 'true'
assert sql("select has_function_privilege('anon','public.apply_task_sync(jsonb)','execute')::text") == 'false'
assert sql("select pg_has_role('authenticated','flow_task_sync_executor','member')::text") == 'false'
assert sql("select has_table_privilege('authenticated','auth.users','select')::text") == 'false'
assert sql("select has_table_privilege('authenticated','auth.sessions','select')::text") == 'false'
assert sql("select (proconfig = array['search_path=\"\"'])::text from pg_proc where oid='public.apply_task_sync(jsonb)'::regprocedure") == 'true'
assert subprocess.run(command(), input="set role anon; select public.apply_task_sync('{}'::jsonb);", text=True, capture_output=True).returncode != 0
failure = request(g, 'update', task, '2', 'must-roll-back')
sql(f"""create function flow_sync_private.fixture_reject() returns trigger language plpgsql as $$begin
  if new.operation_id = '{failure['operation_id']}'::uuid then raise exception 'fixture journal failure'; end if;
  return new; end$$;
  create trigger fixture_reject before insert on flow_sync_private.task_operations for each row execute function flow_sync_private.fixture_reject();""")
assert subprocess.run(command(), input=call(jwt, failure), text=True, capture_output=True).returncode != 0
assert sql(f"select version::text from public.tasks where id='{task}'") == '2'
assert sql(f"select version::text from flow_sync_private.task_identity where task_id='{task}'") == '2'
assert sql(f"select count(*) from flow_sync_private.task_operations where operation_id='{failure['operation_id']}'") == '0'
sql('drop trigger fixture_reject on flow_sync_private.task_operations;')
print('PASS: RPC create, version, replay, conflict, RLS and cutover grants', flush=True)


def start(statement, app):
    p = subprocess.Popen(command(app), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p.stdin.write("set statement_timeout='12s'; set lock_timeout='8s';\n" + statement)
    p.stdin.close()
    return p


def wait_for(app, kind):
    end = time.monotonic() + 6
    while time.monotonic() < end:
        q = f"select coalesce(wait_event_type,'') from pg_stat_activity where application_name='{app}' and state='active'"
        if sql(q) == kind:
            return
        time.sleep(.1)
    raise AssertionError(f'{app} did not reach wait_event_type={kind}')


def finish(p, success=True):
    p.wait(timeout=15)
    out, err = p.stdout.read(), p.stderr.read()
    if (p.returncode == 0) != success:
        raise AssertionError(f'psql exit {p.returncode}: {err}')
    return out, err


def race(a_sql, b_sql, b_success=True, a_end='commit'):
    a = start('begin;\n' + a_sql + f'\nselect pg_sleep(3); {a_end};', 'flow_test_a')
    wait_for('flow_test_a', 'Timeout')
    b = start('begin;\n' + b_sql + '\ncommit;', 'flow_test_b')
    wait_for('flow_test_b', 'Lock')
    ao, _ = finish(a)
    bo, be = finish(b, b_success)
    return ao, bo, be


same = request(g, 'update', task, '2')
ao, bo, _ = race(call(jwt, same), call(jwt, same))
assert result(ao) == result(bo) and result(bo)['version'] == '3'
assert sql(f"select count(*) from flow_sync_private.task_operations where operation_id='{same['operation_id']}'") == '1'
u1 = request(g, 'update', task, '3', 'one')
u2 = request(g, 'update', task, '3', 'two')
ao, bo, _ = race(call(jwt, u1), call(jwt, u2))
assert result(ao)['version'] == '4' and result(bo)['reason'] == 'version'
rollback_req = request(g, 'update', task, '4')
ao, bo, _ = race(call(jwt, rollback_req), call(jwt, rollback_req), a_end='rollback')
assert result(ao)['version'] == '5' and result(bo)['version'] == '5'
assert sql(f"select count(*) from flow_sync_private.task_operations where operation_id='{rollback_req['operation_id']}'") == '1'
print('PASS: two-connection replay, version race and rollback lock release', flush=True)

# Force the inverse task/account lock order in a disposable fixture to prove
# deadlock detection and rollback, not the absence of protocol deadlocks.
a = start(f"begin; select 1 from public.tasks where id='{task}' for update; select pg_sleep(3); select 1 from flow_sync_private.account_lifecycle where user_id='{A}' for update; commit;", 'flow_test_a')
wait_for('flow_test_a', 'Timeout')
b = start(f"begin; select 1 from flow_sync_private.account_lifecycle where user_id='{A}' for update; select 1 from public.tasks where id='{task}' for update; commit;", 'flow_test_b')
wait_for('flow_test_b', 'Lock')
a.wait(timeout=15); b.wait(timeout=15)
errors = a.stderr.read() + b.stderr.read()
assert sorted([a.returncode == 0, b.returncode == 0]) == [False, True]
assert 'deadlock detected' in errors
assert sql(f"select version::text from public.tasks where id='{task}'") == '5'
print('PASS: forced inverse-lock deadlock aborts one transaction', flush=True)

deletion = request(g, 'delete', task, '5')
assert invoke(jwt, deletion)['version'] == '6'
assert sql(f"select deleted::text from flow_sync_private.task_identity where task_id='{task}'") == 'true'
# RPC wins, DELETE blocks until RPC commits; the cascade then purges everything.
newtask = str(uuid.uuid4())
ao, _, _ = race(call(jwt, request(g, 'create', newtask)), f"delete from auth.users where id='{A}';")
assert result(ao)['outcome'] == 'applied'
for table in ['account_lifecycle', 'session_gate', 'task_identity', 'task_operations']:
    assert sql(f"select count(*) from flow_sync_private.{table} where user_id='{A}'") == '0'
assert sql(f"select count(*) from public.tasks where user_id='{A}'") == '0'
assert subprocess.run(command(), input=call(jwt, create), text=True, capture_output=True).returncode != 0
sql(f"insert into auth.users(id) values ('{A}'); insert into auth.sessions(id,user_id) values ('{SA}','{A}');")
newjwt = claims(A, SA)
assert newjwt['flowstate_account_generation'] != g
assert subprocess.run(command(), input=call(jwt, create), text=True, capture_output=True).returncode != 0
# Delete wins: RPC waits for cascade and is refused after commit.
_, _, err = race(f"delete from auth.users where id='{A}';", call(newjwt, request(newjwt['flowstate_account_generation'], 'create', str(uuid.uuid4()))), b_success=False)
assert 'authentication required' in err
print('PASS: tombstone, both RPC/account-deletion orders, UUID recreation', flush=True)
print('NOT TESTED: real Supabase Auth, PostgREST, or all possible protocol deadlocks', flush=True)
