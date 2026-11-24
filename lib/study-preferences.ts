import { parseDeadline } from './task-calendar';

export const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type StudyPreferences = Record<(typeof weekdays)[number], number>;
export const defaultPreferences: StudyPreferences = Object.fromEntries(weekdays.map(day => [day, 180])) as StudyPreferences;
export function normalizePreferences(value: Partial<StudyPreferences> | null): StudyPreferences {
  return Object.fromEntries(weekdays.map(day => [day, typeof value?.[day] === 'number' && Number.isInteger(value[day]) && value[day]! >= 0 && value[day]! <= 720 ? value[day] : 180])) as StudyPreferences;
}
export function availableMinutes(date: string, preferences: StudyPreferences = defaultPreferences): number {
  const parsed = parseDeadline(date);
  return parsed ? preferences[weekdays[(parsed.getUTCDay() + 6) % 7]] : 0;
}
