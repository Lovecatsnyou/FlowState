'use client';

import { useMemo, useState } from 'react';
import { createCalendarPlan } from '../../lib/calendar-plan';
import { useLocalDay } from '../../lib/use-local-day';
import type { StudyPreferences } from '../../lib/study-preferences';
import {
  taskPriorityStyles,
  taskStatusLabels,
  taskStatusStyles,
  type Task,
} from '../../lib/tasks';
import {
  formatCalendarDate,
  getCalendarDays,
  monthForDate,
  parseDeadline,
  shiftMonth,
  todayKey,
} from '../../lib/task-calendar';

type TasksCalendarProps = {
  tasks: Task[];
  onEdit: (task: Task) => void;
  isBusy: boolean;
  initialDate?: string;
  initialToday: string;
  allTasks: Task[];
  availability: StudyPreferences | null;
  onOpenTask: (id: string) => void;
};

const buttonStyles = 'rounded-lg border border-[#dfe3e6] bg-white px-3 py-2 text-sm font-semibold text-[#495057] transition-colors hover:bg-[#f8f9fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7]';

function CalendarTask({ task, onEdit, isBusy }: Pick<TasksCalendarProps, 'onEdit' | 'isBusy'> & { task: Task }) {
  return (
    <button
      type="button"
      onClick={() => onEdit(task)}
      {...{ autoComplete: 'off' }}
      disabled={isBusy}
      aria-label={`Редактировать задачу «${task.title || 'Без названия'}»: ${task.priority}, ${taskStatusLabels[task.status]}`}
      title={task.title || 'Без названия'}
      className={`block w-full min-w-0 rounded-lg border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7] disabled:cursor-not-allowed disabled:opacity-60 ${
        task.status === 'completed'
          ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50'
          : 'border-[#e9ecef] bg-white hover:bg-sky-50'
      }`}
    >
      <span className={`block truncate text-sm font-medium ${task.status === 'completed' ? 'text-[#6c757d] line-through' : 'text-[#2963af]'}`}>
        {task.title || 'Без названия'}
      </span>
      <span className="mt-1 flex flex-wrap gap-1">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${taskPriorityStyles[task.priority]}`}>
          {task.priority}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${taskStatusStyles[task.status]}`}>
          {taskStatusLabels[task.status]}
        </span>
      </span>
    </button>
  );
}

