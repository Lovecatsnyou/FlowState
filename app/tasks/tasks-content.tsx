'use client';

import { startTransition, useEffect, useRef, useState, type FormEvent } from 'react';
import type { StudyPreferences } from '../../lib/study-preferences';
import { todayKey } from '../../lib/task-calendar';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { updateTaskStatus } from './actions';
import TasksCalendar from './tasks-calendar';
import { defaultEstimatedMinutes, estimatedTimeAfterTitleChange } from '../../lib/task-estimation';
import {
  isTaskStatus,
  normalizeTaskStatus,
  normalizeTaskPriority as normalizePriority,
  taskPriorityStyles as priorityStyles,
  taskColumns,
  taskStatuses,
  taskStatusLabels,
  taskStatusStyles,
  type TaskRow,
  type TaskStatus,
  type Task,
  type TaskPriority as Priority,
} from '../../lib/tasks';

// Firefox может восстанавливать динамический disabled после перезагрузки.
// Атрибут на самих элементах отключает восстановление их прошлого состояния.
const noControlStateRestore = { autoComplete: 'off' };

type TaskView = 'list' | 'calendar';

type TaskFilters = {
  status: 'all' | TaskStatus;
  priority: 'all' | Priority;
  sort: 'deadline' | 'priority' | 'newest';
};

const defaultFilters: TaskFilters = {
  status: 'all',
  priority: 'all',
  sort: 'newest',
};

const priorityRank: Record<Priority, number> = {
  Низкий: 1,
  Средний: 2,
  Высокий: 3,
};

type TaskFormValues = {
  title: string;
  subject: string;
  deadline: string;
  estimatedTime: string;
  priority: Priority;
};

type TasksContentProps = {
  userId: string;
  initialTasks: TaskRow[];
  initialToday?: string;
  availability?: StudyPreferences | null;
  initialLoadError: string;
  initialFormOpen?: boolean;
  dateFilter?: string;
};

const initialFormValues: TaskFormValues = {
  title: '',
  subject: '',
  deadline: '',
  estimatedTime: String(defaultEstimatedMinutes),
  priority: 'Средний',
};

const fieldStyles =
  'mt-2 block w-full rounded-lg border border-[#dfe3e6] bg-white px-3 py-2.5 text-sm text-[#212529] shadow-sm outline-none transition placeholder:text-[#adb5bd] focus:border-[#4fc3f7] focus:ring-2 focus:ring-[#4fc3f7]/20';

function formatDeadline(value: string) {
  if (!value) {
    return 'Не указан';
  }

  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(new Date(year, month - 1, day));
}

function mapTask(task: TaskRow): Task {
  return {
    id: task.id,
    title: task.title ?? '',
    subject: task.subject ?? '',
    deadline: task.deadline ?? '',
    estimatedMinutes: task.estimated_minutes ?? 0,
    priority: normalizePriority(task.priority),
    status: normalizeTaskStatus(task.status),
  };
}

export default function TasksContent(props: TasksContentProps) {
  // Фильтры сохраняются при пересоздании формы после /tasks?create=1.
  const [filters, setFilters] = useState<TaskFilters>(defaultFilters);
  const [view, setView] = useState<TaskView>('list');

  return (
    <TasksWorkspace
      key={props.initialFormOpen ? 'create' : 'list'}
      {...props}
      filters={filters}
      onFiltersChange={setFilters}
      view={view}
      onViewChange={setView}
    />
  );
}

