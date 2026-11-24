// Исполняемая модель для тестов проектного контракта. Не импортируется приложением.
// Она НЕ моделирует PostgreSQL, его блокировки, RLS, транзакции или IndexedDB.
const clone = value => structuredClone(value);
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
};
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

export class ReferenceServer {
  #journal = new Map();
  #tasks = new Map();
  #mutex = Promise.resolve();

  async submit(user, request) {
    // Очередь моделирует сериализованный порядок. Это не доказательство SQL-гарантий.
    const previous = this.#mutex;
    let release;
    this.#mutex = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      if (!user) return { outcome: 'unauthenticated' };
      const old = this.#journal.get(request.operation_id);
      if (old) {
        if (old.user !== user || !same(old.request, request)) return { outcome: 'operation_id_unavailable' };
        return clone(old.result);
      }
      const task = this.#tasks.get(request.task_id);
      let result;
      if (request.kind === 'create') {
        if (task) result = { outcome: 'not_found_or_forbidden' };
        else {
          const next = { owner: user, version: 1, deleted: false, payload: clone(request.payload) };
          this.#tasks.set(request.task_id, next);
          result = { outcome: 'applied', version: next.version, task: clone(next) };
        }
      } else if (!task || task.owner !== user) result = { outcome: 'not_found_or_forbidden' };
      else if (task.deleted || request.expected_version !== String(task.version)) {
        result = { outcome: 'conflict', reason: task.deleted ? 'deleted' : 'version', version: task.version, task: clone(task) };
      } else {
        const next = { ...task, version: task.version + 1 };
        if (request.kind === 'delete') next.deleted = true;
        else next.payload = { ...next.payload, ...clone(request.payload) };
        this.#tasks.set(request.task_id, next);
        result = { outcome: 'applied', version: next.version, task: clone(next) };
      }
      this.#journal.set(request.operation_id, { user, request: clone(request), result: clone(result) });
      return clone(result);
    } finally { release(); }
  }
}

// Модель атомарного подтверждения конкретной операции, не IDB-реализация.
export function acknowledge(queue, user, generation, current, operationId) {
  if (user !== current.user || generation !== current.generation) return queue;
  return queue.filter(item => !(item.user === user && item.operation_id === operationId));
}
