'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';
import { savePreferences } from '../../lib/study-preferences-store';
import { weekdays, type StudyPreferences } from '../../lib/study-preferences';

export async function saveSettings(form: FormData) {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect('/login');
  const values = {} as StudyPreferences;
  for (const day of weekdays) {
    const raw = form.get(day);
    if (typeof raw !== 'string' || !/^\d+$/.test(raw) || Number(raw) > 720) redirect('/settings?error=invalid');
    values[day] = Number(raw);
  }
  const result = await savePreferences(client, user.id, values);
  if (result.error) redirect('/settings?error=save');
  revalidatePath('/dashboard');
  revalidatePath('/tasks');
  revalidatePath('/settings');
  redirect('/settings?saved=1');
}
