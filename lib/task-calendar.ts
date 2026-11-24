export type CalendarMonth = { year: number; month: number };

function dateKey(date: Date) {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

// deadline — календарная дата YYYY-MM-DD, а не момент времени в часовом поясе.
export function parseDeadline(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && dateKey(date) === value ? date : null;
}

export function todayKey(date = new Date()) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addCalendarDays(value: string, offset: number) {
  const date = parseDeadline(value);
  if (!date) throw new Error('Некорректная календарная дата.');
  date.setUTCDate(date.getUTCDate() + offset);
  return dateKey(date);
}

export function monthForDate(value: string): CalendarMonth {
  const date = parseDeadline(value);
  if (!date) throw new Error('Некорректная календарная дата.');
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

export function shiftMonth({ year, month }: CalendarMonth, offset: number): CalendarMonth {
  const date = new Date(0);
  date.setUTCFullYear(year, month + offset, 1);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

export function getCalendarDays({ year, month }: CalendarMonth) {
  const first = new Date(0);
  first.setUTCFullYear(year, month, 1);
  const offset = (first.getUTCDay() + 6) % 7; // Неделя начинается с понедельника.
  const last = new Date(first);
  last.setUTCMonth(month + 1, 0);
  const cellCount = Math.ceil((offset + last.getUTCDate()) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(1 - offset + index);
    return {
      key: dateKey(date),
      day: date.getUTCDate(),
      isCurrentMonth: date.getUTCFullYear() === year && date.getUTCMonth() === month,
    };
  });
}

export function formatCalendarDate(value: string, options: Intl.DateTimeFormatOptions) {
  const date = parseDeadline(value);
  return date
    ? new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: 'UTC' }).format(date)
    : value;
}
