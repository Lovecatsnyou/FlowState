import { redirect } from 'next/navigation';
import Sidebar from '../components/sidebar';
import { createClient } from '../../lib/supabase/server';
import { loadPreferences } from '../../lib/study-preferences-store';
import { weekdays } from '../../lib/study-preferences';
import { saveSettings } from './actions';

const labels = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect('/login');
  const { preferences, error: loadError } = await loadPreferences(client, user.id);
  const params = await searchParams;
  return <div className="min-h-screen bg-[#C0D6D8] lg:flex"><Sidebar activePath="/settings" email={user.email} /><main className="flex-1 px-5 py-8 sm:px-8 lg:p-10"><div className="max-w-2xl"><h1 className="text-3xl font-bold text-[#256569]">Настройки доступности</h1><p className="mt-3 text-sm text-[#6c757d]">Укажите доступное время в минутах для каждого дня недели. Ноль означает выходной.</p>
    {loadError || !preferences ? <p role="alert" className="mt-4 text-red-700">Не удалось загрузить настройки из базы данных. Проверьте соединение и обновите страницу.</p> : <form action={saveSettings} className="mt-6 rounded-xl border border-[#e9ecef] bg-white p-6 shadow-sm"><div className="grid gap-4 sm:grid-cols-2">{weekdays.map((day, i) => <label key={day} className="text-sm font-medium text-[#256569]">{labels[i]}<input className="mt-2 block w-full rounded-lg text-[#495057] border border-[#ced4da] px-3 py-2" type="number" name={day} min="0" max="720" step="1" required defaultValue={preferences[day]} /></label>)}</div><button className="mt-6 rounded-lg bg-[#256569] px-5 py-3 font-semibold text-white" type="submit">Сохранить</button></form>}
    {params.saved && <p role="status" className="mt-4 text-[#256569]">Настройки сохранены.</p>}{params.error && <p role="alert" className="mt-4 text-red-700">{params.error === 'invalid' ? 'Введите целые значения от 0 до 720.' : 'Не удалось сохранить настройки.'}</p>}
  </div></main></div>;
}
