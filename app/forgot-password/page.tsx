"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSent, setIsSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsLoading(true);

    const supabase = createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setIsSent(true);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#E3F1FB] p-6 text-[#173f70]">
      <div className="w-full max-w-md rounded-xl border border-[#c4def1] bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-bold mb-2">Восстановление пароля</h1>
        <p className="text-gray-600 mb-6">
          Введите email, указанный при регистрации, и мы отправим ссылку для сброса пароля.
        </p>

        {isSent ? (
          <div className="space-y-4">
            <div
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
            >
              Письмо для сброса пароля отправлено на <strong>{email}</strong>. Проверьте почту и перейдите по ссылке.
            </div>

            <div className="text-center text-sm text-[#495057]">
              <Link
                href="/login"
                className="font-medium text-[#2963af] underline hover:text-[#173f70]"
              >
                Вернуться ко входу
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block font-medium">
                Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full rounded-lg border border-[#ced4da] px-3 py-2 text-[#212529] focus:border-[#2963af] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-[#2963af] px-4 py-2 font-medium text-white transition-colors hover:bg-[#204f8a] disabled:opacity-50"
            >
              {isLoading ? "Отправка..." : "Отправить письмо"}
            </button>

            <div className="text-center text-sm text-[#495057]">
              Вспомнили пароль?{" "}
              <Link
                href="/login"
                className="font-medium text-[#2963af] underline hover:text-[#173f70]"
              >
                Войти
              </Link>
            </div>

            {errorMessage && (
              <p className="text-sm text-red-700">
                {errorMessage}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
