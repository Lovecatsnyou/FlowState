export const defaultEstimatedMinutes = 60;

// Стартовые эвристики для одной задачи, а не статистические измерения.
export const estimatedMinutesByCategory = {
  reading: 45,
  notes: 60,
  homework: 60,
  laboratory: 120,
  practical: 90,
  control: 90,
  independent: 60,
  presentation: 90,
  essay: 120,
  report: 120,
  abstract: 120,
  test: 60,
  credit: 120,
  exam: 120,
  coursework: 180,
} as const;

type EstimationRule = { minutes: number; pattern: RegExp };

// После нормализации слова разделяются пробелами; \b не распознаёт русские буквы.
// Явные окончания ограничивают совпадения полными словами.
const rules: EstimationRule[] = [
  { minutes: estimatedMinutesByCategory.reading, pattern: /(?:^| )(?:прочита(?:ть|й|йте|ю|ешь|ет|ем|ете|ют|л|ла|ли)|чита(?:ть|й|йте|ю|ешь|ет|ем|ете|ют|л|ла|ли|я)|чтени(?:е|я|ю|ем|и|й|ям|ями|ях)|глав(?:а|ы|у|е|ой|ою|ам|ами|ах)?)(?: |$)/ },
  { minutes: estimatedMinutesByCategory.notes, pattern: /(?:^| )(?:конспект(?:а|у|ом|е|ы|ов|ам|ами|ах|ировать|ируй|ирую|ировать(?:ся)?)?|законспект(?:ировать|ируй|ирую|ировали|ируйте))(?: |$)/ },
  { minutes: estimatedMinutesByCategory.homework, pattern: /(?:^| )(?:дз|упражнени(?:е|я|ю|ем|и|й|ям|ями|ях)|домашн(?:яя|юю|ей|ее|его|ему|им|ем|ие|их|ими) (?:работ(?:а|ы|у|е|ой|ою|ам|ами|ах)?|задани(?:е|я|ю|ем|и|й|ям|ями|ях)))(?: |$)/ },
  { minutes: estimatedMinutesByCategory.laboratory, pattern: /(?:^| )(?:лабораторн(?:ая|ую|ой|ою|ые|ых|ым|ыми|ое|ого|ому|ом|ые|ыми)|лаб(?:а|ы|у|е|ой|ою|ам|ами|ах)?|лр)(?: |$)/ },
  { minutes: estimatedMinutesByCategory.practical, pattern: /(?:^| )(?:практическ(?:ая|ую|ой|ою|ие|их|им|ими|ое|ого|ому|ом) работ(?:а|ы|у|е|ой|ою|ам|ами|ах)?|практическ(?:ую|ой|ая)|практикум(?:а|у|ом|е|ы|ов|ам|ами|ах)?|практ)(?: |$)/ },
  { minutes: estimatedMinutesByCategory.control, pattern: /(?:^| )(?:контрольн(?:ая|ую|ой|ою|ые|ых|ым|ыми)|контр|кр)(?: |$)/ },
  { minutes: estimatedMinutesByCategory.independent, pattern: /(?:^| )самостоятельн(?:ая|ую|ой|ою|ые|ых|ым|ыми)(?: |$)/ },
  { minutes: estimatedMinutesByCategory.presentation, pattern: /(?:^| )презентаци(?:я|ю|и|ей|ею|ям|ями|ях)(?: |$)/ },
  { minutes: estimatedMinutesByCategory.abstract, pattern: /(?:^| )реферат(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?: |$)/ },
  { minutes: estimatedMinutesByCategory.essay, pattern: /(?:^| )эссе(?: |$)/ },
  { minutes: estimatedMinutesByCategory.report, pattern: /(?:^| )доклад(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?: |$)/ },
  { minutes: estimatedMinutesByCategory.test, pattern: /(?:^| )тест(?:ы|а|у|ом|е|ов|ам|ами|ах)?(?: |$)/ },
  { minutes: estimatedMinutesByCategory.credit, pattern: /(?:^| )зачет(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?: |$)/ },
  { minutes: estimatedMinutesByCategory.exam, pattern: /(?:^| )экзамен(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?: |$)/ },
  { minutes: estimatedMinutesByCategory.coursework, pattern: /(?:^| )курсов(?:ая|ую|ой|ою|ые|ых|ым|ыми|ое|ого|ому|ом)(?: |$)/ },
];

/** Оценка по названию; из совпавших правил выбирается максимальная длительность. */
export function estimateTaskMinutes(title: string): number {
  const normalized = title.normalize('NFC').toLowerCase().replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  let minutes = 0;
  for (const rule of rules) {
    if (rule.pattern.test(normalized)) minutes = Math.max(minutes, rule.minutes);
  }
  return minutes || defaultEstimatedMinutes;
}

/** При ручной правке и редактировании сохранённой задачи время не меняется. */
export function estimatedTimeAfterTitleChange(title: string, currentTime: string, manuallyEdited: boolean, editingExisting: boolean): string {
  return manuallyEdited || editingExisting ? currentTime : String(estimateTaskMinutes(title));
}
