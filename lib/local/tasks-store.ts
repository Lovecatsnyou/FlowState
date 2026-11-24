import type { TaskRow } from '../tasks';
import { parseDeadline } from '../task-calendar';

/** Поля записи Supabase. Секреты и локальные метаданные сюда не входят. */
export type StoredTask = TaskRow & { user_id: string; created_at?: string };
export type LocalTaskMetadata = { localUpdatedAt?: string };
export type LocalTask = { task: StoredTask; metadata: LocalTaskMetadata };
export type LocalTaskStoreErrorCode = 'unavailable' | 'blocked' | 'quota' | 'invalid' | 'database';

export class LocalTaskStoreError extends Error {
  constructor(public readonly code: LocalTaskStoreErrorCode, message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'LocalTaskStoreError';
  }
}

const DB_NAME = 'flowstate-local';
const DB_VERSION = 2;
const TASKS = 'tasks';
const USER_INDEX = 'by_user';
const OUTBOX = 'outbox';
type TaskRecord = LocalTask & { user_id: string; task_id: string; deleted?: boolean };

function failure(error: unknown): LocalTaskStoreError {
  if (error instanceof LocalTaskStoreError) return error;
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'QuotaExceededError') return new LocalTaskStoreError('quota', 'Недостаточно места для локальных данных.', error);
  return new LocalTaskStoreError('database', 'Ошибка локального хранилища задач.', error);
}
function requireId(value: string) {
  if (typeof value !== 'string' || !value.trim()) throw new LocalTaskStoreError('invalid', 'Требуется идентификатор пользователя и задачи.');
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let factory: IDBFactory | undefined;
    try { factory = globalThis.indexedDB; } catch (error) {
      reject(new LocalTaskStoreError('unavailable', 'IndexedDB недоступна.', error)); return;
    }
    if (!factory) { reject(new LocalTaskStoreError('unavailable', 'IndexedDB недоступна.')); return; }
    let request: IDBOpenDBRequest;
    try { request = factory.open(DB_NAME, DB_VERSION); } catch (error) { reject(failure(error)); return; }
    let blocked = false;
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) {
        const store = db.createObjectStore(TASKS, { keyPath: ['user_id', 'task_id'] });
        store.createIndex(USER_INDEX, 'user_id');
      }
      if (event.oldVersion < 2) {
        const outbox = db.createObjectStore(OUTBOX, { keyPath: ['user_id', 'operation_id'] });
        outbox.createIndex(USER_INDEX, 'user_id');
      }
    };
    request.onblocked = () => { blocked = true; reject(new LocalTaskStoreError('blocked', 'Открытие базы заблокировано другим соединением.')); };
    request.onerror = () => reject(failure(request.error));
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction(TASKS, mode); } catch (error) { db.close(); reject(failure(error)); return; }
    let result: T;
    let requestError: DOMException | null = null;
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(failure(requestError ?? tx.error)); };
    // Ошибка запроса приводит к abort; результат записи выдаётся только после commit.
    try {
      const request = run(tx.objectStore(TASKS));
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => { requestError = request.error; };
    } catch (error) {
      try { tx.abort(); } catch { /* Транзакция уже завершена. */ }
      db.close(); reject(failure(error));
    }
  });
}