export default function TasksCalendar({ tasks, allTasks, availability, onEdit, onOpenTask, isBusy, initialDate, initialToday }: TasksCalendarProps) {
  const today = useLocalDay(initialToday);
  const startDate = initialDate && parseDeadline(initialDate) ? initialDate : initialToday;
  const [selectedDate, setSelectedDate] = useState(startDate);
  const [month, setMonth] = useState(() => monthForDate(startDate));
  const plan = useMemo(() => availability ? createCalendarPlan(allTasks.map(task => ({
    id: task.id, title: task.title, subject: task.subject, deadline: task.deadline,
    estimated_minutes: task.estimatedMinutes, priority: task.priority, status: task.status,
  })), today, availability) : null, [allTasks, today, availability]);
  const days = getCalendarDays(month);
  const monthLabel = formatCalendarDate(`${String(month.year).padStart(4, '0')}-${String(month.month + 1).padStart(2, '0')}-01`, {
    month: 'long', year: 'numeric',
  });
  const byDate = new Map<string, Task[]>();
  const undatedTasks: Task[] = [];

  // Сохраняем порядок, заданный фильтрами и сортировкой страницы задач.
  for (const task of tasks) {
    if (!parseDeadline(task.deadline)) {
      undatedTasks.push(task);
      continue;
    }
    const items = byDate.get(task.deadline) ?? [];
    items.push(task);
    byDate.set(task.deadline, items);
  }

  const selectedTasks = byDate.get(selectedDate) ?? [];
  const selectedPlan = plan?.day(selectedDate);

  function selectDate(value: string) {
    setSelectedDate(value);
    setMonth(monthForDate(value));
  }

  function changeMonth(offset: number) {
    const next = shiftMonth(month, offset);
    setMonth(next);
    setSelectedDate(`${String(next.year).padStart(4, '0')}-${String(next.month + 1).padStart(2, '0')}-01`);
  }

  const taskProps = { onEdit, isBusy };

  return (
    <section aria-label="Календарь задач" className="space-y-5">
      <div className="rounded-xl border border-[#e9ecef] bg-white p-4 shadow-sm sm:p-5">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 aria-live="polite" className="text-xl font-semibold capitalize text-[#2963af]">
            {monthLabel}
          </h3>
          <div className="flex gap-2">
            <button type="button" aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)} className={buttonStyles}>←</button>
            <button type="button" onClick={() => selectDate(todayKey())} className={buttonStyles}>Сегодня</button>
            <button type="button" aria-label="Следующий месяц" onClick={() => changeMonth(1)} className={buttonStyles}>→</button>
          </div>
        </header>
        <p className="mb-4 text-sm text-[#6c757d]">
          Выберите день для подробностей. Дедлайны показаны карточками; занятия отмечены синим. План учитывает все задачи, независимо от фильтров.
        </p>
        <div className="overflow-x-auto">
          <div className="min-w-[630px]">
            <div className="mb-2 grid grid-cols-7 text-center text-xs font-semibold text-[#6c757d]">
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[#e9ecef] bg-[#e9ecef]">
              {days.map((day) => {
                const dayTasks = byDate.get(day.key) ?? [];
                const dayPlan = plan?.day(day.key);
                return (
                  <div key={day.key} className={`min-w-0 p-1.5 ${day.isCurrentMonth ? 'bg-white' : 'bg-[#f8f9fa]'}`}>
                    <button
                      type="button"
                      onClick={() => selectDate(day.key)}
                      aria-pressed={selectedDate === day.key}
                      aria-current={today === day.key ? 'date' : undefined}
                      aria-label={`${formatCalendarDate(day.key, { day: 'numeric', month: 'long', year: 'numeric' })}, дедлайнов: ${dayTasks.length}${dayPlan ? `, занятия: ${dayPlan.totalMinutes} минут` : ''}`}
                      className={`mb-2 w-full rounded-md px-2 py-1 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7] ${
                        selectedDate === day.key
                          ? 'bg-[#039be5] text-white'
                          : today === day.key
                            ? 'bg-sky-50 text-[#039be5] ring-1 ring-inset ring-sky-200'
                            : day.isCurrentMonth
                              ? 'text-[#495057] hover:bg-sky-50'
                              : 'text-[#adb5bd] hover:bg-sky-50'
                      }`}
                    >
                      <time dateTime={day.key}>{day.day}</time>
                    </button>
                    {dayPlan && <p className="mb-1 rounded bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">Занятия: {dayPlan.totalMinutes} мин</p>}
                    <div className="min-h-24 space-y-1">
                      {dayTasks.length > 0 && <p className="px-1 text-[10px] font-semibold uppercase text-[#6c757d]">Дедлайны</p>}
                      {dayTasks.slice(0, 3).map((task) => <CalendarTask key={task.id} task={task} {...taskProps} />)}
                      {dayTasks.length > 3 && (
                        <button type="button" onClick={() => selectDate(day.key)} className="w-full rounded px-2 py-1 text-left text-xs font-semibold text-[#039be5] hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-[#4fc3f7]">
                          Ещё {dayTasks.length - 3}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <section aria-labelledby="selected-day-heading" className="rounded-xl border border-[#e9ecef] bg-white p-5">
        <h3 id="selected-day-heading" aria-live="polite" className="mb-3 text-lg font-semibold text-[#2963af]">
          {formatCalendarDate(selectedDate, { day: 'numeric', month: 'long', year: 'numeric' })} · Дедлайны ({selectedTasks.length})
        </h3>
        {!availability ? <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Не удалось загрузить настройки доступности. Учебный план недоступен; обновите страницу.</p> : !selectedPlan ? <p className="mb-4 text-sm text-[#6c757d]">Учебный план на эту дату не рассчитан.</p> : <div className="mb-5 rounded-lg bg-sky-50 p-4">
          <h4 className="font-semibold text-sky-800">Запланированные занятия</h4>
          <p className="mt-1 text-sm text-sky-800">Запланировано: {selectedPlan.totalMinutes} мин · Доступно: {selectedPlan.availableMinutes} мин · Свободно: {selectedPlan.freeMinutes} мин</p>
          {selectedPlan.tasks.length === 0 ? <p className="mt-2 text-sm text-[#6c757d]">Занятий нет.</p> : <ul className="mt-2 space-y-2">{selectedPlan.tasks.map(item => <li key={item.taskId}><button type="button" {...{ autoComplete: 'off' }} disabled={isBusy} onClick={() => onOpenTask(item.taskId)} className="text-left text-sm font-medium text-[#0277bd] underline disabled:opacity-60">{item.title} — {item.minutes} мин</button></li>)}</ul>}
        </div>}
        <h4 className="mb-2 font-semibold text-[#2963af]">Задачи с дедлайном в этот день</h4>
        {selectedTasks.length === 0 ? (
          <p className="text-sm text-[#6c757d]">На выбранную дату нет задач с текущими фильтрами.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {selectedTasks.map((task) => <CalendarTask key={task.id} task={task} {...taskProps} />)}
          </div>
        )}
      </section>

      {undatedTasks.length > 0 && (
        <section aria-labelledby="undated-tasks-heading" className="rounded-xl border border-[#e9ecef] bg-white p-5">
          <h3 id="undated-tasks-heading" className="text-lg font-semibold text-[#2963af]">Без даты ({undatedTasks.length})</h3>
          <p className="mb-3 mt-1 text-sm text-[#6c757d]">Дедлайн отсутствует или некорректен. Откройте задачу, чтобы указать дату.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {undatedTasks.map((task) => <CalendarTask key={task.id} task={task} {...taskProps} />)}
          </div>
        </section>
      )}
    </section>
  );
}
