import { ArrowLeft, Check, Github, LockKeyhole, Route, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { AuthForm } from "@/components/auth/auth-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Вход и регистрация",
  description:
    "Войдите в QazRouter через GitHub, email и пароль или получите ссылку для входа на почту."
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const initialMode = params.mode === "register" ? "register" : "login";

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-60" />
      <div className="pointer-events-none absolute left-1/2 top-[-28rem] h-[56rem] w-[56rem] -translate-x-1/2 rounded-full border border-mint-400/10 bg-mint-400/[0.025] shadow-glow" />

      <div className="relative z-10 mx-auto grid min-h-screen max-w-6xl px-5 py-6 sm:px-8 lg:grid-cols-[1fr_440px] lg:items-center lg:gap-20 lg:px-10">
        <section className="hidden lg:block">
          <BrandMark />
          <p className="mt-16 text-[10px] font-semibold uppercase tracking-[0.24em] text-mint-400">
            Secure AI access · Kazakhstan
          </p>
          <h1 className="mt-5 max-w-xl text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.04em] text-white">
            Один аккаунт для доступа к мировым моделям.
          </h1>
          <p className="mt-6 max-w-lg text-sm leading-7 text-slate-400">
            Регистрация через GitHub, email и пароль или одноразовую ссылку.
            Управляйте ключами, балансом и политикой защиты данных в одном месте.
          </p>
          <div className="mt-10 space-y-4">
            {[
              [ShieldCheck, "Строгая проверка PII до обращения к модели"],
              [Route, "DeepSeek, Gemini, GPT, Claude, Qwen и Llama"],
              [LockKeyhole, "API-ключи хранятся только в виде HMAC-хеша"]
            ].map(([Icon, text]) => {
              const FeatureIcon = Icon as typeof ShieldCheck;
              return (
                <div
                  key={String(text)}
                  className="flex items-center gap-3 text-sm text-slate-300"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-mint-400">
                    <FeatureIcon className="h-4 w-4" />
                  </span>
                  {String(text)}
                </div>
              );
            })}
          </div>
          <div className="mt-12 flex flex-wrap gap-5 text-[10px] text-slate-600">
            {["Оплата в KZT", "Аудит usage", "OpenAI-compatible"].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <Check className="h-3 w-3 text-mint-400" />
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <BrandMark />
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              На главную
            </Link>
          </div>
          <div className="panel-border rounded-[24px] p-5 shadow-panel sm:p-7">
            <div className="mb-6">
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-mint-400">
                <Github className="h-3.5 w-3.5" />
                QazRouter Account
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {initialMode === "register"
                  ? "Создайте аккаунт"
                  : "Добро пожаловать"}
              </h2>
              <p className="mt-1.5 text-xs leading-5 text-slate-500">
                Выберите удобный способ входа. После регистрации потребуется
                подтвердить email.
              </p>
            </div>
            <AuthForm initialMode={initialMode} />
          </div>
          <Link
            href="/"
            className="mt-5 hidden items-center justify-center gap-2 text-xs text-slate-500 transition hover:text-white lg:flex"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Вернуться на главную
          </Link>
        </section>
      </div>
    </main>
  );
}
