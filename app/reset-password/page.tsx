"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (password.length < 6) {
      setErrorMessage("Пароль должен содержать минимум 6 символов");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Пароли не совпадают");
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#E3F1FB] p-6 text-[#173f70]">
      <div className="w-full max-w-md rounded-xl border border-[#c4def1] bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-bold mb-2">Новый пароль</h1>
        <p className="text-gray-600 mb-6">
          Придумайте новый пароль для входа в FlowState.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block font-medium">
              Новый пароль
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

          <div>
            <label className="mb-1 block font-medium">
              Повторите пароль
            </label>

            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
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
            {isLoading ? "Сохранение..." : "Сохранить новый пароль"}
          </button>

          {errorMessage && (
            <p className="text-sm text-red-700">
              {errorMessage}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
