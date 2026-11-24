import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { readTasks } from '../.next/local-task-tests/local/tasks-read.js';
import { getVisibleLocalTasks, mergeServerTasks, queueTaskChange } from '../.next/local-task-tests/local/tasks-store.js';

const row = (id, title = id) => ({ id, title, subject: 'Физика', deadline: '2026-03-01', estimated_minutes: 30, priority: 'Средний', status: 'pending', created_at: '2026-01-01T00:00:00Z' });
const stored = (id, user = 'a') => ({ ...row(id), user_id: user });
const current = () => true;
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

test('Серверные задачи кешируются, читаются после повторного открытия и восстанавливаются при ошибке сети', async () => {
 const result = await readTasks('a', { ok: true, tasks: [row('one')] }, current);
 assert.equal(result.source, 'server'); assert.equal(result.cacheError, false);
 assert.equal((await getVisibleLocalTasks('a'))[0].task.title, 'one');
 const offline = await readTasks('a', { ok: false }, current);
 assert.equal(offline.source, 'local'); assert.equal(offline.tasks[0].id, 'one');
});
test('Пустой серверный список отличается от ошибки и отсутствия кеша', async () => {
 assert.equal((await readTasks('a', { ok: true, tasks: [] }, current)).source, 'server');
 assert.equal((await readTasks('a', { ok: false }, current)).source, 'missing');
});
test('Ожидающие изменения и tombstone защищены, прочие записи не удаляются', async () => {
 await mergeServerTasks('a', [stored('one'), stored('two'), stored('old')]);
 await queueTaskChange('a', { operation_id: 'u', user_id: 'a', task_id: 'one', kind: 'update', task: { ...stored('one'), title: 'локально' }, created_at: 'now', state: 'uncertain' });
 await queueTaskChange('a', { operation_id: 'd', user_id: 'a', task_id: 'two', kind: 'delete', task: null, created_at: 'now', state: 'pending' });
 await readTasks('a', { ok: true, tasks: [row('one', 'сервер'), row('two')] }, current);
 const rows = await getVisibleLocalTasks('a');
 assert.equal(rows.find(x => x.task.id === 'one').task.title, 'локально');
 assert(!rows.some(x => x.task.id === 'two')); assert(rows.some(x => x.task.id === 'old'));
});
test('Смена пользователя во время чтения отменяет результат и чужой кеш не возвращается', async () => {
 await mergeServerTasks('a', [stored('secret')]);
 let valid = true;
 const pending = readTasks('a', { ok: false }, () => valid);
 valid = false;
 assert.equal(await pending, null);
 assert.equal((await readTasks('b', { ok: false }, current)).source, 'missing');
 assert.equal(await readTasks('a', { ok: false }, () => false), null);
});
test('Ошибки IndexedDB не скрывают серверный ответ и различимы при ошибке сети', async () => {
 globalThis.indexedDB = undefined;
 const online = await readTasks('a', { ok: true, tasks: [row('one')] }, current);
 assert.equal(online.source, 'server'); assert.equal(online.cacheError, true);
 assert.equal((await readTasks('a', { ok: false }, current)).source, 'storage-error');
});
