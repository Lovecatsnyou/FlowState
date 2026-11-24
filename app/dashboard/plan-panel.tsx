'use client';
import Link from 'next/link';
import { buildStudyPlan } from '../../lib/planner';
import { formatCalendarDate } from '../../lib/task-calendar';
import { useLocalDay } from '../../lib/use-local-day';
import type { StudyPreferences } from '../../lib/study-preferences';
import type { TaskRow } from '../../lib/tasks';

export default function PlanPanel({ tasks, availability, initialToday, hasError }: { tasks: TaskRow[]; availability: StudyPreferences | null; initialToday: string; hasError: boolean }) {
  const today = useLocalDay(initialToday);
  const plan = availability && !hasError ? buildStudyPlan(tasks, today, availability) : null;
  return <section className="mb-8" aria-labelledby="plan-heading"><h2 id="plan-heading" className="text-xl font-semibold text-[#2963af]">Рекомендуемый план</h2>
    {!plan ? <p role="alert" className="mt-4 text-red-700">Не удалось построить план.</p> : <div className="mt-4 space-y-3">{plan.days.length === 0 && plan.issues.length === 0 && <p className="mt-4 text-[#6c757d]">Нет задач для планирования.</p>}{plan.days.map(day => <div key={day.date} className="rounded-xl border border-[#e9ecef] bg-white p-6 shadow-sm"><h3 className="font-semibold text-[#2963af]"><time dateTime={day.date}>{formatCalendarDate(day.date, { day: 'numeric', month: 'long', year: 'numeric' })}</time></h3><ul className="mt-2 space-y-2">{day.tasks.map(item => <li key={item.taskId}><Link className="text-[#039be5] underline" href={`/tasks#task-${encodeURIComponent(item.taskId)}`}>{item.title}</Link> — {item.minutes} мин</li>)}</ul></div>)}{plan.issues.map(issue => <p key={issue.taskId} role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><Link className="underline" href={`/tasks#task-${encodeURIComponent(issue.taskId)}`}>{issue.title}</Link>: {issue.reason === 'overdue' ? 'дедлайн прошёл' : issue.reason === 'invalid_deadline' ? 'некорректный дедлайн' : 'недостаточно времени'}; не распределено {issue.unallocatedMinutes} мин.</p>)}</div>}
  </section>;
}
