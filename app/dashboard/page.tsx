import Link from 'next/link';
import { redirect } from 'next/navigation';
import Sidebar from '../components/sidebar';
import { createClient } from '../../lib/supabase/server';
import { addCalendarDays, todayKey } from '../../lib/task-calendar';
import type { WorkloadTask } from '../../lib/workload';
import WorkloadPanel from './workload-panel';
import PlanPanel from './plan-panel';
import { loadPreferences } from '../../lib/study-preferences-store';
import { taskColumns, type TaskRow } from '../../lib/tasks';

async function fetchWorkloadTasks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  today: string,
) {
  const tasks: WorkloadTask[] = [];
  // Запас покрывает разницу часовых поясов сервера и браузера; UI показывает 7 дней.
  const start = addCalendarDays(today, -2);
  const end = addCalendarDays(today, 8);
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, deadline, estimated_minutes, status')
      .eq('user_id', userId)
      .or('status.neq.completed,status.is.null')
      .gte('deadline', start)
      .lte('deadline', end)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) return { data: [], error };
    tasks.push(...(data ?? []));
    if (!data || data.length < pageSize) return { data: tasks, error: null };
  }
}

async function fetchPlanTasks(client: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const tasks: TaskRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('tasks').select(taskColumns).eq('user_id', userId).or('status.neq.completed,status.is.null').order('id').range(offset, offset + 499);
    if (error) return { data: [], error };
    tasks.push(...(data ?? []));
    if (!data || data.length < 500) return { data: tasks, error: null };
  }
}

type UpcomingTask = {
  id: string;
  title: string | null;
  subject: string | null;
  deadline: string;
  estimated_minutes: number | null;
};

const cardStyles =
  'rounded-xl border border-[#e9ecef] bg-white p-6 shadow-[0_4px_6px_rgba(0,0,0,0.02),0_1px_3px_rgba(0,0,0,0.08)]';

