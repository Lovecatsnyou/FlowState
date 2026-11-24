import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';

const load = createRequire(import.meta.url);
const calls = [];
const row = { id: 'server-task', title: 'Серверная', subject: 'Физика', deadline: '2026-03-01', estimated_minutes: 60, priority: 'Средний', status: 'pending' };
let onAuth;
const router = { refresh() {}, replace() {} };
const client = {
  auth: { onAuthStateChange: callback => { onAuth = callback; return { data: { subscription: { unsubscribe() {} } } }; } },
  from(table) {
    assert.equal(table, 'tasks');
    return {
      insert(payload) { calls.push({ type: 'insert', payload }); return { select: () => ({ single: async () => ({ data: { ...row, ...payload, id: 'created-task' }, error: null }) }) }; },
      update(payload) { calls.push({ type: 'update', payload }); return { eq() { return this; }, select() { return this; }, async single() { return { data: { ...row, ...payload }, error: null }; } }; },
      delete() { calls.push({ type: 'delete' }); return { eq() { return this; }, select() { return this; }, async maybeSingle() { return { data: { id: row.id }, error: null }; } }; },
    };
  },
};
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'next/navigation') return { useRouter: () => router };
  if (request === '../../lib/supabase/client') return { createClient: () => client };
  if (request.includes('/local/')) throw new Error('Online UI must not import local storage');
  if (request === './actions') return { updateTaskStatus: async (_id, status) => { calls.push({ type: 'status', status }); return { success: true, task: { ...row, status } }; } };
  return originalLoad.call(this, request, ...args);
};
const TasksContent = load('../.next/hydration-tests/app/tasks/tasks-content.js').default;
Module._load = originalLoad;
const base = { userId: 'user-a', initialTasks: [row], initialToday: '2026-03-01', initialLoadError: '', initialFormOpen: true };

test('SSR, гидратация и действия Tasks используют только Supabase; ошибка блокирует редактирование', async () => {
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  let dom, root;
  try {
    for (const failed of [false, true]) {
      const props = { ...base, initialLoadError: failed ? 'Не удалось загрузить задачи из Supabase.' : '' };
      const html = renderToString(React.createElement(TasksContent, props));
      dom = new JSDOM(`<div id="root">${html}</div>`, { url: 'https://example.test/tasks' });
      for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator })) Object.defineProperty(globalThis, name, { configurable: true, value });
      globalThis.IS_REACT_ACT_ENVIRONMENT = true;
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() { throw new Error('IndexedDB accessed'); } });
      dom.window.scrollTo = () => {};
      dom.window.confirm = () => true;
      const container = dom.window.document.getElementById('root');
      const initialDisabled = container.querySelector('button[aria-controls="task-form"]').disabled;
      assert.equal(initialDisabled, failed);
      const { hydrateRoot } = load('react-dom/client');
      const hydrationErrors = [];
      await React.act(async () => { root = hydrateRoot(container, React.createElement(TasksContent, props), { onRecoverableError: error => hydrationErrors.push(error) }); });
      assert.equal(container.querySelector('button[aria-controls="task-form"]').disabled, failed);
      assert.deepEqual(hydrationErrors, []);
      assert(!/диагностик|ожидает синхронизации|локальные данные/i.test(container.textContent));
      if (failed) {
        assert(container.querySelector('[role="alert"]').textContent.includes('Не удалось загрузить'));
        assert.equal(container.querySelector('#task-form'), null);
        assert.equal(container.querySelector('#task-server-task'), null);
      } else {
        assert(container.textContent.includes('Задачи загружены из Supabase'));
        assert(container.querySelector('#task-server-task'));
        const button = [...container.querySelectorAll('button')].find(element => element.textContent.trim() === 'Отметить выполненной');
        await React.act(async () => { button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
        assert(calls.some(call => call.type === 'status' && call.status === 'completed'));
        await React.act(async () => { onAuth('SIGNED_OUT', null); });
        assert(!container.querySelector('#task-server-task'));
        assert(container.textContent.includes('Сессия изменилась'));
      }
      await React.act(async () => root.unmount()); root = undefined;
      dom.window.close(); dom = undefined;
    }
  } finally {
    if (root) await React.act(async () => root.unmount());
    if (dom) dom.window.close();
    for (const name of ['window', 'document', 'navigator', 'indexedDB', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (saved[name]) Object.defineProperty(globalThis, name, saved[name]); else delete globalThis[name];
    }
  }
});

test('создание, редактирование и удаление отправляются в Supabase', async () => {
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/tasks' });
  let root;
  try {
    for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator })) Object.defineProperty(globalThis, name, { configurable: true, value });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() { throw new Error('IndexedDB accessed'); } });
    dom.window.scrollTo = () => {};
    dom.window.confirm = () => true;
    const container = dom.window.document.getElementById('root');
    const { createRoot } = load('react-dom/client');
    await React.act(async () => { root = createRoot(container); root.render(React.createElement(TasksContent, { ...base, initialFormOpen: false })); });
    const click = async text => {
      const button = [...container.querySelectorAll('button')].find(element => element.textContent.trim() === text);
      assert(button, text);
      await React.act(async () => { button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    };
    const fill = async (selector, value) => {
      const input = container.querySelector(selector); assert(input, selector);
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    };
    const submit = async () => { await React.act(async () => { container.querySelector('#task-form form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); }); };
    await click('Редактировать');
    await submit();
    assert(calls.some(call => call.type === 'update'));
    await click('+ Добавить задачу');
    await fill('input[placeholder="Например, подготовить презентацию"]', 'Новая задача');
    await fill('input[placeholder="Название предмета"]', 'История');
    await fill('input[type="date"]', '2026-03-02');
    await submit();
    assert(calls.some(call => call.type === 'insert' && call.payload.user_id === 'user-a'));
    const deleteButton = [...container.querySelectorAll('#task-server-task button')].find(element => element.textContent.trim() === 'Удалить');
    assert(deleteButton);
    await React.act(async () => { deleteButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    assert(calls.some(call => call.type === 'delete'));
    assert(!container.querySelector('#task-server-task'));
  } finally {
    if (root) await React.act(async () => root.unmount());
    dom.window.close();
    for (const name of ['window', 'document', 'navigator', 'indexedDB', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (saved[name]) Object.defineProperty(globalThis, name, saved[name]); else delete globalThis[name];
    }
  }
});
