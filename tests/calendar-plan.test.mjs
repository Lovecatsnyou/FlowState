import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarPlan } from '../.next/workload-tests/calendar-plan.js';
import { defaultPreferences } from '../.next/workload-tests/study-preferences.js';
import { getCalendarDays, monthForDate, shiftMonth } from '../.next/workload-tests/task-calendar.js';

const task = (id, deadline, minutes, status = 'pending') => ({ id, title: id, subject: null, deadline, estimated_minutes: minutes, priority: 'Средний', status });
const prefs = { ...defaultPreferences, wednesday: 120, thursday: 180, friday: 60 };
test('Занятия распределяются отдельно от дедлайна и показывают лимит и остаток', () => {
 const tasks = [task('экзамен', '2026-01-02', 360)];
 const plan = createCalendarPlan(tasks, '2025-12-31', prefs);
 assert.deepEqual(plan.day('2025-12-31'), { tasks: [{ taskId: 'экзамен', title: 'экзамен', minutes: 120 }], totalMinutes: 120, availableMinutes: 120, freeMinutes: 0 });
 assert.equal(plan.day('2026-01-01').totalMinutes, 180);
 assert.equal(plan.day('2026-01-02').totalMinutes, 60);
 assert.equal(tasks[0].deadline, '2026-01-02');
 assert.equal(plan.day('2025-12-30'), null);
 assert.equal(plan.day('2026-01-03'), null);
 assert(getCalendarDays(monthForDate('2025-12-31')).some(d => d.key === '2026-01-01'));
 assert.deepEqual(shiftMonth(monthForDate('2025-12-31'), 1), { year: 2026, month: 0 });
});
test('Занятия нескольких задач суммируются, не превышая лимит', () => {
 const plan = createCalendarPlan([task('a', '2026-01-02', 90), task('b', '2026-01-02', 50)], '2025-12-31', prefs);
 assert.deepEqual(plan.day('2025-12-31').tasks.map(t => t.minutes), [90, 30]);
 assert.equal(plan.day('2025-12-31').totalMinutes, 120);
 assert.equal(plan.day('2026-01-01').freeMinutes, 160);
});
test('Нулевая доступность, выполненные задачи и пересчёт изменений', () => {
 const off = { ...prefs, wednesday: 0 };
 const tasks = [task('a', '2026-01-02', 60), task('done', '2026-01-02', 500, 'completed')];
 const plan = createCalendarPlan(tasks, '2025-12-31', off);
 assert.deepEqual(plan.day('2025-12-31'), { tasks: [], totalMinutes: 0, availableMinutes: 0, freeMinutes: 0 });
 assert.deepEqual(plan.day('2026-01-01').tasks.map(t => t.taskId), ['a']);
 assert.equal(createCalendarPlan([task('a', '2026-01-02', 90)], '2025-12-31', prefs).day('2025-12-31').totalMinutes, 90);
 assert.equal(createCalendarPlan([task('a', '2026-01-02', 90, 'completed')], '2025-12-31', prefs).day('2025-12-31'), null);
 assert.equal(createCalendarPlan([], '2025-12-31', prefs).day('2025-12-31'), null);
});