function formatDeadline(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login');
  }

  // Дедлайны сохраняются формой задач как календарные даты YYYY-MM-DD.
  const today = todayKey();
  const [countResult, completedResult, upcomingResult, workloadResult, planResult, preferencesResult] = await Promise.all([
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'completed'),
    supabase
      .from('tasks')
      .select('id, title, subject, deadline, estimated_minutes')
      .eq('user_id', user.id)
      .or('status.neq.completed,status.is.null')
      .gte('deadline', today)
      .order('deadline', { ascending: true })
      .order('id', { ascending: true })
      .limit(5),
    fetchWorkloadTasks(supabase, user.id, today),
    fetchPlanTasks(supabase, user.id),
    loadPreferences(supabase, user.id),
  ]);

  if (countResult.error) {
    console.error('Ошибка загрузки количества задач:', countResult.error);
  }
  if (upcomingResult.error) {
    console.error('Ошибка загрузки ближайших задач:', upcomingResult.error);
  }
  if (completedResult.error) {
    console.error('Ошибка загрузки количества выполненных задач:', completedResult.error);
  }
  if (workloadResult.error) {
    console.error('Ошибка загрузки учебной нагрузки:', workloadResult.error);
  }

  const hasStatisticsError = !!(countResult.error || completedResult.error);
  const completedCount = completedResult.count ?? 0;
  const activeCount = Math.max(0, (countResult.count ?? 0) - completedCount);

  const upcomingTasks: UpcomingTask[] = upcomingResult.data ?? [];
  const nearestTask = upcomingTasks[0];
  const profileName: unknown = user.user_metadata?.full_name ?? user.user_metadata?.name;
  const name = typeof profileName === 'string' && profileName.trim()
    ? profileName.trim()
    : user.email?.split('@')[0];

  return (
    <div className="min-h-screen bg-[#E3F1FB] text-[#212529] lg:flex">
      <Sidebar activePath="/dashboard" email={user.email} />

      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:p-10">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8">
            <p className="mb-2 text-sm font-medium text-[#039be5]">Dashboard</p>
            <h1 className="break-words text-3xl font-bold tracking-tight text-[#2963af]">
              {name ? `Здравствуйте, ${name}!` : 'Добро пожаловать в FlowState!'}
            </h1>
            <p className="mt-3 text-sm text-[#6c757d] sm:text-base">
              Ваши задачи и ближайшие дедлайны — всё под рукой.
            </p>
          </header>

          <section aria-label="Быстрые действия" className="mb-8 flex flex-wrap gap-3">
            <Link
              href="/tasks"
              className="rounded-lg border border-[#dfe3e6] bg-white px-5 py-3 text-sm font-semibold text-[#495057] transition-colors hover:bg-[#e9ecef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7]"
            >
              Перейти к задачам
            </Link>
            <Link
              href="/tasks?create=1#task-form"
              className="rounded-lg bg-[#2963af] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#204f8a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7]"
            >
              Создать задачу
            </Link>
          </section>

          <section aria-label="Обзор задач" className="mb-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <article className={cardStyles}>
              <h2 className="text-sm font-medium text-[#6c757d]">Всего задач</h2>
              {countResult.error ? (
                <p role="alert" className="mt-3 text-sm text-red-700">
                  Не удалось загрузить количество задач.
                </p>
              ) : (
                <p className="mt-3 text-4xl font-bold text-[#2963af]">
                  {countResult.count ?? 0}
                </p>
              )}
              <p className="mt-2 text-sm text-[#6c757d]">Все задачи вашего аккаунта.</p>
            </article>

            <article className={cardStyles}>
              <h2 className="text-sm font-medium text-[#6c757d]">Активные задачи</h2>
              {hasStatisticsError ? (
                <p role="alert" className="mt-3 text-sm text-red-700">Не удалось загрузить статистику.</p>
              ) : (
                <p className="mt-3 text-4xl font-bold text-[#039be5]">{activeCount}</p>
              )}
              <p className="mt-2 text-sm text-[#6c757d]">Новые задачи и задачи в процессе.</p>
            </article>

            <article className={cardStyles}>
              <h2 className="text-sm font-medium text-[#6c757d]">Выполненные задачи</h2>
              {completedResult.error ? (
                <p role="alert" className="mt-3 text-sm text-red-700">Не удалось загрузить статистику.</p>
              ) : (
                <p className="mt-3 text-4xl font-bold text-emerald-700">{completedCount}</p>
              )}
              <p className="mt-2 text-sm text-[#6c757d]">Задачи, отмеченные выполненными.</p>
            </article>

            <article className={cardStyles}>
              <h2 className="text-sm font-medium text-[#6c757d]">Ближайший дедлайн</h2>
              {upcomingResult.error ? (
                <p className="mt-3 text-sm text-[#6c757d]">Данные недоступны.</p>
              ) : nearestTask ? (
                <>
                  <p className="mt-3 text-2xl font-bold text-[#2963af]">
                    <time dateTime={nearestTask.deadline}>
                      {formatDeadline(nearestTask.deadline)}
                    </time>
                  </p>
                  <p className="mt-2 break-words text-sm text-[#6c757d]">
                    {nearestTask.title || 'Без названия'}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-lg font-semibold text-[#2963af]">
                  Ближайших дедлайнов нет
                </p>
              )}
            </article>
          </section>

          {preferencesResult.error && <p role="alert" className="mb-4 text-red-700">Не удалось загрузить настройки доступности. План и нагрузка недоступны.</p>}
          {preferencesResult.preferences && <WorkloadPanel tasks={workloadResult.data} initialToday={today} hasError={!!workloadResult.error} availability={preferencesResult.preferences} />}
          <PlanPanel tasks={planResult.data} availability={preferencesResult.preferences} initialToday={today} hasError={!!planResult.error} />

          <section aria-labelledby="upcoming-tasks-heading">
            <h2 id="upcoming-tasks-heading" className="text-xl font-semibold text-[#2963af]">
              Ближайшие задачи
            </h2>
            <p className="mb-5 mt-2 text-sm text-[#6c757d]">
              До пяти активных задач со сроками от сегодняшнего дня, начиная с ближайших.
            </p>

            {upcomingResult.error ? (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Не удалось загрузить ближайшие задачи. Обновите страницу, чтобы повторить попытку.
              </p>
            ) : upcomingTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#ced4da] bg-white p-8 text-center">
                <h3 className="text-lg font-semibold text-[#2963af]">
                  {!countResult.error && countResult.count === 0
                    ? 'Задач пока нет'
                    : 'Нет задач с ближайшими дедлайнами'}
                </h3>
                <p className="mt-2 text-sm text-[#6c757d]">
                  Добавьте новую задачу или откройте полный список задач.
                </p>
              </div>
            ) : (
              <ul className="grid gap-5 md:grid-cols-2">
                {upcomingTasks.map((task) => (
                  <li key={task.id} className={cardStyles}>
                    <p className="text-sm font-medium text-[#039be5]">
                      {task.subject || 'Без предмета'}
                    </p>
                    <h3 className="mt-1 break-words text-lg font-semibold text-[#2963af]">
                      {task.title || 'Без названия'}
                    </h3>
                    <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[#e9ecef] pt-4">
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-[#adb5bd]">Дедлайн</dt>
                        <dd className="mt-1 text-sm font-medium text-[#495057]">
                          <time dateTime={task.deadline}>{formatDeadline(task.deadline)}</time>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-[#adb5bd]">Оценка времени</dt>
                        <dd className="mt-1 text-sm font-medium text-[#495057]">
                          {task.estimated_minutes ?? 0} минут
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
