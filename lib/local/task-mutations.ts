import { normalizeTaskPriority, normalizeTaskStatus, type Task } from '../tasks';
import { getLocalSnapshot, queueTaskChange, type StoredTask } from './tasks-store';

type ChangeResult = { local: false } | { local: true; task: Task | null; pendingIds: string[]; pendingCount: number; localCreatedIds: string[] };

function taskView(task: StoredTask): Task {
  return { id: task.id, title: task.title ?? '', subject: task.subject ?? '', deadline: task.deadline ?? '', estimatedMinutes: task.estimated_minutes ?? 0, priority: normalizeTaskPriority(task.priority), status: normalizeTaskStatus(task.status) };
}

/** Вызывается под общей блокировкой операций пользователя, после проверки сессии. */
export async function routeTaskChange(options: {
  userId: string;
  isCurrent: () => boolean;
  serverAvailable: boolean;
  task: Task | null;
  kind: 'create' | 'update' | 'delete';
  changes?: Partial<StoredTask>;
}): Promise<ChangeResult> {
  const { userId, isCurrent, serverAvailable, task, kind, changes } = options;
  if (!isCurrent()) throw new Error('Сессия не подтверждена.');
  const snapshot = await getLocalSnapshot(userId);
  if (!isCurrent()) throw new Error('Сессия изменилась.');
  const operations = task ? snapshot.operations.filter(operation => operation.task_id === task.id) : [];
  if (serverAvailable && operations.length === 0) return { local: false };
  // Серверная задача могла измениться в другой вкладке/устройстве или иметь
  // неясно завершившуюся онлайн-запись. Без подтверждений и версий нельзя
  // безопасно дописать её устаревший снимок в журнал.
  if (kind !== 'create' && (!operations.some(operation => operation.kind === 'create') || operations.some(operation => operation.state === 'uncertain'))) {
    throw new Error('Локально можно изменять только задачи, созданные в этом браузере и ещё не отправленные на сервер.');
  }
  const now = new Date().toISOString();
  let record: StoredTask | null;
  let taskId: string;
  if (kind === 'create') {
    taskId = crypto.randomUUID();
    record = { id: taskId, user_id: userId, title: changes?.title ?? '', subject: changes?.subject ?? '', deadline: changes?.deadline ?? null, estimated_minutes: changes?.estimated_minutes ?? null, priority: changes?.priority ?? null, status: 'pending', created_at: now };
  } else {
    if (!task) throw new Error('Задача не найдена.');
    taskId = task.id;
    const original = snapshot.tasks.find(item => item.task.id === taskId)?.task;
    if (!original || JSON.stringify(taskView(original)) !== JSON.stringify(task)) throw new Error('Задача изменилась в другой вкладке. Обновите страницу.');
    record = kind === 'delete' ? null : { ...original, ...changes, id: taskId, user_id: userId };
  }
  if (!isCurrent()) throw new Error('Сессия изменилась.');
  await queueTaskChange(userId, { operation_id: crypto.randomUUID(), user_id: userId, task_id: taskId, kind, task: record, created_at: now, state: 'pending' });
  return { local: true, task: record ? taskView(record) : null, pendingIds: [...new Set([...snapshot.operations.map(operation => operation.task_id), taskId])], pendingCount: snapshot.operations.length + 1, localCreatedIds: [...new Set([...snapshot.operations.filter(operation => operation.kind === 'create' && operation.state === 'pending' && !snapshot.operations.some(item => item.task_id === operation.task_id && item.state === 'uncertain')).map(operation => operation.task_id), ...(kind === 'create' ? [taskId] : [])])] };
}
