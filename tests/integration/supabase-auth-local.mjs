// Real local GoTrue/PostgREST smoke test. Never logs keys, JWTs or payloads.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const cli = '/tmp/flowstate-supabase-cli/node_modules/.bin/supabase';
const workdir = '/tmp/flowstate-supabase-23b3';
const status = execFileSync(cli, ['status', '--workdir', workdir, '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 });
const values = Object.fromEntries(status.split('\n').filter(line => line.includes('=')).map(line => {
  const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')];
}));
const url = new URL(values.API_URL);
assert.equal(url.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
assert.equal(url.port, '54321');
const flags = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const client = createClient(url.href, values.ANON_KEY, flags);
const admin = createClient(url.href, values.SERVICE_ROLE_KEY, flags);
const email = `flowstate-${randomUUID()}@example.invalid`;
const password = `S!${randomUUID()}a7`;
const { data, error } = await client.auth.signUp({ email, password });
assert.ifError(error);
assert.ok(data.user && data.session);
const claims = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
const initial = claims(data.session.access_token);
assert.equal(initial.sub, data.user.id);
assert.match(initial.session_id, /^[0-9a-f-]{36}$/i);
assert.match(initial.flowstate_account_generation, /^[1-9][0-9]*$/);
assert.match(initial.flowstate_session_generation, /^[1-9][0-9]*$/);
const refreshed = await client.auth.refreshSession();
assert.ifError(refreshed.error);
const next = claims(refreshed.data.session.access_token);
assert.equal(next.session_id, initial.session_id);
assert.equal(next.flowstate_account_generation, initial.flowstate_account_generation);
assert.equal(next.flowstate_session_generation, initial.flowstate_session_generation);
const rpc = await client.rpc('apply_task_sync', { p_request: {} });
assert.equal(rpc.error?.code, '0A000');
const privateTable = await client.schema('flow_sync_private').from('task_operations').select('*');
assert.ok(privateTable.error);
const anonymous = createClient(url.href, values.ANON_KEY, flags);
assert.ok((await anonymous.rpc('apply_task_sync', { p_request: {} })).error);
const task = await client.from('tasks').insert({ user_id: data.user.id, title: 'synthetic' }).select('id').single();
assert.ifError(task.error);
const logout = await client.auth.signOut();
assert.ifError(logout.error);
const query = statement => execFileSync('podman', ['exec', 'supabase_db_flowstate-supabase-23b3', 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-c', statement], { encoding: 'utf8', timeout: 15000 }).trim();
assert.equal(query(`select count(*) from flow_sync_private.session_gate where session_id='${initial.session_id}'::uuid`), '0');
const deleted = await admin.auth.admin.deleteUser(data.user.id);
assert.ifError(deleted.error);
const remaining = await admin.from('tasks').select('id').eq('id', task.data.id);
assert.ifError(remaining.error);
assert.equal(remaining.data.length, 0);
for (const table of ['account_lifecycle', 'session_gate', 'task_identity', 'task_operations']) {
  assert.equal(query(`select count(*) from flow_sync_private.${table} where user_id='${data.user.id}'::uuid`), '0');
}
console.log('PASS: real local Auth signup/refresh hook claims, fail-closed PostgREST, private schema, logout and cascade task delete');
console.log('NOT TESTED: expired issued JWT, old JWT after session deletion, account UUID reuse, inactivity/timebox.');
