import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { loadTasksPage } from '../.next/local-task-tests/tasks-page-load.js';
import { readTasks } from '../.next/local-task-tests/local/tasks-read.js';
import { mergeServerTasks, getVisibleLocalTasks, getPendingOperations } from '../.next/local-task-tests/local/tasks-store.js';

const user = { id: 'user-a' };
const row = { id: 'task-a', user_id: user.id, title: 'Задача', subject: 'Физика', deadline: '2026-03-01', estimated_minutes: 30, priority: 'Средний', status: 'pending' };
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

test('Диагностика сначала проверяет Auth, затем возвращает ошибку и локальный кеш без изменений', async () => {
 await mergeServerTasks(user.id, [row]);
 const before = await getVisibleLocalTasks(user.id);
 const calls = [];
 const result = await loadTasksPage({
  environment: 'development', simulate: '1',
  authenticate: async () => { calls.push('auth'); return { data: { user }, error: null }; },
  fetchTasks: async () => { calls.push('tasks'); return []; },
 });
 assert.deepEqual(calls, ['auth']);
 assert.equal(result.authenticated, true); assert.equal(result.tasksError, true); assert.equal(result.simulated, true);
 const fallback = await readTasks(result.user.id, { ok: false }, () => true);
 assert.equal(fallback.source, 'local'); assert.equal(fallback.tasks[0].id, row.id);
 assert.deepEqual(await getVisibleLocalTasks(user.id), before);
 assert.deepEqual(await getPendingOperations(user.id), []);
});
test('Ошибка или отсутствие Auth не позволяют запустить диагностику или загрузку', async () => {
 for (const auth of [{ data: { user: null }, error: null }, { data: { user }, error: new Error('auth') }]) {
  let calls = 0;
  const result = await loadTasksPage({ environment: 'development', simulate: '1', authenticate: async () => { calls++; return auth; }, fetchTasks: async () => { throw new Error('unexpected'); } });
  assert.deepEqual(result, { authenticated: false }); assert.equal(calls, 1);
 }
});
test('В production параметр игнорируется, а в development по умолчанию выключен', async () => {
 for (const [environment, simulate] of [['production', '1'], ['test', '1'], ['development', undefined], ['development', '0'], ['development', ['1']]]) {
  const calls = [];
  const result = await loadTasksPage({ environment, simulate, authenticate: async () => { calls.push('auth'); return { data: { user }, error: null }; }, fetchTasks: async (owner) => { calls.push(owner.id); return [row]; } });
  assert.deepEqual(calls, ['auth', user.id]); assert.equal(result.tasksError, false); assert.equal(result.simulated, false); assert.equal(result.tasks[0].id, row.id);
 }
});
test('Реальная ошибка чтения сохраняет поведение fallback', async () => {
 const result = await loadTasksPage({ environment: 'production', simulate: '1', authenticate: async () => ({ data: { user }, error: null }), fetchTasks: async () => { throw new Error('network'); } });
 assert.equal(result.tasksError, true); assert.equal(result.simulated, false); assert.deepEqual(result.tasks, []);
});
