import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { queueTaskChange, mergeServerTasks, getVisibleLocalTasks, getPendingOperations, putTask, deleteTask } from '../.next/local-task-tests/local/tasks-store.js';

globalThis.indexedDB = new IDBFactory();
const user = 'user-a';
const makeTask = (id, owner = user) => ({ id, user_id: owner, title: 'Задача', subject: 'Физика', deadline: '2026-03-01', estimated_minutes: 90, priority: 'Средний', status: 'pending' });
const op = (id, kind, taskId, task, owner = user) => ({ operation_id: id, user_id: owner, task_id: taskId, kind, task, created_at: '2026-03-01T10:00:00Z', state: 'pending' });

test('Очередь сохраняет создание, обновление, статус и удаление после повторного открытия', async () => {
 const task = makeTask('a');
 const create = op('create-a', 'create', 'a', task);
 await queueTaskChange(user, create);
 await queueTaskChange(user, create);
 assert.equal((await getPendingOperations(user)).length, 1);
 await assert.rejects(putTask(user, task), { code: 'invalid' });
 await assert.rejects(deleteTask(user, 'a'), { code: 'invalid' });
 const changed = { ...task, title: 'Новая', status: 'completed' };
 await queueTaskChange(user, op('update-a', 'update', 'a', changed));
 assert.equal((await getVisibleLocalTasks(user))[0].task.status, 'completed');
 await queueTaskChange(user, op('delete-a', 'delete', 'a', null));
 assert.equal((await getVisibleLocalTasks(user)).length, 0);
 assert.deepEqual((await getPendingOperations(user)).map(x => x.kind).sort(), ['create', 'delete', 'update']);
 await mergeServerTasks(user, [task]);
 assert.equal((await getVisibleLocalTasks(user)).length, 0);
});
test('Серверный ответ не перезаписывает локальное изменение или данные другого пользователя', async () => {
 const server = makeTask('b');
 await mergeServerTasks(user, [server]);
 const edited = { ...server, title: 'Локально' };
 await queueTaskChange(user, op('update-b', 'update', 'b', edited));
 await mergeServerTasks(user, [{ ...server, title: 'Сервер' }]);
 assert.equal((await getVisibleLocalTasks(user)).find(x => x.task.id === 'b').task.title, 'Локально');
 assert.equal((await getVisibleLocalTasks('user-b')).length, 0);
 await assert.rejects(queueTaskChange('user-b', op('stolen', 'update', 'b', edited)), { code: 'invalid' });
});
test('Ошибка валидации не оставляет ни операции, ни задачи', async () => {
 const before = (await getPendingOperations(user)).length;
 await assert.rejects(queueTaskChange(user, op('invalid', 'create', 'invalid', { ...makeTask('invalid'), deadline: '2026-02-30' })), { code: 'invalid' });
 assert.equal((await getPendingOperations(user)).length, before);
 assert(!(await getVisibleLocalTasks(user)).some(x => x.task.id === 'invalid'));
});
test('Ошибка outbox откатывает запись задачи в той же транзакции', async () => {
 const factory = globalThis.indexedDB;
 const opening = factory.open('flowstate-local', 2);
 const db = await new Promise((resolve, reject) => { opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
 // Подмена метода add вызывает прерывание после успешной записи задачи, до commit.
 const proto = Object.getPrototypeOf(db.transaction(['outbox'], 'readonly').objectStore('outbox'));
 const original = proto.add;
 proto.add = function(value, ...args) { if (value.operation_id === 'fail') throw new DOMException('full', 'QuotaExceededError'); return original.call(this, value, ...args); };
 try {
   await assert.rejects(queueTaskChange(user, op('fail', 'create', 'rollback', makeTask('rollback'))), { code: 'quota' });
   assert(!(await getVisibleLocalTasks(user)).some(x => x.task.id === 'rollback'));
   assert(!(await getPendingOperations(user)).some(x => x.operation_id === 'fail'));
 } finally { proto.add = original; db.close(); }
});
test('Переход с версии 1 не удаляет существующие задачи', async () => {
 const previous = globalThis.indexedDB;
 const isolated = new IDBFactory(); globalThis.indexedDB = isolated;
 try {
  const request = isolated.open('flowstate-local', 1);
  request.onupgradeneeded = () => { const store = request.result.createObjectStore('tasks', { keyPath: ['user_id','task_id'] }); store.createIndex('by_user', 'user_id'); };
  const db = await new Promise((resolve,reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const tx = db.transaction('tasks','readwrite'); tx.objectStore('tasks').put({ user_id: user, task_id: 'old', task: makeTask('old'), metadata: {} });
  await new Promise((resolve,reject) => { tx.oncomplete = resolve; tx.onabort = reject; }); db.close();
  assert.equal((await getVisibleLocalTasks(user))[0].task.id, 'old');
  assert.deepEqual(await getPendingOperations(user), []);
  await putTask(user, makeTask('new'));
 } finally { globalThis.indexedDB = previous; }
});
