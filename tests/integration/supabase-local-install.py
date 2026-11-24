#!/usr/bin/env python3
"""Install guarded drafts in one named disposable local Supabase fixture only.

Never accepts a URL or arbitrary database. Does NOT change the readiness guard.
Requires an empty locally initialised Supabase project; fails on repeated use.
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTAINER = 'supabase_db_flowstate-supabase-23b3'
PROJECT = 'flowstate-supabase-23b3'
WORKDIR = '/tmp/flowstate-supabase-23b3'


def run(args, **kwargs):
    try:
        return subprocess.run(args, check=True, text=True, capture_output=True, timeout=35, **kwargs).stdout
    except subprocess.CalledProcessError as error:
        print(error.stderr, file=sys.stderr)
        raise


meta = json.loads(run(['podman', 'inspect', CONTAINER]))[0]
labels = meta['Config']['Labels']
assert labels.get('com.supabase.cli.project') == PROJECT
assert labels.get('com.supabase.cli.workdir') == WORKDIR
assert meta['Config']['Image'].startswith('public.ecr.aws/supabase/postgres:')
assert pathlib.Path(WORKDIR, 'supabase', 'config.toml').is_file()
assert not pathlib.Path(WORKDIR, 'supabase', '.temp', 'project-ref').exists()
command = ['podman', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres']


def sql(statement):
    return run(command, input="set statement_timeout='15s'; set lock_timeout='5s';\n" + statement).strip()


assert sql("select coalesce(inet_server_addr()::text,'socket')") == 'socket'
finish = sys.argv[1:] == ['--finish-after-local-setup']
assert sys.argv[1:] in ([], ['--finish-after-local-setup'])
assert sql("select count(*) from pg_namespace where nspname='flow_sync_private'") == ('1' if finish else '0')
assert sql("select count(*) from auth.users") == '0'
assert sql("select count(*) from auth.sessions") == '0'
assert sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='tasks'") == ('1' if finish else '0')
if not finish:
    sql('''create table public.tasks(id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), title text, subject text,
deadline date, estimated_minutes integer, priority text, status text, user_id uuid references auth.users(id) on delete cascade);
alter table public.tasks enable row level security;
grant select,insert,update,delete on public.tasks to anon, authenticated;
create policy task_s on public.tasks for select to authenticated using (auth.uid()=user_id);
create policy task_i on public.tasks for insert to authenticated with check (auth.uid()=user_id);
create policy task_u on public.tasks for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy task_d on public.tasks for delete to authenticated using (auth.uid()=user_id);''')


def draft(filename, message):
    s = (ROOT / 'supabase/proposals' / filename).read_text()
    guard = f"do $$ begin raise exception '{message}'; end $$;"
    assert s.count(guard) == 1 and re.search(r'rollback;\s*$', s, re.I)
    return re.sub(r'rollback;\s*$', 'commit;', s.replace(guard, ''), flags=re.I)


for file, msg in ([] if finish else [
    ('flow23_3b_01_storage_DRAFT.sql', '23.3b draft: not a deployable migration'),
    ('flow23_3b_04_role_DRAFT.sql', '23.3b role draft: not a deployable migration'),
    ('flow23_3b_05_task_triggers_DRAFT.sql', '23.3b.1 trigger draft: not a deployable migration'),
    ('flow23_3b_06_auth_gates_DRAFT.sql', '23.3b.2 Auth gates draft: not a deployable migration'),
    ('flow23_3b_03_rpc_DRAFT.sql', '23.3b RPC draft: not a deployable migration')]):
    sql(draft(file, msg))
# Local-only superuser used for ownership transfer. This is not evidence that a
# hosted migration user has these privileges; postgres failed SET ROLE here.
command[command.index('postgres', command.index('-U') + 1)] = 'supabase_admin'
sql('''begin;
grant usage on schema auth to flow_task_identity_trigger, flow_task_sync_executor, flow_auth_lifecycle_trigger;
grant select(id) on auth.users to flow_task_identity_trigger;
alter function flow_sync_private.maintain_task_identity() owner to flow_task_identity_trigger;
revoke all on function flow_sync_private.maintain_task_identity() from public, anon, authenticated, service_role;
create trigger flow_task_identity before insert or update or delete on public.tasks for each row execute function flow_sync_private.maintain_task_identity();
alter function flow_sync_private.provision_auth_gate() owner to flow_auth_lifecycle_trigger;
revoke all on function flow_sync_private.provision_auth_gate() from public, anon, authenticated, service_role;
create trigger flow_user_gate after insert on auth.users for each row execute function flow_sync_private.provision_auth_gate();
create trigger flow_session_gate after insert on auth.sessions for each row execute function flow_sync_private.provision_auth_gate();
create trigger flow_user_immutable before update on auth.users for each row execute function flow_sync_private.provision_auth_gate();
create trigger flow_session_immutable before update on auth.sessions for each row execute function flow_sync_private.provision_auth_gate();
alter function public.apply_task_sync(jsonb) owner to flow_task_sync_executor;
revoke all on function public.apply_task_sync(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.apply_task_sync(jsonb) to authenticated;
commit;''')
assert sql('select session_policy_ready from flow_sync_private.protocol_readiness') == 'f'
print('Installed synthetic tasks and test copies; readiness remains false. No real users imported.')
