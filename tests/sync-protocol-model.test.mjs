import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ReferenceServer, acknowledge } from './support/task-sync-reference-model.mjs';

const make = (kind, task_id, extra = {}) => ({ protocol: 1, operation_id: randomUUID(), task_id, kind, expected_version: kind === 'create' ? null : '1', payload: kind === 'delete' ? null : { title: 'Первая', subject: 'Физика' }, ...extra });
const actor = 'user-a';

test('UUID уникальны; идентичный повтор возвращает исходный ответ, изменение содержимого отклоняется', async () => {
 const server = new ReferenceServer();
 const request = make('create', randomUUID());
 const other = make('create', randomUUID());
 assert.notEqual(request.operation_id, other.operation_id);
 const initial = await server.submit(actor, request);
 const reordered = { ...request, payload: { subject: 'Физика', title: 'Первая' } };
 assert.deepEqual(await server.submit(actor, reordered), initial);
 assert.equal((await server.submit(actor, { ...request, task_id: other.task_id })).outcome, 'operation_id_unavailable');
 assert.equal((await server.submit(actor, { ...request, payload: { title: 'Другая' } })).outcome, 'operation_id_unavailable');
 assert.equal((await server.submit('user-b', request)).outcome, 'operation_id_unavailable');
});
test('Потеря ответа и повтор одного конверта не применяют изменение повторно', async () => {
 const server = new ReferenceServer(); const id = randomUUID();
 await server.submit(actor, make('create', id));
 const update = make('update', id, { payload: { title: 'Изменено' } });
 const lostResponse = await server.submit(actor, update);
 const retry = await server.submit(actor, structuredClone(update));
 assert.deepEqual(retry, lostResponse); assert.equal(retry.version, 2);
 const next = await server.submit(actor, make('update', id, { expected_version: '2', payload: { title: 'Новое' } }));
 assert.equal(next.version, 3);
 assert.deepEqual(await server.submit(actor, update), lostResponse);
});
test('Конкурентные вызовы одной операции и конкурирующие версии задачи', async () => {
 const server = new ReferenceServer(); const id = randomUUID();
 const create = make('create', id);
 const [first, duplicate] = await Promise.all([server.submit(actor, create), server.submit(actor, create)]);
 assert.deepEqual(first, duplicate); assert.equal(first.version, 1);
 const [left, right] = await Promise.all([server.submit(actor, make('update', id)), server.submit(actor, make('update', id))]);
 assert.deepEqual([left.outcome, right.outcome].sort(), ['applied', 'conflict']);
 assert.equal(right.version, 2);
});
test('Удаление изменённой и уже удалённой задачи возвращает конфликт с актуальной версией', async () => {
 const server = new ReferenceServer(); const id = randomUUID();
 await server.submit(actor, make('create', id));
 await server.submit(actor, make('update', id));
 assert.equal((await server.submit(actor, make('delete', id))).reason, 'version');
 assert.equal((await server.submit(actor, make('delete', id, { expected_version: '2' }))).version, 3);
 const deleted = await server.submit(actor, make('delete', id, { expected_version: '3' }));
 assert.equal(deleted.reason, 'deleted'); assert.equal(deleted.version, 3);
 assert.equal((await server.submit(actor, make('create', id))).outcome, 'not_found_or_forbidden');
});
test('Чужая задача, неизвестная задача и неподтверждённый пользователь не раскрывают данные', async () => {
 const server = new ReferenceServer(); const id = randomUUID();
 await server.submit(actor, make('create', id));
 const foreign = await server.submit('user-b', make('update', id));
 const missing = await server.submit('user-b', make('update', randomUUID()));
 assert.deepEqual(foreign, missing);
 assert.deepEqual(await server.submit(null, make('update', id)), { outcome: 'unauthenticated' });
});
test('При смене аккаунта, ошибке или новых изменениях очередь сохраняет нужные операции', () => {
 const queue = [{ user: actor, operation_id: 'one' }, { user: actor, operation_id: 'two' }, { user: 'user-b', operation_id: 'three' }];
 assert.deepEqual(acknowledge(queue, actor, 1, { user: 'user-b', generation: 2 }, 'one'), queue);
 assert.deepEqual(acknowledge(queue, actor, 1, { user: actor, generation: 2 }, 'one'), queue);
 assert.deepEqual(acknowledge(queue, actor, 1, { user: actor, generation: 1 }, 'one'), queue.slice(1));
 // До достоверного ответа acknowledge не вызывается — очередь не изменяется.
 assert.equal(queue.length, 3);
});
test('Create → update → delete: версия следующего запроса берётся из сохранённого ответа', async () => {
 const server = new ReferenceServer(); const id = randomUUID();
 const create = await server.submit(actor, make('create', id));
 const update = await server.submit(actor, make('update', id, { expected_version: String(create.version) }));
 const deleted = await server.submit(actor, make('delete', id, { expected_version: String(update.version) }));
 assert.deepEqual([create.version, update.version, deleted.version], [1, 2, 3]);
 assert.equal(deleted.task.deleted, true);
});
