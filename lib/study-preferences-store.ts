import { normalizePreferences, weekdays, type StudyPreferences } from './study-preferences';
import type { createClient } from './supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;
type DatabasePreferences = Record<`${(typeof weekdays)[number]}_minutes`, number>;
type QueryError = { code?: string; message?: string; details?: string; hint?: string };

// В журнал попадают только диагностические поля ошибки Supabase, без объекта запроса и сессии.
function logPreferencesError(operation: 'load' | 'save', error: unknown) {
  const source = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const diagnostic = Object.fromEntries(
    (['code', 'message', 'details', 'hint'] as const)
      .filter(key => typeof source[key] === 'string')
      .map(key => [key, source[key]]),
  );
  console.error(`Ошибка ${operation === 'load' ? 'загрузки' : 'сохранения'} настроек Supabase:`, diagnostic);
}

export async function loadPreferences(client: Client, userId: string): Promise<{ preferences: StudyPreferences | null; error: QueryError | null }> {
  try {
    const { data, error } = await client.from('study_preferences')
      .select(weekdays.map(day => `${day}_minutes`).join(','))
      .eq('user_id', userId).maybeSingle();
    if (error) {
      logPreferencesError('load', error);
      return { preferences: null, error };
    }
    const row = data as unknown as DatabasePreferences | null;
    const values = row ? Object.fromEntries(weekdays.map(day => [day, row[`${day}_minutes`]])) as StudyPreferences : null;
    return { preferences: normalizePreferences(values), error: null };
  } catch (error) {
    logPreferencesError('load', error);
    return { preferences: null, error: { message: 'Не удалось выполнить запрос настроек.' } };
  }
}
export async function savePreferences(client: Client, userId: string, preferences: StudyPreferences): Promise<{ error: QueryError | null }> {
  const values = Object.fromEntries(weekdays.map(day => [`${day}_minutes`, preferences[day]]));
  try {
    const { error } = await client.from('study_preferences').upsert({ ...values, user_id: userId }, { onConflict: 'user_id' });
    if (error) logPreferencesError('save', error);
    return { error };
  } catch (error) {
    logPreferencesError('save', error);
    return { error: { message: 'Не удалось выполнить запрос настроек.' } };
  }
}
