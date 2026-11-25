'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';

export default function LogoutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  async function handleLogout() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setLogoutError('');

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      router.replace('/login');
      router.refresh();
    } catch (error) {
      console.error('Ошибка выхода из аккаунта:', error);
      setLogoutError('Не удалось выйти из аккаунта.');
      setIsSigningOut(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleLogout}
        disabled={isSigningOut}
        className="w-full rounded-md border border-[#184649] px-4 py-2.5 text-sm font-medium text-[#184649] transition-colors hover:bg-[#256569] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fc3f7] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSigningOut ? 'Выход...' : 'Выйти'}
      </button>

      {logoutError && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {logoutError}
        </p>
      )}
    </>
  );
}
