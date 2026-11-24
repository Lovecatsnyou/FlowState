import type { TaskRow } from './tasks';
import { addCalendarDays, parseDeadline } from './task-calendar';
import { availableMinutes, defaultPreferences, type StudyPreferences } from './study-preferences';

export type PlanItem = { taskId: string; title: string; minutes: number };
export type PlanIssue = { taskId: string; title: string; reason: 'invalid_deadline' | 'overdue' | 'insufficient_time'; unallocatedMinutes: number };
export function buildStudyPlan(tasks: readonly TaskRow[], today: string, availability: StudyPreferences = defaultPreferences) {
  if (!parseDeadline(today)) throw new Error('Некорректная текущая дата.');
  const days = new Map<string, PlanItem[]>();
  const issues: PlanIssue[] = [];
  const priority = (p: string | null) => p === 'Высокий' ? 2 : p === 'Низкий' ? 0 : 1;
  const sorted = tasks.filter(t => t.status !== 'completed').slice().sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? '') || priority(b.priority) - priority(a.priority) || a.id.localeCompare(b.id));
  for (const task of sorted) {
    let remaining = typeof task.estimated_minutes === 'number' && Number.isFinite(task.estimated_minutes) && task.estimated_minutes > 0 ? task.estimated_minutes : 60;
    const title = task.title || 'Без названия';
    if (!task.deadline || !parseDeadline(task.deadline) || task.deadline < today) {
      issues.push({ taskId: task.id, title, reason: !task.deadline || !parseDeadline(task.deadline) ? 'invalid_deadline' : 'overdue', unallocatedMinutes: remaining });
      continue;
    }
    // При полностью закрытой неделе нет смысла обходить даты до дедлайна.
    if (Object.values(availability).some(value => value > 0)) {
      for (let date = today; date <= task.deadline && remaining > 0; date = addCalendarDays(date, 1)) {
        const entries = days.get(date) ?? [];
        const free = Math.max(0, availableMinutes(date, availability) - entries.reduce((sum, item) => sum + item.minutes, 0));
        const minutes = Math.min(free, remaining);
        if (minutes > 0) { entries.push({ taskId: task.id, title, minutes }); days.set(date, entries); remaining -= minutes; }
      }
    }
    if (remaining > 0) issues.push({ taskId: task.id, title, reason: 'insufficient_time', unallocatedMinutes: remaining });
  }
  return { days: Array.from(days, ([date, tasks]) => ({ date, tasks })).sort((a, b) => a.date.localeCompare(b.date)), issues };
}