function TasksWorkspace({
  userId,
  initialTasks,
  initialLoadError,
  initialToday = todayKey(),
  availability = null,
  initialFormOpen = false,
  dateFilter = '',
  filters,
  onFiltersChange,
  view,
  onViewChange,
}: TasksContentProps & {
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  view: TaskView;
  onViewChange: (view: TaskView) => void;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(() => initialLoadError ? [] : initialTasks.map(mapTask));

  const [targetTask, setTargetTask] = useState<{ id: string } | null>(null);
  const scrolledTarget = useRef<typeof targetTask>(null);
  useEffect(() => {
    if (view !== 'list' || dateFilter || !targetTask || scrolledTarget.current === targetTask) return;
    const element = document.getElementById(`task-${targetTask.id}`);
    if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); scrolledTarget.current = targetTask; }
  }, [view, dateFilter, targetTask, filters]);

  const [readState, setReadState] = useState<'server' | 'error' | 'unverified'>(initialLoadError ? 'error' : 'server');
  const verified = useRef(true);

  useEffect(() => {
    verified.current = true;
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.id !== userId) {
        verified.current = false;
        setTasks([]);
        setReadState('unverified');
        router.refresh();
      }
    });
    return () => { verified.current = false; subscription.unsubscribe(); };
  }, [userId, router]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || !verified.current) return;
      setTasks(initialLoadError ? [] : initialTasks.map(mapTask));
      setReadState(initialLoadError ? 'error' : 'server');
    });
    return () => { cancelled = true; };
  }, [initialTasks, initialLoadError]);

  const loadError = initialLoadError || (readState === 'error' ? 'Не удалось загрузить задачи из Supabase. Обновите страницу и попробуйте снова.' : '');

  const [isFormOpen, setIsFormOpen] = useState(initialFormOpen);

  const [formValues, setFormValues] =
    useState<TaskFormValues>(initialFormValues);
  const [isTimeManuallyEdited, setIsTimeManuallyEdited] = useState(false);

  const [editingTaskId, setEditingTaskId] =
    useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [deletingTaskId, setDeletingTaskId] =
    useState<string | null>(null);

  const [submitError, setSubmitError] = useState('');
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState('');

  // Исходный массив уже упорядочен по created_at DESC; CRUD сохраняет этот порядок.
  // filter создаёт новый массив, поэтому sort не изменяет состояние tasks.
  const visibleTasks = tasks.filter((task) =>
    (filters.status === 'all' || task.status === filters.status) &&
    (filters.priority === 'all' || task.priority === filters.priority) &&
    (!dateFilter || task.deadline === dateFilter)
  );

  if (filters.sort === 'deadline') {
    visibleTasks.sort((a, b) => {
      if (!a.deadline) return b.deadline ? 1 : 0;
      if (!b.deadline) return -1;
      return a.deadline.localeCompare(b.deadline);
    });
  } else if (filters.sort === 'priority') {
    visibleTasks.sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority]);
  }

  const activeTasks = visibleTasks.filter((task) => task.status !== 'completed');
  const completedTasks = visibleTasks.filter((task) => task.status === 'completed');
  const isBusy = isSubmitting || deletingTaskId !== null || updatingTaskId !== null || readState !== 'server' || !!initialLoadError;
  const canEditTask = (id: string) => !isBusy && tasks.some(task => task.id === id);

  async function withVerifiedSession<T>(work: () => Promise<T>): Promise<T> {
    if (!verified.current) throw new Error('Сессия не подтверждена.');
    return work();
  }

  function handleStatusChange(task: Task, status: TaskStatus) {
    if (!canEditTask(task.id) || task.status === status) return;
    setUpdatingTaskId(task.id);
    setStatusError('');
    startTransition(async () => {
      try {
        await withVerifiedSession(async () => {
          const online = await updateTaskStatus(task.id, status);
          if (!verified.current) return;
          if (online.success === false) { setStatusError(online.error); return; }
          setTasks(current => current.map(item => item.id === task.id ? mapTask(online.task) : item));
          router.refresh();
        });
      } catch (error) {
        console.error('Ошибка изменения статуса задачи:', error);
        if (verified.current) setStatusError('Не удалось сохранить изменение. Проверьте состояние задачи перед повтором.');
      } finally { setUpdatingTaskId(null); }
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isBusy) {
      return;
    }

    setSubmitError('');

    const estimatedMinutes = Number(formValues.estimatedTime);
    const title = formValues.title.trim();
    const subject = formValues.subject.trim();

    if (!title || !subject) {
      setSubmitError('Заполните название задачи и предмет.');
      return;
    }

    if (!formValues.deadline) {
      setSubmitError('Укажите дедлайн.');
      return;
    }

    if (
      !Number.isFinite(estimatedMinutes) ||
      estimatedMinutes <= 0
    ) {
      setSubmitError('Укажите корректное время выполнения.');
      return;
    }

    setIsSubmitting(true);
    try {
      await withVerifiedSession(async () => {
        const editing = editingTaskId ? tasks.find(task => task.id === editingTaskId) : null;
        if (editingTaskId && !editing) throw new Error('Задача не найдена.');
        const changes = { title, subject, deadline: formValues.deadline, estimated_minutes: estimatedMinutes, priority: formValues.priority };
        const supabase = createClient();
        const response = editingTaskId
          ? await supabase.from('tasks').update(changes).eq('id', editingTaskId).eq('user_id', userId).select(taskColumns).single()
          : await supabase.from('tasks').insert({ user_id: userId, ...changes, status: 'pending' }).select(taskColumns).single();
        if (!verified.current) return;
        if (response.error || !response.data) {
          setSubmitError('Не удалось подтвердить сохранение. Проверьте задачи на сервере перед повтором.');
          return;
        }
        const updated = mapTask(response.data);
        setTasks(current => editingTaskId ? current.map(task => task.id === editingTaskId ? updated : task) : [updated, ...current]);
        closeForm();
        router.refresh();
      });
    } catch (error) {
      console.error('Ошибка сохранения задачи:', error);
      if (verified.current) setSubmitError('Не удалось подтвердить сохранение. Проверьте задачи на сервере перед повтором.');
    } finally { setIsSubmitting(false); }
  }

  function handleEdit(task: Task) {
    if (!canEditTask(task.id)) {
      return;
    }
    setEditingTaskId(task.id);
    setIsTimeManuallyEdited(true);

    setFormValues({
      title: task.title,
      subject: task.subject,
      deadline: task.deadline,
      estimatedTime: String(task.estimatedMinutes),
      priority: task.priority,
    });

    setSubmitError('');
    setIsFormOpen(true);

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  async function handleDelete(taskId: string) {
    if (!canEditTask(taskId)) {
      return;
    }
    const confirmed = window.confirm(
      'Вы уверены, что хотите удалить эту задачу?'
    );

    if (!confirmed) {
      return;
    }

    setDeletingTaskId(taskId);
    try {
      await withVerifiedSession(async () => {
        const task = tasks.find(item => item.id === taskId);
        if (!task) throw new Error('Задача не найдена.');
        const { data, error } = await createClient().from('tasks').delete().eq('id', taskId).eq('user_id', userId).select('id').maybeSingle();
        if (!verified.current) return;
        if (error || !data) { alert('Не удалось подтвердить удаление. Проверьте задачи на сервере перед повтором.'); return; }
        setTasks(current => current.filter(item => item.id !== taskId));
        if (editingTaskId === taskId) {
          setEditingTaskId(null);
          setFormValues(initialFormValues);
          setIsTimeManuallyEdited(false);
          setIsFormOpen(false);
        }
        router.refresh();
      });
    } catch (error) {
      console.error('Ошибка удаления задачи:', error);
      if (verified.current) alert('Не удалось подтвердить удаление. Проверьте задачи на сервере перед повтором.');
    } finally { setDeletingTaskId(null); }
  }

  function openCreateForm() {
    setEditingTaskId(null);
    setFormValues(initialFormValues);
    setIsTimeManuallyEdited(false);
    setSubmitError('');
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingTaskId(null);
    setFormValues(initialFormValues);
    setIsTimeManuallyEdited(false);
    setSubmitError('');
    if (initialFormOpen) {
      router.replace(dateFilter ? `/tasks?date=${dateFilter}` : '/tasks', { scroll: false });
    }
  }

  function toggleForm() {
    if (isFormOpen) {
      closeForm();
      return;
    }

    openCreateForm();
  }

  function changeDateFilter(date: string) {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (initialFormOpen) params.set('create', '1');
    const query = params.toString();
    router.replace(query ? `/tasks?${query}` : '/tasks', { scroll: false });
  }

  if (readState === 'unverified') return <main className="p-8" role="alert">Сессия изменилась или не подтверждена. Войдите снова.</main>;

  return (
    <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:p-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#2963af]">
              Мои задачи
            </h1>

            <p className="mt-2 text-sm text-[#6c757d] sm:text-base">
              Планируйте учебную нагрузку и следите за сроками.
            </p>
          </div>

          <button
            type="button"
            {...noControlStateRestore}
            disabled={isBusy}
            aria-expanded={isFormOpen}
            aria-controls="task-form"
            onClick={toggleForm}
            className="self-start rounded-lg bg-[#2963af] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#204f8a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFormOpen ? 'Скрыть форму' : '+ Добавить задачу'}
          </button>
        </header>

        {isFormOpen && readState === 'server' && !initialLoadError && (
          <section
            id="task-form"
            aria-labelledby="task-form-heading"
            className="mb-8 rounded-xl border border-[#e9ecef] bg-white p-6 shadow-[0_4px_6px_rgba(0,0,0,0.02),0_1px_3px_rgba(0,0,0,0.08)]"
          >
            <h2
              id="task-form-heading"
              className="text-xl font-semibold text-[#2963af]"
            >
              {editingTaskId
                ? 'Редактирование задачи'
                : 'Новая задача'}
            </h2>

            <p className="mt-1 text-sm text-[#6c757d]">
              {editingTaskId
                ? 'Измените необходимые поля и сохраните задачу.'
                : 'Заполните информацию об учебной задаче.'}
            </p>

            <form
              onSubmit={handleSubmit}
              className="mt-6 grid gap-5 sm:grid-cols-2"
            >
              <label className="text-sm font-medium text-[#2963af] sm:col-span-2">
                Название задачи

                <input
                  required
                  type="text"
                  value={formValues.title}
                  onChange={(event) => {
                    const title = event.target.value;
                    setFormValues((values) => ({
                      ...values,
                      title,
                      estimatedTime: estimatedTimeAfterTitleChange(title, values.estimatedTime, isTimeManuallyEdited, editingTaskId !== null),
                    }));
                  }}
                  placeholder="Например, подготовить презентацию"
                  className={fieldStyles}
                />
              </label>

              <label className="text-sm font-medium text-[#2963af]">
                Предмет

                <input
                  required
                  type="text"
                  value={formValues.subject}
                  onChange={(event) =>
                    setFormValues((values) => ({
                      ...values,
                      subject: event.target.value,
                    }))
                  }
                  placeholder="Название предмета"
                  className={fieldStyles}
                />
              </label>

              <label className="text-sm font-medium text-[#2963af]">
                Дедлайн

                <input
                  required
                  type="date"
                  value={formValues.deadline}
                  onChange={(event) =>
                    setFormValues((values) => ({
                      ...values,
                      deadline: event.target.value,
                    }))
                  }
                  className={fieldStyles}
                />
              </label>

              <label className="text-sm font-medium text-[#2963af]">
                Оценка времени в минутах

                <input
                  required
                  type="number"
                  aria-describedby="task-time-hint"
                  min="1"
                  step="1"
                  value={formValues.estimatedTime}
                  onChange={(event) => {
                    setIsTimeManuallyEdited(true);
                    setFormValues((values) => ({
                      ...values,
                      estimatedTime: event.target.value,
                    }));
                  }}
                  placeholder="60"
                  className={fieldStyles}
                />
                <span id="task-time-hint" className="mt-2 block text-xs font-normal text-[#6c757d]">
                  {editingTaskId !== null
                    ? 'Сохранённое время. Можно изменить вручную.'
                    : isTimeManuallyEdited
                      ? 'Указано вручную — название не изменит это время.'
                      : 'Автоматическая оценка FlowState. Можно изменить вручную.'}
                </span>
              </label>

              <label className="text-sm font-medium text-[#2963af]">
                Приоритет

                <select
                  value={formValues.priority}
                  onChange={(event) =>
                    setFormValues((values) => ({
                      ...values,
                      priority:
                        event.target.value as Priority,
                    }))
                  }
                  className={fieldStyles}
                >
                  <option value="Низкий">Низкий</option>
                  <option value="Средний">Средний</option>
                  <option value="Высокий">Высокий</option>
                </select>
              </label>

              {submitError && (
                <p className="text-sm font-medium text-red-600 sm:col-span-2">
                  {submitError}
                </p>
              )}

              <div className="flex flex-wrap gap-3 sm:col-span-2">
                <button
                  type="submit"
                  {...noControlStateRestore}
                  disabled={isBusy}
                  className="rounded-lg bg-[#039be5] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0288d1] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting
                    ? 'Сохранение...'
                    : editingTaskId
                      ? 'Сохранить изменения'
                      : 'Добавить'}
                </button>

                <button
                  type="button"
                  onClick={closeForm}
                  {...noControlStateRestore}
                  disabled={isBusy}
                  className="rounded-lg border border-[#dfe3e6] bg-white px-5 py-2.5 text-sm font-semibold text-[#495057] transition-colors hover:bg-[#f8f9fa] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Отмена
                </button>
              </div>
            </form>
          </section>
        )}

        <div role="group" aria-label="Представление задач" className="mb-4 flex gap-2">
          {([
            { value: 'list', label: 'Список' },
            { value: 'calendar', label: 'Календарь' },
          ] as const).map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={view === item.value}
              onClick={() => onViewChange(item.value)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7] ${
                view === item.value
                  ? 'border-[#039be5] bg-[#039be5] text-white'
                  : 'border-[#dfe3e6] bg-white text-[#495057] hover:bg-[#e9ecef]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <section
          aria-label="Фильтры и сортировка задач"
          className="mb-6 grid gap-4 rounded-xl border border-[#e9ecef] bg-white p-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <label className="text-sm font-medium text-[#495057]">
            Статус
            <select
              value={filters.status}
              onChange={(event) => onFiltersChange({
                ...filters,
                status: event.target.value as TaskFilters['status'],
              })}
              className={fieldStyles}
            >
              <option value="all">Все</option>
              <option value="pending">Новые</option>
              <option value="in_progress">В процессе</option>
              <option value="completed">Выполненные</option>
            </select>
          </label>

          <label className="text-sm font-medium text-[#495057]">
            Приоритет
            <select
              value={filters.priority}
              onChange={(event) => onFiltersChange({
                ...filters,
                priority: event.target.value as TaskFilters['priority'],
              })}
              className={fieldStyles}
            >
              <option value="all">Все</option>
              <option value="Низкий">Низкий</option>
              <option value="Средний">Средний</option>
              <option value="Высокий">Высокий</option>
            </select>
          </label>

          <label className="text-sm font-medium text-[#495057]">
            Сортировка
            <select
              value={filters.sort}
              onChange={(event) => onFiltersChange({
                ...filters,
                sort: event.target.value as TaskFilters['sort'],
              })}
              className={fieldStyles}
            >
              <option value="deadline">Ближайший дедлайн</option>
              <option value="priority">По приоритету</option>
              <option value="newest">Сначала новые</option>
            </select>
          </label>
          <label className="text-sm font-medium text-[#495057]">
            Дата дедлайна
            <input type="date" value={dateFilter} onChange={(event) => changeDateFilter(event.target.value)} className={fieldStyles} />
            {dateFilter && (
              <button type="button" onClick={() => changeDateFilter('')} className="mt-2 rounded text-xs font-medium text-[#039be5] hover:underline focus-visible:outline-2 focus-visible:outline-[#4fc3f7]">
                Все даты
              </button>
            )}
          </label>
        </section>

        <section aria-labelledby="tasks-list-heading">
          <h2 id="tasks-list-heading" className="sr-only">
            Учебные задачи
          </h2>


          {statusError && (
            <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {statusError}
            </p>
          )}

          {readState === 'server' && !initialLoadError && <p role="status" className="mb-4 text-sm text-[#6c757d]">Задачи загружены из Supabase.</p>}
          {loadError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {loadError}
            </p>
          )}

          {!loadError && view === 'list' && tasks.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#ced4da] bg-white p-8 text-center">
              <h3 className="text-lg font-semibold text-[#2963af]">
                Задач пока нет
              </h3>

              <p className="mt-2 text-sm text-[#6c757d]">
                Добавьте первую учебную задачу.
              </p>
            </div>
          )}

          {!loadError && tasks.length > 0 && visibleTasks.length === 0 && (
            <div role="status" className="rounded-xl border border-dashed border-[#ced4da] bg-white p-8 text-center">
              <h3 className="text-lg font-semibold text-[#2963af]">
                Нет задач по выбранным фильтрам
              </h3>
              <p className="mt-2 text-sm text-[#6c757d]">
                Измените статус, приоритет или дату, чтобы увидеть другие задачи.
              </p>
              <button
                type="button"
                onClick={() => {
                  onFiltersChange({ ...filters, status: 'all', priority: 'all' });
                  if (dateFilter) changeDateFilter('');
                }}
                className="mt-4 rounded-lg border border-[#dfe3e6] bg-white px-4 py-2 text-sm font-semibold text-[#495057] transition-colors hover:bg-[#f8f9fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7]"
              >
                Сбросить фильтры
              </button>
            </div>
          )}

          {!loadError && view === 'calendar' && (
            <TasksCalendar key={dateFilter || 'all'} initialDate={dateFilter} initialToday={initialToday} tasks={visibleTasks} allTasks={tasks} availability={availability} onEdit={handleEdit} isBusy={isBusy} onOpenTask={(id) => {
              onFiltersChange(defaultFilters);
              setTargetTask({ id });
              onViewChange('list');
              if (dateFilter) router.replace('/tasks', { scroll: false });
            }} />
          )}

          {!loadError && view === 'list' && visibleTasks.length > 0 && (
            <div className="space-y-8">
              {[
                { id: 'active-tasks', title: 'Активные задачи', items: activeTasks, empty: 'Активных задач нет.' },
                { id: 'completed-tasks', title: 'Выполненные задачи', items: completedTasks, empty: 'Выполненных задач пока нет.' },
              ].filter((group) => filters.status === 'all' || (
                filters.status === 'completed'
                  ? group.id === 'completed-tasks'
                  : group.id === 'active-tasks'
              )).map((group) => (
                <section key={group.id} aria-labelledby={`${group.id}-heading`}>
                  <h3 id={`${group.id}-heading`} className="mb-5 text-xl font-semibold text-[#2963af]">
                    {group.title} ({group.items.length})
                  </h3>
                  {group.items.length === 0 && (
                    <p className="rounded-xl border border-dashed border-[#ced4da] bg-white p-6 text-sm text-[#6c757d]">
                      {group.empty}
                    </p>
                  )}
                  <div className="grid gap-5 md:grid-cols-2">
                    {group.items.map((task) => (
                      <article
                        key={task.id}
                        id={`task-${task.id}`}
                        className="rounded-xl border border-[#e9ecef] bg-white p-6 shadow-[0_4px_6px_rgba(0,0,0,0.02),0_1px_3px_rgba(0,0,0,0.08)]"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-[#039be5]">
                              {task.subject}
                            </p>

                            <h4 className="mt-1 break-words text-lg font-semibold text-[#2963af]">
                              {task.title}
                            </h4>
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
                              priorityStyles[task.priority]
                            }`}
                          >
                            {task.priority}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${taskStatusStyles[task.status]}`}>
                            {taskStatusLabels[task.status]}
                          </span>
                          {updatingTaskId === task.id && (
                            <span role="status" className="text-sm text-[#6c757d]">Сохранение статуса...</span>
                          )}
                        </div>

                        <label className="mt-4 block text-sm font-medium text-[#adb5bd]">
                          Статус задачи «{task.title}»
                          <select
                            value={task.status}
                            {...noControlStateRestore}
                            disabled={!canEditTask(task.id)}
                            onChange={(event) => {
                              const status = event.target.value;
                              if (isTaskStatus(status)) {
                                handleStatusChange(task, status);
                              }
                            }}
                            className={`${fieldStyles} disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            {taskStatuses.map((status) => (
                              <option key={status} value={status}>{taskStatusLabels[status]}</option>
                            ))}
                          </select>
                        </label>

                        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[#e9ecef] pt-4">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-[#adb5bd]">
                              Дедлайн
                            </p>

                            <p className="mt-1 text-sm font-medium text-[#495057]">
                              {formatDeadline(task.deadline)}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-[#adb5bd]">
                              Оценка времени
                            </p>

                            <p className="mt-1 text-sm font-medium text-[#495057]">
                              {task.estimatedMinutes} минут
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3 border-t border-[#e9ecef] pt-4">
                          {task.status !== 'completed' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(task, 'completed')}
                              {...noControlStateRestore}
                              disabled={!canEditTask(task.id)}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Отметить выполненной
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEdit(task)}
                            {...noControlStateRestore}
                            disabled={!canEditTask(task.id)}
                            className="rounded-lg border border-[#dfe3e6] bg-white px-4 py-2 text-sm font-semibold text-[#495057] transition-colors hover:bg-[#f8f9fa] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Редактировать
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(task.id)}
                            {...noControlStateRestore}
                            disabled={!canEditTask(task.id)}
                            className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingTaskId === task.id
                              ? 'Удаление...'
                              : 'Удалить'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
