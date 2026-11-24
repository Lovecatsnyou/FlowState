import Link from 'next/link';
import LogoutButton from '../tasks/logout-button';

const navigationItems = [
  { label: 'Главная', href: '/' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Tasks', href: '/tasks' },
  { label: 'Настройки', href: '/settings' },
];

type SidebarProps = {
  activePath: '/' | '/dashboard' | '/tasks' | '/settings' | '/account';
  email: string | undefined;
  isAuthenticated?: boolean;
};

export default function Sidebar({ activePath, email, isAuthenticated = true }: SidebarProps) {
  return (
    <aside className="sticky top-0 z-20 flex flex-col bg-[#99C3E4] text-[#173f70] shadow-[2px_0_5px_rgba(0,0,0,0.05)] lg:h-screen lg:w-[260px] lg:shrink-0 lg:overflow-y-auto">
      <div className="border-b border-[#c4def1] px-6 py-5 lg:py-6">
        <Link
          href="/"
          className="font-display text-3xl font-bold tracking-wide text-[#ffffff] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4fc3f7]"
        >
          FlowState
        </Link>
      </div>

      <nav aria-label="Основная навигация" className="px-4 py-3 lg:py-6">
        <ul className="flex gap-2 overflow-x-auto lg:block lg:space-y-2">
          {navigationItems.map((item) => {
            const isActive = item.href === activePath;

            return (
              <li key={item.label} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`block rounded-md px-4 py-3 text-base font-medium transition-colors ${
                    isActive
                      ? 'bg-[#2963af] text-white'
                      : 'text-[#173f70] hover:bg-[#d3e8f7] hover:text-[#173f70]'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section
        aria-label={isAuthenticated ? 'Текущий пользователь' : 'Вход в аккаунт'}
        className="mt-auto border-t border-[#c4def1] px-6 py-5"
      >
        {isAuthenticated ? (
          <>
            <div className="mb-4 flex items-center gap-3">
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d3e8f7] text-sm font-semibold text-[#173f70]">
                {email?.charAt(0).toUpperCase() || '?'}
              </span>
              <p className="min-w-0 break-all text-sm text-[#173f70]">{email || 'Email не указан'}</p>
            </div>
            <Link href="/account" aria-current={activePath === '/account' ? 'page' : undefined} className="mb-4 block text-sm font-medium text-[#173f70] hover:text-[#2963af] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7]">Аккаунт</Link>
            <LogoutButton />
          </>
        ) : (
          <div className="flex flex-wrap gap-4 text-sm font-medium">
            <Link href="/login" className="text-[#173f70] underline hover:text-[#2963af] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7]">Войти</Link>
            <Link href="/register" className="text-[#173f70] underline hover:text-[#2963af] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7]">Зарегистрироваться</Link>
          </div>
        )}
      </section>
    </aside>
  );
}
