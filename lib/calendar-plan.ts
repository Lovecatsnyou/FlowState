import { buildStudyPlan, type PlanItem } from './planner';
import { availableMinutes, type StudyPreferences } from './study-preferences';
import { parseDeadline } from './task-calendar';
import type { TaskRow } from './tasks';

// Горизонт заканчивается последним корректным дедлайном активных задач.
export function createCalendarPlan(tasks: readonly TaskRow[], today: string, availability: StudyPreferences) {
  const plan = buildStudyPlan(tasks, today, availability);
  const end = tasks.reduce<string | null>((last, task) => {
    const date = task.deadline;
    return task.status !== 'completed' && date && parseDeadline(date) && date >= today && (!last || date > last) ? date : last;
  }, null);
  const byDate = new Map(plan.days.map(day => [day.date, day.tasks]));
  return {
    day(date: string): { tasks: PlanItem[]; totalMinutes: number; availableMinutes: number; freeMinutes: number } | null {
      if (!parseDeadline(date) || !end || date < today || date > end) return null;
      const items = byDate.get(date) ?? [];
      const totalMinutes = items.reduce((sum, item) => sum + item.minutes, 0);
      const limit = availableMinutes(date, availability);
      return { tasks: items, totalMinutes, availableMinutes: limit, freeMinutes: Math.max(0, limit - totalMinutes) };
    },
  };
}
