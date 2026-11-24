import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { routeTaskChange } from '../.next/local-task-tests/local/task-mutations.js';
import { getLocalSnapshot, mergeServerTasks, queueTaskChange } from '../.next/local-task-tests/local/tasks-store.js';
import { readTasks } from '../.next/local-task-tests/local/tasks-read.js';

const userId = 'user-a';
const current = () => true;
const changes = { title: 'Локальная', subject: 'Физика', deadline: '2026-03-01', estimated_minutes: 60, priority: 'Средний' };
const serverRow = { id: 'server-task', user_id: userId, ...changes, status: 'pending' };
const options = (extra = {}) => ({ userId, isCurrent: current, serverAvailable: false, task: null, kind: 'create', changes, ...extra });
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

test('Создание → изменение → завершение → удаление сохраняет последовательный журнал и tombstone', async () => {
 const created = await routeTaskChange(options());
 assert.equal(created.local, true); assert.match(created.task.id, /^[\da-f-]{36}$/);
 const id = created.task.id;
 const edited = await routeTaskChange(options({ task: created.task, kind: 'update', changes: { title: 'Изменено' } }));
 const completed = await routeTaskChange(options({ task: edited.task, kind: 'update', changes: { status: 'completed' } }));
 assert.equal(completed.task.id, id); assert.equal(completed.task.status, 'completed');
 const removed = await routeTaskChange(options({ task: completed.task, kind: 'delete' }));
 assert.equal(removed.task, null); assert.equal(removed.pendingCount, 4);
 const snapshot = await getLocalSnapshot(userId);
 assert.equal(snapshot.tasks.length, 0);
 assert.deepEqual(snapshot.operations.map(x => x.sequence).sort((a,b) => a-b), [1,2,3,4]);
 assert.deepEqual(snapshot.operations.slice().sort((a,b) => a.sequence-b.sequence).map(x => x.kind), ['create', 'update', 'update', 'delete']);
 await mergeServerTasks(userId, [{ ...serverRow, id }]);
 assert.equal((await getLocalSnapshot(userId)).tasks.length, 0);
 const reread = await readTasks(userId, { ok: true, tasks: [{ ...serverRow, id }] }, current);
 assert.equal(reread.tasks.length, 0); assert.equal(reread.pendingCount, 4);
});
test('Серверный ответ не скрывает локальное создание и не дублирует pending изменения', async () => {
 const created = await routeTaskChange(options());
 const result = await readTasks(userId, { ok: true, tasks: [serverRow, { ...serverRow, id: created.task.id }] }, current);
 assert.equal(result.source, 'server'); assert.equal(result.pendingCount, 1);
 assert.equal(result.tasks.filter(task => task.id === created.task.id).length, 1);
 assert.equal(result.tasks.find(task => task.id === created.task.id).title, 'Локальная');
 const after = await routeTaskChange(options({ serverAvailable: true, task: created.task, kind: 'update', changes: { title: 'Новое' } }));
 assert.equal(after.local, true); assert.equal(after.task.title, 'Новое');
});
test('Онлайн-операции без pending остаются серверными; локальная правка серверного снимка заблокирована', async () => {
 await mergeServerTasks(userId, [serverRow]);
 const view = { id: serverRow.id, title: serverRow.title, subject: serverRow.subject, deadline: serverRow.deadline, estimatedMinutes: 60, priority: 'Средний', status: 'pending' };
 for (const kind of ['update', 'delete']) {
  assert.deepEqual(await routeTaskChange(options({ serverAvailable: true, task: view, kind })), { local: false });
  await assert.rejects(routeTaskChange(options({ task: view, kind })), /только задачи/);
 }
 assert.deepEqual(await routeTaskChange(options({ serverAvailable: true })), { local: false });
 assert.equal((await getLocalSnapshot(userId)).operations.length, 0);
});
test('Смена аккаунта и устаревшая версия не записывают изменения', async () => {
 await assert.rejects(routeTaskChange(options({ isCurrent: () => false })), /Сессия/);
 const first = await routeTaskChange(options());
 const changed = await routeTaskChange(options({ task: first.task, kind: 'update', changes: { title: 'Новая' } }));
 await assert.rejects(routeTaskChange(options({ task: first.task, kind: 'update', changes: { title: 'Старая вкладка' } })), /другой вкладке/);
 assert.equal((await getLocalSnapshot(userId)).tasks[0].task.title, changed.task.title);
 assert.equal((await getLocalSnapshot('user-b')).tasks.length, 0);
});
test('Недоступная IndexedDB и uncertain не допускают небезопасную запись', async () => {
 const created = await routeTaskChange(options());
 const task = (await getLocalSnapshot(userId)).tasks[0].task;
 await queueTaskChange(userId, { operation_id: 'unknown', user_id: userId, task_id: task.id, kind: 'update', task, created_at: 'now', state: 'uncertain' });
 await assert.rejects(routeTaskChange(options({ task: created.task, kind: 'update' })), /только задачи/);
 globalThis.indexedDB = undefined;
 await assert.rejects(routeTaskChange(options()), { code: 'unavailable' });
});

test('Повторное чтение сервера не отправляет и не удаляет очередь', async () => {
 await routeTaskChange(options());
 const before = await getLocalSnapshot(userId);
 await readTasks(userId, { ok: true, tasks: [serverRow] }, current);
 await readTasks(userId, { ok: true, tasks: [serverRow] }, current);
 const after = await getLocalSnapshot(userId);
 assert.deepEqual(after.operations, before.operations);
 assert.equal(after.tasks.filter(item => item.task.id === before.tasks[0].task.id).length, 1);
});
test('Смена пользователя во время чтения снимка останавливает создание до транзакции', async () => {
 let checks = 0;
 await assert.rejects(routeTaskChange(options({ isCurrent: () => ++checks === 1 })), /Сессия/);
 assert.equal((await getLocalSnapshot(userId)).operations.length, 0);
});