/** Только явно перечисленные поля сохраняются в IndexedDB. */
function toRecord(userId: string, task: StoredTask, metadata: LocalTaskMetadata): TaskRecord {
  requireId(userId); requireId(task.id);
  if (task.user_id !== userId) throw new LocalTaskStoreError('invalid', 'Владелец задачи не совпадает с пользователем.');
  if (task.deadline !== null && (typeof task.deadline !== 'string' || !parseDeadline(task.deadline))) throw new LocalTaskStoreError('invalid', 'Некорректная календарная дата.');
  if ((task.title !== null && typeof task.title !== 'string') || (task.subject !== null && typeof task.subject !== 'string') || (task.priority !== null && typeof task.priority !== 'string') || (task.status != null && typeof task.status !== 'string') || (task.created_at !== undefined && typeof task.created_at !== 'string') || (task.estimated_minutes !== null && (typeof task.estimated_minutes !== 'number' || !Number.isFinite(task.estimated_minutes))) || (metadata.localUpdatedAt !== undefined && typeof metadata.localUpdatedAt !== 'string')) {
    throw new LocalTaskStoreError('invalid', 'Некорректные поля задачи.');
  }
  return { user_id: userId, task_id: task.id, task: {
    id: task.id, user_id: userId, title: task.title, subject: task.subject, deadline: task.deadline,
    estimated_minutes: task.estimated_minutes, priority: task.priority,
    ...(task.status !== undefined ? { status: task.status } : {}),
    ...(task.created_at !== undefined ? { created_at: task.created_at } : {}),
  }, metadata: metadata.localUpdatedAt === undefined ? {} : { localUpdatedAt: metadata.localUpdatedAt } };
}
function unwrap(record: TaskRecord): LocalTask { return { task: record.task, metadata: record.metadata }; }

export async function putTask(userId: string, task: StoredTask, metadata: LocalTaskMetadata = {}): Promise<void> {
  const record = toRecord(userId, task, metadata);
  await atomic('readwrite', async ({ tasks, outbox }) => {
    const pending = await idbRequest<PendingOperation[]>(outbox.index(USER_INDEX).getAll(userId));
    if (pending.some(item => item.task_id === task.id)) throw new LocalTaskStoreError('invalid', 'Задача имеет неподтверждённые изменения.');
    await idbRequest(tasks.put(record));
  });
}
export async function getTask(userId: string, taskId: string): Promise<LocalTask | undefined> {
  requireId(userId); requireId(taskId);
  const record = await transact<TaskRecord | undefined>('readonly', store => store.get([userId, taskId]));
  return record && !record.deleted ? unwrap(record) : undefined;
}
export async function getTasksByUser(userId: string): Promise<LocalTask[]> {
  requireId(userId);
  const records = await transact<TaskRecord[]>('readonly', store => store.index(USER_INDEX).getAll(userId));
  return records.filter(record => !record.deleted).map(unwrap);
}
export async function deleteTask(userId: string, taskId: string): Promise<void> {
  requireId(userId); requireId(taskId);
  await atomic('readwrite', async ({ tasks, outbox }) => {
    const pending = await idbRequest<PendingOperation[]>(outbox.index(USER_INDEX).getAll(userId));
    if (pending.some(item => item.task_id === taskId)) throw new LocalTaskStoreError('invalid', 'Задача имеет неподтверждённые изменения.');
    await idbRequest(tasks.delete([userId, taskId]));
  });
}

/** Очередь не отправляется автоматически. Неизвестный исход требует отдельной проверки на сервере. */
export type PendingOperation = {
  operation_id: string;
  user_id: string;
  task_id: string;
  kind: 'create' | 'update' | 'delete';
  task: StoredTask | null;
  created_at: string;
  state: 'pending' | 'uncertain';
  // Монотонный порядок новых операций пользователя; старые записи могут не иметь номера.
  sequence?: number;
};

type AtomicContext = { tasks: IDBObjectStore; outbox: IDBObjectStore };
function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function atomic<T>(mode: IDBTransactionMode, work: (context: AtomicContext) => Promise<T>): Promise<T> {
  const db = await openDatabase();
  let tx: IDBTransaction;
  try { tx = db.transaction([TASKS, OUTBOX], mode); }
  catch (error) { db.close(); throw failure(error); }
  const completed = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure(tx.error));
  });
  try {
    const value = await work({ tasks: tx.objectStore(TASKS), outbox: tx.objectStore(OUTBOX) });
    await completed;
    return value;
  } catch (error) {
    try { tx.abort(); } catch { /* Уже прервана или завершена. */ }
    await completed.catch(() => {});
    throw failure(error);
  } finally { db.close(); }
}

