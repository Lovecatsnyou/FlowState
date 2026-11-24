import type { TaskRow } from './tasks';

type AuthResult<User> = { data: { user: User | null }; error: unknown };
type LoadResult<User> =
  | { authenticated: false }
  | { authenticated: true; user: User; tasks: TaskRow[]; tasksError: boolean; simulated: boolean };

/** Проверка Auth всегда предшествует загрузке задач и диагностическому ответу. */
export async function loadTasksPage<User>(options: {
  authenticate: () => Promise<AuthResult<User>>;
  fetchTasks: (user: User) => Promise<TaskRow[]>;
  environment: string | undefined;
  simulate: string | string[] | undefined;
}): Promise<LoadResult<User>> {
  const { data: { user }, error } = await options.authenticate();
  if (error || !user) return { authenticated: false };

  const simulated = options.environment === 'development' && options.simulate === '1';
  if (simulated) return { authenticated: true, user, tasks: [], tasksError: true, simulated: true };
  try {
    const tasks = await options.fetchTasks(user);
    return { authenticated: true, user, tasks, tasksError: false, simulated: false };
  } catch {
    return { authenticated: true, user, tasks: [], tasksError: true, simulated: false };
  }
}
