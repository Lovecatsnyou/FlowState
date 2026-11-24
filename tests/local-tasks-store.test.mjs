import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { getTask, getTasksByUser, putTask, deleteTask } from '../.next/local-task-tests/local/tasks-store.js';

globalThis.indexedDB = new IDBFactory();
const task = (user, id) => ({ id, user_id: user, created_at: '2026-01-02T08:00:00Z', title: 'Задача', subject: 'Физика', deadline: '2026-03-01', estimated_minutes: 90, priority: 'Высокий', status: 'pending' });

test('Создание, чтение и повторное открытие сохраняют данные и календарную дату', async () => {
 const record = task('user-a', 'id-1');
 await putTask('user-a', record, { localUpdatedAt: '2026-01-02T09:00:00Z' });
 assert.deepEqual(await getTask('user-a', 'id-1'), { task: record, metadata: { localUpdatedAt: '2026-01-02T09:00:00Z' } });
 // Каждая операция закрывает соединение, следующая открывает ту же БД заново.
 assert.equal((await getTask('user-a', 'id-1')).task.deadline, '2026-03-01');
 assert.equal(typeof (await getTask('user-a', 'id-1')).task.estimated_minutes, 'number');
});
test('Обновление сохраняет идентификатор; удаление затрагивает только заданную запись', async () => {
 const changed = { ...task('user-a', 'id-1'), estimated_minutes: 150 };
 await putTask('user-a', changed);
 assert.equal((await getTask('user-a', 'id-1')).task.estimated_minutes, 150);
 assert.equal((await getTasksByUser('user-a')).length, 1);
 await deleteTask('user-a', 'id-1');
 assert.equal(await getTask('user-a', 'id-1'), undefined);
});
test('Пользователи изолированы даже при одинаковом ID; чужой объект записать нельзя', async () => {
 const first = task('user-a', 'shared');
 const second = { ...task('user-b', 'shared'), title: 'Другая задача' };
 await putTask('user-a', first);
 await putTask('user-b', second);
 await putTask('user-a', task('user-a', 'private'));
 assert.deepEqual((await getTasksByUser('user-a')).map(x => x.task.id).sort(), ['private', 'shared']);
 assert.deepEqual((await getTasksByUser('user-b')).map(x => x.task.id), ['shared']);
 assert.equal(await getTask('user-b', 'private'), undefined);
 await assert.rejects(putTask('user-b', { ...first, title: 'Изменено' }), { code: 'invalid' });
 await deleteTask('user-b', 'private');
 assert.equal((await getTask('user-a', 'private')).task.title, 'Задача');
 await deleteTask('user-b', 'shared');
 assert.equal((await getTask('user-a', 'shared')).task.title, 'Задача');
});
test('Некорректные даты и значения отклоняются; лишние поля не сохраняются', async () => {
 await assert.rejects(putTask('user-a', { ...task('user-a', 'bad'), deadline: '2026-02-30' }), { code: 'invalid' });
 await assert.rejects(putTask('user-a', { ...task('user-a', 'bad'), deadline: new Date() }), { code: 'invalid' });
 await assert.rejects(putTask('user-a', { ...task('user-a', 'bad'), estimated_minutes: Infinity }), { code: 'invalid' });
 await assert.rejects(getTask('', 'bad'), { code: 'invalid' });
 await putTask('user-a', { ...task('user-a', 'safe'), token: 'secret' }, { secret: 'secret' });
 assert(!JSON.stringify(await getTask('user-a', 'safe')).includes('secret'));
});
test('Недоступная IndexedDB и переполненная квота возвращают отличимые ошибки', async () => {
 const previous = globalThis.indexedDB;
 try {
  globalThis.indexedDB = undefined;
  await assert.rejects(getTask('user-a', 'safe'), { code: 'unavailable' });
  globalThis.indexedDB = { open() { throw new DOMException('full', 'QuotaExceededError'); } };
  await assert.rejects(putTask('user-a', task('user-a', 'safe')), { code: 'quota' });
 } finally { globalThis.indexedDB = previous; }
});
test('Ошибка записи в IndexedDB не считается успешной', async () => {
 const request = globalThis.indexedDB.open('flowstate-local', 2);
 const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
 const proto = Object.getPrototypeOf(db.transaction('tasks', 'readonly').objectStore('tasks'));
 const original = proto.put;
 proto.put = function() { throw new DOMException('full', 'QuotaExceededError'); };
 try {
  await assert.rejects(putTask('user-a', task('user-a', 'safe')), { code: 'quota' });
 } finally { proto.put = original; db.close(); }
});
