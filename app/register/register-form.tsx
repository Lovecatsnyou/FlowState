"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function RegisterForm() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isSubmitted) return;

    const supabase = createClient();

    const checkEmailConfirmed = async () => {
      // 1. Проверяем, не появилась ли сессия в текущем браузере (например, при клике по ссылке в соседней вкладке)
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      // 2. Если письмо подтвердили с другого устройства/браузера — пробуем авторизоваться
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (data?.session && !error) {
        router.replace("/dashboard");
        router.refresh();
      }
    };

    const intervalId = setInterval(checkEmailConfirmed, 3000);
    return () => clearInterval(intervalId);
  }, [isSubmitted, email, password, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setIsLoading(true);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setErrorMessage("Пожалуйста, укажите имя пользователя");
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: trimmedName,
          name: trimmedName,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    // Если подтверждение почты отключено в настройках проекта и сессия создана сразу
    if (data.session) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }

    setIsSubmitted(true);
  }

  if (isSubmitted) {
    return (
      <div className="space-y-4">
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 space-y-2"
        >
          <p className="font-semibold text-base text-emerald-800">
            Письмо отправлено!
          </p>
          <p>
            На электронную почту <strong>{email}</strong> отправлено письмо для подтверждения аккаунта.
          </p>
          <p className="text-xs text-emerald-700">
            Перейдите по ссылке из письма — после подтверждения эта страница автоматически перенаправит вас в главное меню.
          </p>
        </div>

        <div className="text-center text-sm text-[#495057]">
          Уже подтвердили почту?{" "}
          <Link
            href="/login"
            className="font-medium text-[#2963af] underline hover:text-[#173f70]"
          >
            Войти
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block font-medium">
          Имя пользователя
        </label>

        <input
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Как к вам обращаться"
          required
          className="w-full rounded-lg border border-[#ced4da] px-3 py-2 text-[#212529] focus:border-[#2963af] focus:outline-none"
        />
      </div>

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

      <div>
        <label className="mb-1 block font-medium">
          Пароль
        </label>

        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={6}
          className="w-full rounded-lg border border-[#ced4da] px-3 py-2 text-[#212529] focus:border-[#2963af] focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-[#2963af] px-4 py-2 font-medium text-white transition-colors hover:bg-[#204f8a] disabled:opacity-50"
      >
        {isLoading ? "Регистрация..." : "Зарегистрироваться"}
      </button>

      <div className="text-center text-sm text-[#495057]">
        Уже есть аккаунт?{" "}
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
  );
}
