export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export type TaskPriority = 'Низкий' | 'Средний' | 'Высокий';

export type Task = {
  id: string;
  subject: string;
  title: string;
  deadline: string;
  estimatedMinutes: number;
  priority: TaskPriority;
  status: TaskStatus;
};

export const taskPriorityStyles: Record<TaskPriority, string> = {
  Низкий: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  Средний: 'bg-amber-50 text-amber-700 ring-amber-600/10',
  Высокий: 'bg-red-50 text-red-700 ring-red-600/10',
};

export function normalizeTaskPriority(value: string | null): TaskPriority {
  return value === 'Низкий' || value === 'Средний' || value === 'Высокий'
    ? value
    : 'Средний';
}

export const taskStatuses: TaskStatus[] = ['pending', 'in_progress', 'completed'];

export const taskStatusLabels: Record<TaskStatus, string> = {
  pending: 'Новая',
  in_progress: 'В процессе',
  completed: 'Выполнена',
};

export const taskStatusStyles: Record<TaskStatus, string> = {
  pending: 'bg-slate-100 text-slate-700 ring-slate-600/10',
  in_progress: 'bg-sky-50 text-sky-700 ring-sky-600/10',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return value === 'pending' || value === 'in_progress' || value === 'completed';
}

export function normalizeTaskStatus(value: string | null | undefined): TaskStatus {
  return isTaskStatus(value) ? value : 'pending';
}

export type TaskRow = {
  id: string;
  created_at?: string;
  title: string | null;
  subject: string | null;
  deadline: string | null;
  estimated_minutes: number | null;
  priority: string | null;
  // Старые снимки задач без статуса отображаются как новые.
  status?: string | null;
};

export const taskColumns = 'id, title, subject, deadline, estimated_minutes, priority, status, created_at';
