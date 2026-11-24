import { redirect } from 'next/navigation';
import TasksContent from './tasks-content';
import Sidebar from '../components/sidebar';
import { createClient } from '../../lib/supabase/server';
import { taskColumns } from '../../lib/tasks';
import { parseDeadline, todayKey } from '../../lib/task-calendar';
import { loadPreferences } from '../../lib/study-preferences-store';
import type { TaskRow } from '../../lib/tasks';
import { loadTasksPage } from '../../lib/tasks-page-load';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[]; date?: string | string[] }>;
}) {
  const supabase = await createClient();

  const params = await searchParams;
  const result = await loadTasksPage({
    authenticate: () => supabase.auth.getUser(),
    environment: 'production',
    simulate: undefined,
    fetchTasks: async (user) => {
      const tasks: TaskRow[] = [];
      // Загружаем все страницы: план не должен зависеть от лимита Supabase.
      for (let offset = 0; ; offset += 500) {
        const page = await supabase.from('tasks').select(taskColumns).eq('user_id', user.id)
          .order('created_at', { ascending: false }).order('id').range(offset, offset + 499);
        if (page.error) throw page.error;
        tasks.push(...(page.data ?? []));
        if (!page.data || page.data.length < 500) break;
      }
      return tasks;
    },
  });
  if (!result.authenticated) redirect('/login');
  const { user, tasks, tasksError } = result;
  const preferencesResult = await loadPreferences(supabase, user.id);

  if (tasksError) {
    console.error('Ошибка загрузки задач из Supabase.');
  }

  const initialFormOpen = params.create === '1';
  const dateFilter = typeof params.date === 'string' && parseDeadline(params.date) ? params.date : '';

  return (
    <div className="min-h-screen bg-[#E3F1FB] text-[#212529] lg:flex">
      <Sidebar activePath="/tasks" email={user.email} />

      <TasksContent
        key={user.id}
        userId={user.id}
        initialFormOpen={initialFormOpen}
        dateFilter={dateFilter}
        initialTasks={tasksError ? [] : tasks}
        initialToday={todayKey()}
        availability={preferencesResult.preferences}
        initialLoadError={
          tasksError ? 'Не удалось загрузить задачи из Supabase. Обновите страницу и попробуйте снова.' : ''
        }
      />
    </div>
  );
}
