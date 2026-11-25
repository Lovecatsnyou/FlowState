'use client';

import Link from 'next/link';
import { formatCalendarDate } from '../../lib/task-calendar';
import { useLocalDay } from '../../lib/use-local-day';
import { analyzeWorkload, type WorkloadTask, type WorkloadLevel } from '../../lib/workload';

import type { StudyPreferences } from '../../lib/study-preferences';

const levelLabels: Record<WorkloadLevel, string> = {
  low: 'Низкая', medium: 'Средняя', high: 'Высокая',
};
const levelStyles: Record<WorkloadLevel, string> = {
  low: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  medium: 'bg-amber-50 text-amber-700 ring-amber-600/10',
  high: 'bg-red-50 text-red-700 ring-red-600/10',
};

function taskCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14
    ? 'задач'
    : last === 1 ? 'задача' : last >= 2 && last <= 4 ? 'задачи' : 'задач';
  return `${count} ${noun}`;
}

export default function WorkloadPanel({ tasks, initialToday, hasError, availability }: {
  tasks: WorkloadTask[];
  availability: StudyPreferences;
  initialToday: string;
  hasError: boolean;
}) {
  // Серверная дата используется для гидратации; затем — локальная дата браузера.
  const today = useLocalDay(initialToday);
  const days = analyzeWorkload(tasks, today, availability);
  const hasHighLoad = days.some((day) => day.level === 'high');

  return (
    <section aria-labelledby="workload-heading" className="mb-8">
      <h2 id="workload-heading" className="text-xl font-semibold text-[#256569]">Учебная нагрузка</h2>
      <p className="mb-4 mt-2 text-sm text-[#6c757d]">
        Активные задачи на ближайшие 7 дней. Нажмите на день, чтобы открыть его задачи.
      </p>
      {hasError ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Не удалось загрузить учебную нагрузку. Обновите страницу, чтобы попробовать снова.
        </p>
      ) : (
        <>
          {hasHighLoad && (
            <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              В ближайшие дни есть высокая нагрузка. Обратите внимание на отмеченные дни.
            </p>
          )}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
            {days.map((day, index) => (
              <li key={day.date} className="min-w-0">
                <Link
                  href={`/tasks?date=${day.date}`}
                  className={`block h-full rounded-xl border bg-white p-3 shadow-sm transition-colors hover:bg-[#f8f9fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7] ${day.level === 'high' ? 'border-red-200' : 'border-[#e9ecef]'}`}
                >
                  <h3 className="text-sm font-semibold text-[#256569]">
                    {index === 0 ? 'Сегодня' : index === 1 ? 'Завтра' : formatCalendarDate(day.date, { weekday: 'short' })}
                  </h3>
                  <time dateTime={day.date} className="mt-1 block text-xs text-[#6c757d]">
                    {formatCalendarDate(day.date, { day: 'numeric', month: 'short' })}
                  </time>
                  <p className="mt-3 text-sm text-[#495057]">{taskCountLabel(day.taskCount)}</p>
                  <p className="mt-1 text-lg font-semibold text-[#3f3f3f]">{day.totalMinutes} мин</p>
                  <span className={`mt-3 inline-block rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${levelStyles[day.level]}`}>
                    {levelLabels[day.level]} нагрузка
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
