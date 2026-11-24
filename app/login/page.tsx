import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#E3F1FB] p-6 text-[#173f70]">
      <div className="w-full max-w-md rounded-xl border border-[#c4def1] bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-bold mb-2">Вход</h1>

        <p className="text-gray-600 mb-6">
          Войдите в аккаунт FlowState
        </p>

        <LoginForm />
      </div>
    </main>
  );
}
