"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

type AccountFormsProps = {
  initialName: string;
  initialEmail: string;
};

type FormFeedback = {
  type: "success" | "error";
  text: string;
} | null;

const cardStyles =
  "rounded-xl border border-[#e9ecef] bg-white p-6 shadow-[0_4px_6px_rgba(0,0,0,0.02),0_1px_3px_rgba(0,0,0,0.08)]";

export default function AccountForms({ initialName, initialEmail }: AccountFormsProps) {
  const router = useRouter();

  // 1. Имя пользователя
  const [fullName, setFullName] = useState(initialName);
  const [nameLoading, setNameLoading] = useState(false);
  const [nameFeedback, setNameFeedback] = useState<FormFeedback>(null);

  // 2. Электронная почта
  const [email, setEmail] = useState(initialEmail);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<FormFeedback>(null);

  // 3. Пароль
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<FormFeedback>(null);

  async function handleUpdateName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameFeedback(null);

    const trimmed = fullName.trim();
    if (!trimmed) {
      setNameFeedback({ type: "error", text: "Имя пользователя не может быть пустым." });
      return;
    }

    setNameLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: trimmed,
        name: trimmed,
      },
    });

    setNameLoading(false);

    if (error) {
      setNameFeedback({ type: "error", text: error.message });
      return;
    }

    setNameFeedback({ type: "success", text: "Имя пользователя успешно обновлено." });
    router.refresh();
  }

  async function handleUpdateEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailFeedback(null);

    const trimmed = email.trim();
    if (!trimmed || trimmed === initialEmail) {
      setEmailFeedback({ type: "error", text: "Введите новый адрес электронной почты." });
      return;
    }

    setEmailLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser(
      { email: trimmed },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/account` }
    );

    setEmailLoading(false);

    if (error) {
      setEmailFeedback({ type: "error", text: error.message });
      return;
    }

    setEmailFeedback({
      type: "success",
      text: "На указанную почту отправлено письмо для подтверждения нового адреса.",
    });
  }

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordFeedback(null);

    if (newPassword.length < 6) {
      setPasswordFeedback({
        type: "error",
        text: "Пароль должен содержать минимум 6 символов.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({
        type: "error",
        text: "Введённые пароли не совпадают.",
      });
      return;
    }

    setPasswordLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setPasswordLoading(false);

    if (error) {
      setPasswordFeedback({ type: "error", text: error.message });
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setPasswordFeedback({ type: "success", text: "Пароль успешно изменён." });
  }

  return (
    <div className="space-y-6">
      {/* Карточка 1: Имя пользователя */}
      <section className={cardStyles}>
        <h2 className="text-xl font-semibold text-[#2963af]">Имя пользователя</h2>
        <p className="mt-1 text-sm text-[#6c757d]">
          Отображается в приветствии на странице Dashboard.
        </p>

        <form onSubmit={handleUpdateName} className="mt-5 space-y-4">
          <div>
            <label htmlFor="account-name" className="block text-sm font-medium text-[#2963af]">
              Имя
            </label>
            <input
              id="account-name"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              className="mt-2 block w-full rounded-lg border border-[#ced4da] px-3 py-2 text-[#495057] focus:border-[#2963af] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={nameLoading}
            className="rounded-lg bg-[#2963af] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#204f8a] disabled:opacity-50"
          >
            {nameLoading ? "Сохранение..." : "Сохранить имя"}
          </button>

          {nameFeedback && (
            <p
              role={nameFeedback.type === "error" ? "alert" : "status"}
              className={`text-sm ${
                nameFeedback.type === "error" ? "text-red-700" : "text-emerald-700"
              }`}
            >
              {nameFeedback.text}
            </p>
          )}
        </form>
      </section>

      {/* Карточка 2: Электронная почта */}
      <section className={cardStyles}>
        <h2 className="text-xl font-semibold text-[#2963af]">Электронная почта</h2>
        <p className="mt-1 text-sm text-[#6c757d]">
          После изменения почты потребуется подтвердить новый адрес по ссылке из письма.
        </p>

        <form onSubmit={handleUpdateEmail} className="mt-5 space-y-4">
          <div>
            <label htmlFor="account-email" className="block text-sm font-medium text-[#2963af]">
              Email
            </label>
            <input
              id="account-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-2 block w-full rounded-lg border border-[#ced4da] px-3 py-2 text-[#495057] focus:border-[#2963af] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={emailLoading}
            className="rounded-lg bg-[#2963af] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#204f8a] disabled:opacity-50"
          >
            {emailLoading ? "Отправка..." : "Изменить email"}
          </button>

          {emailFeedback && (
            <p
              role={emailFeedback.type === "error" ? "alert" : "status"}
              className={`text-sm ${
                emailFeedback.type === "error" ? "text-red-700" : "text-emerald-700"
              }`}
            >
              {emailFeedback.text}
            </p>
          )}
        </form>
      </section>

      {/* Карточка 3: Смена пароля */}
      <section className={cardStyles}>
        <h2 className="text-xl font-semibold text-[#2963af]">Смена пароля</h2>
        <p className="mt-1 text-sm text-[#6c757d]">
          Задайте новый пароль длиной не менее 6 символов.
        </p>

        <form onSubmit={handleUpdatePassword} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="account-new-password" className="block text-sm font-medium text-[#2963af]">
                Новый пароль
              </label>
              <input
                id="account-new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={6}
                className="mt-2 block w-full rounded-lg border border-[#ced4da] px-3 py-2 text-[#495057] focus:border-[#2963af] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="account-confirm-password" className="block text-sm font-medium text-[#2963af]">
                Подтвердите новый пароль
              </label>
              <input
                id="account-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={6}
                className="mt-2 block w-full rounded-lg border border-[#ced4da] px-3 py-2 text-[#495057] focus:border-[#2963af] focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={passwordLoading}
            className="rounded-lg bg-[#2963af] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#204f8a] disabled:opacity-50"
          >
            {passwordLoading ? "Обновление..." : "Изменить пароль"}
          </button>

          {passwordFeedback && (
            <p
              role={passwordFeedback.type === "error" ? "alert" : "status"}
              className={`text-sm ${
                passwordFeedback.type === "error" ? "text-red-700" : "text-emerald-700"
              }`}
            >
              {passwordFeedback.text}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
