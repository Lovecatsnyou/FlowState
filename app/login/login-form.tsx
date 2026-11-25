"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setIsLoading(true);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMessage("Неверный email или пароль");
      setIsLoading(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
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
          className="w-full rounded-lg border border-[#e0eeed] px-3 py-2 text-[#212529] focus:border-[#256569] focus:outline-none"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block font-medium">
            Пароль
          </label>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-[#2963af] hover:text-[#256569] hover:underline"
          >
            Забыли пароль?
          </Link>
        </div>

        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="w-full rounded-lg border border-[#e0eeed] px-3 py-2 text-[#212529] focus:border-[#256569] focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-[#256569] px-4 py-2 font-medium text-white transition-colors hover:bg-[#469092] disabled:opacity-50"
      >
        {isLoading ? "Вход..." : "Войти"}
      </button>

      <div className="text-center text-sm text-[#495057]">
        Нет аккаунта?{" "}
        <Link
          href="/register"
          className="font-medium text-[#2963af] underline hover:text-[#256569]"
        >
          Зарегистрироваться
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
