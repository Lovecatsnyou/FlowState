import type { TaskRow } from './tasks';
import { addCalendarDays, parseDeadline } from './task-calendar';
import { availableMinutes, defaultPreferences, type StudyPreferences } from './study-preferences';

export type WorkloadTask = Pick<TaskRow, 'deadline' | 'estimated_minutes' | 'status'>;
export type WorkloadLevel = 'low' | 'medium' | 'high';
export type WorkloadDay = {
  date: string;
  taskCount: number;
  totalMinutes: number;
  level: WorkloadLevel;
};

export function getWorkloadLevel(minutes: number, available = 180): WorkloadLevel {
  if (minutes > available) return 'high';
  if (minutes > available / 2) return 'medium';
  return 'low';
}

/** Принимает задачи, уже ограниченные текущим пользователем на стороне сервера. */
export function analyzeWorkload(tasks: readonly WorkloadTask[], today: string, availability: StudyPreferences = defaultPreferences): WorkloadDay[] {
  const days: WorkloadDay[] = Array.from({ length: 7 }, (_, index) => ({
    date: addCalendarDays(today, index), taskCount: 0, totalMinutes: 0, level: 'low',
  }));
  const byDate = new Map(days.map((day) => [day.date, day]));

  for (const task of tasks) {
    if (task.status === 'completed' || !task.deadline || !parseDeadline(task.deadline)) continue;
    const day = byDate.get(task.deadline);
    if (!day) continue;

    day.taskCount += 1;
    const minutes = task.estimated_minutes;
    // Не скрываем задачу из количества, даже если её время нельзя использовать.
    if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) {
      day.totalMinutes += minutes;
    }
  }

  for (const day of days) day.level = getWorkloadLevel(day.totalMinutes, availableMinutes(day.date, availability));
  return days;
}
