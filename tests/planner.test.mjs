import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStudyPlan } from '../.next/workload-tests/planner.js';
import { defaultPreferences, normalizePreferences } from '../.next/workload-tests/study-preferences.js';
import { analyzeWorkload, getWorkloadLevel } from '../.next/workload-tests/workload.js';
const task = (id, deadline, minutes, priority = 'Средний', status = 'pending') => ({ id, title: id, subject: null, deadline, estimated_minutes: minutes, priority, status });
const today = '2026-10-05';
test('Дедлайн и приоритет определяют порядок; задачи делятся по дням', () => {
 const result = buildStudyPlan([task('later', '2026-10-07', 100), task('low', '2026-10-06', 100, 'Низкий'), task('high', '2026-10-06', 200, 'Высокий')], today);
 assert.deepEqual(result.days.map(d => [d.date, d.tasks.map(t => [t.taskId,t.minutes])]), [[today, [['high',180]]], ['2026-10-06', [['high',20],['low',100],['later',60]]], ['2026-10-07', [['later',40]]]]);
 assert.deepEqual(result.issues, []);
});
test('Ошибки дат, просрочка, остаток и стандартная оценка', () => {
 const result = buildStudyPlan([task('bad', '2026-02-30', null), task('old', '2026-10-04', 20), task('big', today, 200), task('done', today, 60, 'Высокий', 'completed')], today);
 assert.deepEqual(Object.fromEntries(result.issues.map(i => [i.taskId, [i.reason, i.unallocatedMinutes]])), {bad:['invalid_deadline',60],old:['overdue',20],big:['insufficient_time',20]});
});
test('Нулевая доступность и процентные пороги нагрузки', () => {
 const availability = {...defaultPreferences, monday:0};
 assert.equal(buildStudyPlan([task('a', today, 90)], today, availability).issues[0].unallocatedMinutes, 90);
 assert.equal(analyzeWorkload([task('a', today, 1)], today, availability)[0].level, 'high');
 assert.equal(getWorkloadLevel(0, 0), 'low');
 assert.equal(getWorkloadLevel(90, 180), 'low');
 assert.equal(getWorkloadLevel(180, 180), 'medium');
 assert.equal(getWorkloadLevel(181, 180), 'high');
});
test('Настройки по умолчанию и проверка значений', () => {
 assert.deepEqual(normalizePreferences(null), defaultPreferences);
 assert.equal(normalizePreferences({...defaultPreferences, monday:0, tuesday:721}).monday, 0);
 assert.equal(normalizePreferences({...defaultPreferences, monday:0, tuesday:721}).tuesday, 180);
});

test('Хранилище ограничивает чтение пользователем и сохраняет его идентификатор', async () => {
 const { loadPreferences, savePreferences } = await import('../.next/workload-tests/study-preferences-store.js');
 const calls = [];
 const client = { from(table) { calls.push(['from', table]); return {
   select(columns) { calls.push(['select', columns]); return { eq(column, value) { calls.push(['eq', column, value]); return { async maybeSingle() { return { data: null, error: null }; } }; } }; },
   async upsert(row, options) { calls.push(['upsert', row, options]); return { error: null }; },
 }; } };
 const loaded = await loadPreferences(client, 'user-a');
 assert.deepEqual(loaded.preferences, defaultPreferences);
 await savePreferences(client, 'user-b', defaultPreferences);
 assert(calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-a'));
 assert(calls.some(call => call[0] === 'upsert' && call[1].user_id === 'user-b' && call[2].onConflict === 'user_id'));
});
