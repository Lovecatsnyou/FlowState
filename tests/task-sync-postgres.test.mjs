// Only an in-memory PGlite fixture. No URLs, real Supabase, Auth or network.
// One connection: these tests do not prove multi-session races or real JWT security.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const ROOT = new URL('../supabase/proposals/', import.meta.url);
const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';
const SA = '11000000-0000-4000-8000-000000000001';
const SB = '11000000-0000-4000-8000-000000000002';
const ORIGINAL = '20000000-0000-4000-8000-000000000003';
const DIRECT = '20000000-0000-4000-8000-000000000004';
const DENIED = '20000000-0000-4000-8000-000000000005';
const ORPHAN = '20000000-0000-4000-8000-000000000002';
let activeGeneration;

// Abort guard and rollback are removed from transient in-memory strings only.
// Files remain guarded and are never applied to a persistent/external server.
async function isolatedDraft(name, guardMessage) {
  const source = await readFile(new URL(name, ROOT), 'utf8');
  const guard = `do $$ begin raise exception '${guardMessage}'; end $$;`;
  assert.equal(source.split(guard).length, 2);
  assert.match(source, /\brollback;\s*$/i);
  return source.replace(guard, '').replace(/\brollback;\s*$/i, 'commit;');
}
function serverOperationId(generation, nonce) {
  const bytes = createHash('sha256').update(`flowstate.task-sync.v2:${generation}:${nonce.toLowerCase()}`, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const request = (kind, task_id, opts = {}) => {
  const operation_nonce = opts.operation_nonce ?? randomUUID();
  const generation = opts.account_generation ?? activeGeneration;
  return { protocol: 2, operation_nonce, operation_id: serverOperationId(generation, operation_nonce), task_id, kind,
    account_generation: generation, expected_version: kind === 'create' ? null : '1',
    payload: kind === 'delete' ? null : { title: 'test' }, ...opts };
};
const invoke = async (db, op) => (await db.query('select public.apply_task_sync($1::jsonb) as result', [JSON.stringify(op)])).rows[0].result;
const errorCode = code => error => { assert.equal(error.code, code); return true; };
const gate = async (db, session) => (await db.query('select user_id::text, account_generation::text, session_generation::text from flow_sync_private.session_gate where session_id=$1::uuid', [session])).rows[0];
const claims = (user, session, row, extra = {}) => ({ sub: user, session_id: session, flowstate_account_generation: row.account_generation, flowstate_session_generation: row.session_generation, exp: Math.floor(Date.now() / 1000) + 3600, ...extra });
async function as(db, jwt) {
  await db.exec('reset role');
  await db.query("select pg_catalog.set_config('request.jwt.claims', $1, false)", [JSON.stringify(jwt)]);
  activeGeneration = jwt.flowstate_account_generation;
  await db.exec('set role authenticated');
}

test('SQL DRAFT: синтетические версии, RLS, Auth gates и очистка аккаунта', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create role supabase_auth_admin nologin;
      create schema auth; create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade);
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
      grant usage on schema auth to public; grant execute on function auth.uid(), auth.jwt() to public;
      create table public.tasks(id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
        title text, subject text, deadline date, estimated_minutes integer, priority text, status text,
        user_id uuid references auth.users(id) on delete cascade);
      alter table public.tasks enable row level security;
      grant usage on schema public to authenticated, anon, supabase_auth_admin;
      grant select, insert, update, delete on public.tasks to authenticated, anon;
      create policy task_s on public.tasks for select to authenticated using (auth.uid() = user_id);
      create policy task_i on public.tasks for insert to authenticated with check (auth.uid() = user_id);
      create policy task_u on public.tasks for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
      create policy task_d on public.tasks for delete to authenticated using (auth.uid() = user_id);
      insert into auth.users values ('${A}'), ('${B}');
      insert into auth.sessions values ('${SA}', '${A}'), ('${SB}', '${B}');
      insert into public.tasks(id,user_id,title) values ('${ORPHAN}',null,'orphan'), ('${ORIGINAL}','${A}','legacy');
    `);
    await db.exec(await isolatedDraft('flow23_3b_01_storage_DRAFT.sql', '23.3b draft: not a deployable migration'));
    await db.exec(await isolatedDraft('flow23_3b_04_role_DRAFT.sql', '23.3b role draft: not a deployable migration'));
    // Synthetic only: real auth.users SELECT(id), RLS visibility and ownership need review.
    await db.exec('grant select(id) on auth.users to flow_task_identity_trigger');
    await db.exec(await isolatedDraft('flow23_3b_05_task_triggers_DRAFT.sql', '23.3b.1 trigger draft: not a deployable migration'));
    await db.exec(await isolatedDraft('flow23_3b_06_auth_gates_DRAFT.sql', '23.3b.2 Auth gates draft: not a deployable migration'));
    await db.exec(`begin;
      alter function flow_sync_private.maintain_task_identity() owner to flow_task_identity_trigger;
      revoke all on function flow_sync_private.maintain_task_identity() from public, anon, authenticated, service_role;
      create trigger flow_task_identity before insert or update or delete on public.tasks for each row execute function flow_sync_private.maintain_task_identity();
      alter function flow_sync_private.provision_auth_gate() owner to flow_auth_lifecycle_trigger;
      revoke all on function flow_sync_private.provision_auth_gate() from public, anon, authenticated, service_role;
      create trigger flow_user_gate after insert on auth.users for each row execute function flow_sync_private.provision_auth_gate();
      create trigger flow_session_gate after insert on auth.sessions for each row execute function flow_sync_private.provision_auth_gate();
      create trigger flow_user_immutable before update on auth.users for each row execute function flow_sync_private.provision_auth_gate();
      create trigger flow_session_immutable before update on auth.sessions for each row execute function flow_sync_private.provision_auth_gate();
      commit;`);
    const gateA = await gate(db, SA); const gateB = await gate(db, SB);
    await assert.rejects(db.query('update auth.sessions set user_id=$1::uuid where id=$2::uuid', [B, SA]), errorCode('22023'));
    await assert.rejects(db.query('update auth.users set id=$1::uuid where id=$2::uuid', [randomUUID(), A]), errorCode('22023'));
    const jwtA = claims(A, SA, gateA); const jwtB = claims(B, SB, gateB);
    await db.exec('set role supabase_auth_admin');
    const hookEvent = { user_id: A, claims: { sub: A, session_id: SA, exp: jwtA.exp } };
    const hook = (await db.query('select public.flow_sync_access_token_hook($1::jsonb) as result', [JSON.stringify(hookEvent)])).rows[0].result;
    assert.equal(hook.claims.flowstate_account_generation, gateA.account_generation);
    assert.equal(hook.claims.flowstate_session_generation, gateA.session_generation);
    await db.exec('reset role');
    await db.exec(await isolatedDraft('flow23_3b_03_rpc_DRAFT.sql', '23.3b RPC draft: not a deployable migration'));
    await as(db, jwtA);
    await assert.rejects(invoke(db, request('create', randomUUID())), errorCode('42501'));
    await db.exec(`reset role; begin;
      alter function public.apply_task_sync(jsonb) owner to flow_task_sync_executor;
      revoke all on function public.apply_task_sync(jsonb) from public, anon, authenticated, service_role;
      grant execute on function public.apply_task_sync(jsonb) to authenticated;
      commit;`);
    // Real candidate is deliberately unconditionally fail-closed. Only this
    // disposable fixture removes the check and toggles the gate in memory.
    await as(db, jwtA);
    await assert.rejects(invoke(db, request('create', randomUUID())), errorCode('0A000'));
    await db.exec('reset role');
    await assert.rejects(db.exec('update flow_sync_private.protocol_readiness set session_policy_ready = true'), errorCode('23514'));
    await db.exec(`alter table flow_sync_private.protocol_readiness drop constraint flow_session_policy_not_implemented;
      update flow_sync_private.protocol_readiness set session_policy_ready = true;`);

    // Legacy DML updates version, but cannot prevent stale direct writes.
    await as(db, jwtB);
    await assert.rejects(db.query('insert into public.tasks(id,user_id) values ($1::uuid,$2::uuid)', [DENIED, A]), errorCode('42501'));
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from flow_sync_private.task_identity where task_id=$1::uuid', [DENIED])).rows[0].n, 0);
    await as(db, jwtA);
    await db.query('insert into public.tasks(id,user_id,title) values ($1::uuid,$2::uuid,$3)', [DIRECT, A, 'direct']);
    const direct = (await db.query('update public.tasks set version=999 where id=$1::uuid returning version::text as version', [DIRECT])).rows[0];
    assert.equal(direct.version, '2');
    const staleDirect = (await db.query('update public.tasks set title=$1 where id=$2::uuid returning version::text as version', ['stale', DIRECT])).rows[0];
    assert.equal(staleDirect.version, '3');
    await assert.rejects(db.query('update public.tasks set user_id=$1::uuid where id=$2::uuid', [B, DIRECT]), errorCode('22023'));
    await db.query('delete from public.tasks where id=$1::uuid', [DIRECT]);
    await db.exec('reset role');
    assert.deepEqual((await db.query('select deleted, version::text as version from flow_sync_private.task_identity where task_id=$1::uuid', [DIRECT])).rows[0], { deleted: true, version: '4' });
    await db.exec('revoke insert, update, delete on public.tasks from public, anon, authenticated;');
    const privateRls = (await db.query("select bool_and(relrowsecurity) as enabled from pg_class where oid in ('flow_sync_private.task_operations'::regclass, 'flow_sync_private.task_identity'::regclass, 'flow_sync_private.account_lifecycle'::regclass, 'flow_sync_private.session_gate'::regclass)")).rows[0];
    assert.equal(privateRls.enabled, true);
    assert.equal((await db.query("select has_function_privilege('anon','public.apply_task_sync(jsonb)','EXECUTE') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_table_privilege('authenticated','auth.users','SELECT') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_table_privilege('authenticated','auth.sessions','SELECT') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_table_privilege('flow_task_identity_trigger','flow_sync_private.task_operations','SELECT') as allowed")).rows[0].allowed, false);

    await as(db, { ...jwtA, exp: 1 });
    await assert.rejects(invoke(db, request('create', randomUUID())), errorCode('42501'));
    await as(db, { ...jwtA, session_id: randomUUID() });
    await assert.rejects(invoke(db, request('create', randomUUID())), errorCode('42501'));
    await as(db, jwtA);
    await assert.rejects(db.query('select public.flow_sync_access_token_hook($1::jsonb)', [JSON.stringify(hookEvent)]), errorCode('42501'));
    await assert.rejects(db.query('select * from flow_sync_private.account_lifecycle'), errorCode('42501'));
    await assert.rejects(db.query('update flow_sync_private.account_lifecycle set generation=999'), errorCode('42501'));
    await assert.rejects(db.query('select * from flow_sync_private.task_operations'), errorCode('42501'));
    await assert.rejects(db.query('insert into public.tasks(user_id) values ($1::uuid)', [A]), errorCode('42501'));
    assert.equal((await invoke(db, request('update', ORPHAN))).reason, 'not_found_or_forbidden');
    const id = randomUUID(); const create = request('create', id, { payload: { title: 'private', deadline: '2026-03-01' } });
    const first = await invoke(db, create);
    assert.equal(first.version, '1'); assert.deepEqual(await invoke(db, create), first);
    assert.equal((await invoke(db, { ...create, payload: { title: 'changed' } })).reason, 'operation_id_unavailable');
    await assert.rejects(invoke(db, { ...request('create', randomUUID()), user_id: B }), errorCode('22023'));
    const update = request('update', id, { payload: { status: 'completed', title: null } });
    assert.equal((await invoke(db, update)).version, '2');
    assert.equal((await invoke(db, request('update', id))).reason, 'version');
    const del = request('delete', id, { expected_version: '2' });
    const removed = await invoke(db, del); assert.equal(removed.version, '3'); assert.deepEqual(await invoke(db, del), removed);
    await db.exec('reset role');
    assert.equal((await db.query('select deleted from flow_sync_private.task_identity where task_id=$1::uuid', [id])).rows[0].deleted, true);
    await as(db, jwtB);
    assert.equal((await invoke(db, request('update', ORIGINAL))).reason, 'not_found_or_forbidden');
    const bTask = await invoke(db, request('create', randomUUID(), { payload: { title: 'user-b' } }));
    assert.equal(bTask.outcome, 'applied');
    await assert.rejects(invoke(db, create), errorCode('42501')); // generation bound to A
    await assert.rejects(invoke(db, { ...create, account_generation: gateB.account_generation }), errorCode('22023'));

    // Force journal failure: task and identity both roll back.
    await as(db, jwtA);
    const failing = request('update', ORIGINAL);
    await db.exec(`reset role;
      create function flow_sync_private.test_reject_journal() returns trigger language plpgsql as $$begin
        if new.operation_id = '${failing.operation_id}'::uuid then raise exception 'synthetic failure'; end if;
        return new; end$$;
      create trigger test_reject before insert on flow_sync_private.task_operations for each row execute function flow_sync_private.test_reject_journal();`);
    await as(db, jwtA);
    await assert.rejects(invoke(db, failing));
    assert.deepEqual((await db.query('select title, version::text as version from public.tasks where id=$1::uuid', [ORIGINAL])).rows[0], { title: 'legacy', version: '1' });
    await db.exec('reset role');
    assert.equal((await db.query('select version::text as version from flow_sync_private.task_identity where task_id=$1::uuid', [ORIGINAL])).rows[0].version, '1');
    assert.equal((await db.query('select count(*)::int as n from flow_sync_private.task_operations where operation_id=$1::uuid', [failing.operation_id])).rows[0].n, 0);

    // Inject a cascade failure and verify full rollback, then complete deletion.
    await db.exec(`create function public.test_reject_cascade() returns trigger language plpgsql as $$begin
      if old.id = '${ORIGINAL}'::uuid then raise exception using errcode='40001', message='synthetic cascade failure'; end if;
      return old; end$$;
      create trigger test_reject_cascade before delete on public.tasks for each row execute function public.test_reject_cascade();`);
    await assert.rejects(db.exec(`delete from auth.users where id='${A}'::uuid`), errorCode('40001'));
    assert.equal((await db.query('select count(*)::int as n from auth.users where id=$1::uuid', [A])).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int as n from public.tasks where id=$1::uuid', [ORIGINAL])).rows[0].n, 1);
    await db.exec('drop trigger test_reject_cascade on public.tasks');
    // Exercise the other possible FK action order in a rolled-back synthetic tx:
    // identity purged first, then parent deletion triggers task cleanup.
    await db.exec('begin');
    await db.query('delete from flow_sync_private.task_identity where user_id=$1::uuid', [A]);
    await db.query('delete from auth.users where id=$1::uuid', [A]);
    assert.equal((await db.query('select count(*)::int as n from flow_sync_private.task_operations where user_id=$1::uuid', [A])).rows[0].n, 0);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as n from flow_sync_private.task_identity where user_id=$1::uuid', [A])).rows[0].n > 0, true);
    await db.exec(`delete from auth.users where id='${A}'::uuid`);
    for (const table of ['account_lifecycle', 'session_gate', 'task_identity', 'task_operations']) {
      assert.equal((await db.query(`select count(*)::int as n from flow_sync_private.${table} where user_id=$1::uuid`, [A])).rows[0].n, 0, table);
    }
    assert.equal((await db.query('select count(*)::int as n from public.tasks where user_id=$1::uuid', [A])).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from public.tasks where user_id=$1::uuid', [B])).rows[0].n, 1);
    await as(db, jwtA); await assert.rejects(invoke(db, create), errorCode('42501'));

    // Same account AND session UUID recreated: server-created epochs differ.
    await db.exec(`reset role; insert into auth.users(id) values ('${A}'); insert into auth.sessions(id,user_id) values ('${SA}','${A}');`);
    const newGate = await gate(db, SA);
    assert.notEqual(newGate.account_generation, gateA.account_generation);
    assert.notEqual(newGate.session_generation, gateA.session_generation);
    await as(db, jwtA); await assert.rejects(invoke(db, create), errorCode('42501'));
    const newJwt = claims(A, SA, newGate); await as(db, newJwt);
    await assert.rejects(invoke(db, create), errorCode('42501')); // old immutable envelope
    assert.equal((await db.query('select count(*)::int as n from public.tasks')).rows[0].n, 0);
    // A bare old operation_id cannot be rebound to the new epoch with the old nonce.
    await assert.rejects(invoke(db, { ...create, account_generation: newGate.account_generation }), errorCode('22023'));
    const newRequest = request('create', create.task_id, { operation_nonce: create.operation_nonce });
    assert.notEqual(newRequest.operation_id, create.operation_id);
    const reused = await invoke(db, newRequest); // a newly constructed operation, not an old replay
    assert.equal(reused.outcome, 'applied');
    // Revocation removes session gate; same session UUID gives a new epoch.
    await db.exec(`reset role; delete from auth.sessions where id='${SA}'::uuid; insert into auth.sessions(id,user_id) values ('${SA}','${A}');`);
    await as(db, newJwt); await assert.rejects(invoke(db, request('update', reused.task_id)), errorCode('42501'));
  } finally { await db.close(); }
});
