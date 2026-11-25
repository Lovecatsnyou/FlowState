import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import Sidebar from "../components/sidebar";
import AccountForms from "./account-form";

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const profileName: unknown = user.user_metadata?.full_name ?? user.user_metadata?.name;
  const initialName = typeof profileName === "string" ? profileName.trim() : "";

  return (
    <div className="min-h-screen bg-[#C0D6D8] text-[#212529] lg:flex">
      <Sidebar activePath="/account" email={user.email} />

      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:p-10">
        <div className="mx-auto max-w-2xl">
          <header className="mb-8">
            <p className="mb-2 text-sm font-medium text-[#256569]">Профиль</p>
            <h1 className="text-3xl font-bold tracking-tight text-[#256569]">
              Аккаунт
            </h1>
            <p className="mt-3 text-sm text-[#6c757d] sm:text-base">
              Управление именем пользователя, электронной почтой и паролем.
            </p>
          </header>

          <AccountForms
            initialName={initialName}
            initialEmail={user.email ?? ""}
          />
        </div>
      </main>
    </div>
  );
}