/** Записывает изменение и операцию в одной транзакции; повтор operation_id идемпотентен. */
export async function queueTaskChange(userId: string, operation: PendingOperation): Promise<void> {
  requireId(userId); requireId(operation.operation_id); requireId(operation.task_id);
  if (operation.user_id !== userId || !['create', 'update', 'delete'].includes(operation.kind) || !['pending', 'uncertain'].includes(operation.state) || typeof operation.created_at !== 'string' || !operation.created_at) throw new LocalTaskStoreError('invalid', 'Некорректная операция.');
  if ((operation.kind === 'delete') !== (operation.task === null)) throw new LocalTaskStoreError('invalid', 'Некорректные данные операции.');
  const record = operation.task ? toRecord(userId, operation.task, {}) : null;
  if (record && record.task_id !== operation.task_id) throw new LocalTaskStoreError('invalid', 'Идентификатор задачи не совпадает.');
  const canonical: PendingOperation = { operation_id: operation.operation_id, user_id: userId, task_id: operation.task_id, kind: operation.kind, task: record?.task ?? null, created_at: operation.created_at, state: operation.state };
  await atomic('readwrite', async ({ tasks, outbox }) => {
    const old = await idbRequest<PendingOperation | undefined>(outbox.get([userId, operation.operation_id]));
    if (old) {
      if (JSON.stringify(old) !== JSON.stringify({ ...canonical, sequence: old.sequence })) throw new LocalTaskStoreError('invalid', 'Идентификатор операции уже используется.');
      return;
    }
    const previous = await idbRequest<TaskRecord | undefined>(tasks.get([userId, operation.task_id]));
    if (operation.kind !== 'create' && (!previous || previous.deleted)) throw new LocalTaskStoreError('invalid', 'Локальная задача не найдена.');
    if (operation.kind === 'create' && previous) throw new LocalTaskStoreError('invalid', 'Локальная задача уже существует.');
    const next = record ?? { ...previous!, deleted: true };
    await idbRequest(tasks.put(next));
    const operations = await idbRequest<PendingOperation[]>(outbox.index(USER_INDEX).getAll(userId));
    const sequence = operations.reduce((max, item) => Math.max(max, item.sequence ?? 0), 0) + 1;
    await idbRequest(outbox.add({ ...canonical, sequence }));
  });
}

/** Серверные данные дополняют кеш, но никогда не заменяют незавершённые локальные операции. */
export async function mergeServerTasks(userId: string, serverTasks: readonly StoredTask[]): Promise<void> {
  requireId(userId);
  const records = serverTasks.map(task => toRecord(userId, task, {}));
  await atomic('readwrite', async ({ tasks, outbox }) => {
    const operations = await idbRequest<PendingOperation[]>(outbox.index(USER_INDEX).getAll(userId));
    const protectedIds = new Set(operations.map(item => item.task_id));
    for (const record of records) if (!protectedIds.has(record.task_id)) await idbRequest(tasks.put(record));
  });
}
export async function getPendingOperations(userId: string): Promise<PendingOperation[]> {
  requireId(userId);
  return atomic('readonly', async ({ outbox }) => idbRequest<PendingOperation[]>(outbox.index(USER_INDEX).getAll(userId)));
}
export async function getVisibleLocalTasks(userId: string): Promise<LocalTask[]> {
  requireId(userId);
  return atomic('readonly', async ({ tasks }) => {
    const records = await idbRequest<TaskRecord[]>(tasks.index(USER_INDEX).getAll(userId));
    return records.filter(record => !record.deleted).map(unwrap);
  });
}

/** Задачи и очередь читаются одним снимком, включая ожидающие удаления. */
export async function getLocalSnapshot(userId: string): Promise<{ tasks: LocalTask[]; operations: PendingOperation[] }> {
  requireId(userId);
  return atomic('readonly', async ({ tasks, outbox }) => {
    const records = await idbRequest<TaskRecord[]>(tasks.index(USER_INDEX).getAll(userId));
    const operations = await idbRequest<PendingOperation[]>(outbox.index(USER_INDEX).getAll(userId));
    return { tasks: records.filter(record => !record.deleted).map(unwrap), operations };
  });
}
