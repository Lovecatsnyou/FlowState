import type { TaskRow } from '../tasks';
import { getLocalSnapshot, mergeServerTasks } from './tasks-store';

export type TasksReadResult =
  | { source: 'server'; tasks: TaskRow[]; cacheError: boolean; pendingIds: string[]; pendingCount: number; localCreatedIds: string[] }
  | { source: 'local'; tasks: TaskRow[]; pendingIds: string[]; pendingCount: number; localCreatedIds: string[] }
  | { source: 'missing' | 'storage-error'; tasks: TaskRow[]; pendingIds: string[]; pendingCount: number; localCreatedIds: string[] };

/** userId должен быть получен от проверенной сервером сессии. */
export async function readTasks(
  userId: string,
  server: { ok: true; tasks: TaskRow[] } | { ok: false },
  isCurrent: () => boolean,
): Promise<TasksReadResult | null> {
  if (!isCurrent()) return null;
  if (server.ok) {
    try {
      await mergeServerTasks(userId, server.tasks.map(task => ({ ...task, user_id: userId })));
      const snapshot = await getLocalSnapshot(userId);
      const pendingIds = [...new Set(snapshot.operations.map(operation => operation.task_id))];
      const pending = new Set(pendingIds);
      const localCreatedIds = snapshot.operations.filter(op => op.kind === 'create' && op.state === 'pending' && !snapshot.operations.some(item => item.task_id === op.task_id && item.state === 'uncertain')).map(op => op.task_id);
      const local = snapshot.tasks.map(record => record.task).filter(task => pending.has(task.id));
      const tasks = [...server.tasks.filter(task => !pending.has(task.id)), ...local]
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || a.id.localeCompare(b.id));
      return isCurrent() ? { source: 'server', tasks, cacheError: false, pendingIds, pendingCount: snapshot.operations.length, localCreatedIds } : null;
    } catch {
      return isCurrent() ? { source: 'server', tasks: server.tasks, cacheError: true, pendingIds: [], pendingCount: 0, localCreatedIds: [] } : null;
    }
  }
  try {
    const snapshot = await getLocalSnapshot(userId);
    if (!isCurrent()) return null;
    // Старые записи могут не иметь created_at; порядок для них не гарантируется.
    const tasks = snapshot.tasks.map(record => record.task).sort((a, b) =>
      (b.created_at ?? '').localeCompare(a.created_at ?? '') || a.id.localeCompare(b.id));
    const pendingIds = [...new Set(snapshot.operations.map(operation => operation.task_id))];
    const pendingCount = snapshot.operations.length;
    const localCreatedIds = snapshot.operations.filter(op => op.kind === 'create' && op.state === 'pending' && !snapshot.operations.some(item => item.task_id === op.task_id && item.state === 'uncertain')).map(op => op.task_id);
    return tasks.length ? { source: 'local', tasks, pendingIds, pendingCount, localCreatedIds } : { source: 'missing', tasks: [], pendingIds, pendingCount, localCreatedIds };
  } catch {
    return isCurrent() ? { source: 'storage-error', tasks: [], pendingIds: [], pendingCount: 0, localCreatedIds: [] } : null;
  }
}
