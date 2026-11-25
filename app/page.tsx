import Link from 'next/link';
import Sidebar from './components/sidebar';
import { createClient } from '../lib/supabase/server';

const sections = [
  { title: 'Dashboard', href: '/dashboard', description: 'Обзор учебной нагрузки и рекомендуемого плана.' },
  { title: 'Tasks', href: '/tasks', description: 'Управление заданиями, дедлайнами и календарём.' },
  { title: 'Настройки доступности', href: '/settings', description: 'Выбор доступного времени для учёбы по дням недели.' },
];

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-[#C0D6D8] text-[#212529] lg:flex">
      <Sidebar activePath="/" email={user?.email} isAuthenticated={!!user} />
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:p-10">
        <div className="mx-auto max-w-6xl">
          <header className="mb-10 max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight text-[#256569]">Добро пожаловать в FlowState</h1>
            <p className="mt-3 text-base leading-relaxed text-[#6c757d]">Планируйте учебные задачи, следите за дедлайнами и распределяйте время для учёбы.</p>
            {!user && <p className="mt-4 text-sm text-[#6c757d]"><Link href="/login" className="font-semibold text-[#2963af] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7]">Войдите</Link> или <Link href="/register" className="font-semibold text-[#2963af] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7]">зарегистрируйтесь</Link>, чтобы управлять своими задачами.</p>}
          </header>
          <section aria-label="Разделы FlowState" className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {sections.map(section => <Link key={section.href} href={section.href} className="block rounded-xl border border-[#e9ecef] bg-white p-6 shadow-[0_4px_6px_rgba(0,0,0,0.02),0_1px_3px_rgba(0,0,0,0.08)] transition-colors hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#469092]"><h2 className="text-lg font-semibold text-[#256569]">{section.title}</h2><p className="mt-2 text-sm leading-relaxed text-[#6c757d]">{section.description}</p></Link>)}
          </section>
        </div>
      </main>
    </div>
  );
}
