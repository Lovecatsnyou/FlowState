import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeWorkload, getWorkloadLevel } from '../.next/workload-tests/workload.js';

const today = '2026-10-06';
const task = (minutes, deadline = today, status = 'pending') => ({ deadline, estimated_minutes: minutes, status });

for (const [minutes, level] of [[45, 'low'], [90, 'low'], [91, 'medium'], [180, 'medium'], [181, 'high']]) {
  test(`${minutes} минут → ${level}`, () => {
    const day = analyzeWorkload([task(minutes)], today)[0];
    assert.deepEqual(day, { date: today, taskCount: 1, totalMinutes: minutes, level });
  });
}

test('Две задачи, 120 минут → средняя нагрузка', () => {
  assert.deepEqual(analyzeWorkload([task(45), task(75)], today)[0], {
    date: today, taskCount: 2, totalMinutes: 120, level: 'medium',
  });
});

test('Completed не учитывается, pending и in_progress учитываются', () => {
  const day = analyzeWorkload([task(180, today, 'completed'), task(45), task(60, today, 'in_progress')], today)[0];
  assert.equal(day.taskCount, 2);
  assert.equal(day.totalMinutes, 105);
});

test('Без дедлайна и с некорректным дедлайном задача пропускается', () => {
  const days = analyzeWorkload([task(60, null), task(60, ''), task(60, '2026-02-30'), task(60, 'bad')], today);
  assert(days.every((day) => day.taskCount === 0 && day.totalMinutes === 0));
});

test('Несколько задач одного дня суммируются', () => {
  const day = analyzeWorkload([task(45), task(90), task(120)], today)[0];
  assert.equal(day.taskCount, 3);
  assert.equal(day.totalMinutes, 255);
  assert.equal(day.level, 'high');
});

test('Разные дни группируются отдельно', () => {
  const days = analyzeWorkload([task(45), task(90, '2026-10-07'), task(180, '2026-10-07')], today);
  assert.equal(days[0].totalMinutes, 45);
  assert.equal(days[1].totalMinutes, 270);
  assert.equal(days[1].taskCount, 2);
  assert.equal(days[1].level, 'high');
});

test('Null-время: 0 минут, задача остаётся в количестве', () => {
  const day = analyzeWorkload([task(null)], today)[0];
  assert.equal(day.taskCount, 1);
  assert.equal(day.totalMinutes, 0);
  assert.equal(day.level, 'low');
});

test('Отрицательные, бесконечные, строковые и NaN-значения времени безопасны', () => {
  const day = analyzeWorkload([null, -5, NaN, Infinity, '90', undefined, 0].map((value) => task(value)), today)[0];
  assert.equal(day.taskCount, 7);
  assert.equal(day.totalMinutes, 0);
});

test('Старые задачи без статуса остаются активными', () => {
  const days = analyzeWorkload([{ deadline: today, estimated_minutes: 45 }], today);
  assert.equal(days[0].taskCount, 1);
});

test('Ровно 7 дней, включая сегодня; прошлое и восьмой день исключены', () => {
  const days = analyzeWorkload([task(60, '2026-10-05'), task(60, '2026-10-12'), task(60, '2026-10-13')], today);
  assert.equal(days.length, 7);
  assert.equal(days[0].date, today);
  assert.equal(days[6].date, '2026-10-12');
  assert.equal(days.reduce((sum, day) => sum + day.taskCount, 0), 1);
});

test('Пустые дни имеют нулевую низкую нагрузку', () => {
  assert(analyzeWorkload([], today).every((day) => day.taskCount === 0 && day.totalMinutes === 0 && day.level === 'low'));
  assert.equal(getWorkloadLevel(0), 'low');
});

test('Переход месяца, високосного февраля и года без сдвига дат', () => {
  for (const [start, end] of [['2024-02-27', '2024-03-04'], ['2026-12-29', '2027-01-04'], ['2026-03-07', '2026-03-13']]) {
    const days = analyzeWorkload([task(60, start)], start);
    assert.equal(days[0].date, start);
    assert.equal(days[6].date, end);
    assert.equal(days[0].taskCount, 1);
  }
});

test('Данные пересчитываются после изменения времени, даты, статуса и удаления', () => {
  assert.equal(analyzeWorkload([task(45)], today)[0].totalMinutes, 45);
  assert.equal(analyzeWorkload([task(241)], today)[0].level, 'high');
  const moved = analyzeWorkload([task(241, '2026-10-07')], today);
  assert.equal(moved[0].taskCount, 0);
  assert.equal(moved[1].taskCount, 1);
  assert.equal(analyzeWorkload([task(241, today, 'completed')], today)[0].taskCount, 0);
  assert.equal(analyzeWorkload([task(241, today, 'in_progress')], today)[0].taskCount, 1);
  assert.equal(analyzeWorkload([], today)[0].taskCount, 0);
});

test('Исходные задачи не изменяются', () => {
  const tasks = Object.freeze([Object.freeze(task(45))]);
  analyzeWorkload(tasks, today);
  assert.equal(tasks[0].estimated_minutes, 45);
});
