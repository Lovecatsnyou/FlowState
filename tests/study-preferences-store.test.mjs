import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPreferences, savePreferences } from '../.next/workload-tests/study-preferences-store.js';
import { defaultPreferences, weekdays } from '../.next/workload-tests/study-preferences.js';

function mockClient(response, saved = { error: null }) {
  const calls = [];
  return { calls, client: { from(table) {
    calls.push(['from', table]);
    return {
      select(columns) { calls.push(['select', columns]); return { eq(column, value) {
        calls.push(['eq', column, value]); return { async maybeSingle() { return response; } };
      } }; },
      async upsert(row, options) { calls.push(['upsert', row, options]); return saved; },
    };
  } } };
}
const row = Object.fromEntries(weekdays.map((day, index) => [`${day}_minutes`, index * 30]));

test('Отсутствующая запись возвращает стандартные настройки', async () => {
  const { client, calls } = mockClient({ data: null, error: null });
  assert.deepEqual(await loadPreferences(client, 'user-a'), { preferences: defaultPreferences, error: null });
  assert.deepEqual(calls, [['from', 'study_preferences'], ['select', weekdays.map(day => `${day}_minutes`).join(',')], ['eq', 'user_id', 'user-a']]);
});
test('Сохранённые значения, включая ноль, загружаются из столбцов базы', async () => {
  const { client } = mockClient({ data: row, error: null });
  const result = await loadPreferences(client, 'user-a');
  assert.deepEqual(result.preferences, Object.fromEntries(weekdays.map((day, index) => [day, index * 30])));
  assert.equal(result.error, null);
});
test('Сохранение использует столбцы базы и только переданный user_id', async () => {
  const { client, calls } = mockClient({ data: null, error: null });
  const values = Object.fromEntries(weekdays.map((day, index) => [day, index * 30]));
  assert.deepEqual(await savePreferences(client, 'user-b', values), { error: null });
  assert.deepEqual(calls[1], ['upsert', { ...row, user_id: 'user-b' }, { onConflict: 'user_id' }]);
});
test('Ошибка базы не превращается в настройки по умолчанию и журналируется безопасно', async () => {
  const error = { code: '42703', message: 'column missing', details: 'detail', hint: 'hint', secret: 'do not log' };
  const { client } = mockClient({ data: null, error }, { error });
  const original = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    assert.deepEqual(await loadPreferences(client, 'user-a'), { preferences: null, error });
    assert.deepEqual(await savePreferences(client, 'user-a', defaultPreferences), { error });
    assert.equal(logs.length, 2);
    assert.deepEqual(logs[0][1], { code: error.code, message: error.message, details: error.details, hint: error.hint });
    assert(!JSON.stringify(logs).includes(error.secret));
  } finally { console.error = original; }
});
test('Исключение сети также возвращается как ошибка', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const result = await loadPreferences({ from() { throw new Error('network failure'); } }, 'user-a');
    assert.equal(result.preferences, null);
    assert.ok(result.error);
  } finally { console.error = original; }
});
