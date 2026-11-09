"use client";

import {
  ArrowRight,
  Github,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck
} from "lucide-react";
import { useActionState, useState } from "react";

import {
  sendMagicLinkAction,
  signInWithPasswordAction,
  signUpWithPasswordAction,
  type AuthActionState
} from "@/app/login/actions";
import { cn } from "@/lib/cn";

const initialState: AuthActionState = { status: "idle" };

type AuthMode = "login" | "register";
type LoginMethod = "password" | "magic";

function FormMessage({ state }: { state: AuthActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <p
      className={cn(
        "rounded-xl border px-3.5 py-3 text-xs leading-5",
        state.status === "success"
          ? "border-mint-400/20 bg-mint-400/[0.07] text-mint-300"
          : "border-red-400/20 bg-red-400/[0.07] text-red-200"
      )}
    >
      {state.message}
    </p>
  );
}

function SubmitButton({
  pending,
  children
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-mint-400 px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-[#65efc2] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

export function AuthForm({ initialMode = "login" }: { initialMode?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [method, setMethod] = useState<LoginMethod>("password");
  const [loginState, loginAction, loginPending] = useActionState(
    signInWithPasswordAction,
    initialState
  );
  const [registerState, registerAction, registerPending] = useActionState(
    signUpWithPasswordAction,
    initialState
  );
  const [magicState, magicAction, magicPending] = useActionState(
    sendMagicLinkAction,
    initialState
  );

  return (
    <div>
      <div className="grid grid-cols-2 rounded-xl border border-white/[0.08] bg-black/20 p-1">
        {(["login", "register"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMode(item)}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-medium transition",
              mode === item
                ? "bg-white/[0.08] text-white shadow-sm"
                : "text-slate-500 hover:text-slate-200"
            )}
          >
            {item === "login" ? "Вход" : "Регистрация"}
          </button>
        ))}
      </div>

      <a
        href="/api/auth/github"
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition hover:border-white/[0.2] hover:bg-white/[0.07]"
      >
        <Github className="h-4 w-4" />
        Продолжить через GitHub
      </a>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-white/[0.08]" />
        <span className="text-[10px] uppercase tracking-[0.16em] text-slate-600">
          или по email
        </span>
        <span className="h-px flex-1 bg-white/[0.08]" />
      </div>

      {mode === "login" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMethod("password")}
              className={cn(
                "rounded-lg border px-3 py-2 text-[11px] transition",
                method === "password"
                  ? "border-mint-400/25 bg-mint-400/[0.07] text-mint-300"
                  : "border-white/[0.07] text-slate-500 hover:text-slate-300"
              )}
            >
              Пароль
            </button>
            <button
              type="button"
              onClick={() => setMethod("magic")}
              className={cn(
                "rounded-lg border px-3 py-2 text-[11px] transition",
                method === "magic"
                  ? "border-mint-400/25 bg-mint-400/[0.07] text-mint-300"
                  : "border-white/[0.07] text-slate-500 hover:text-slate-300"
              )}
            >
              Ссылка на email
            </button>
          </div>

          {method === "password" ? (
            <form action={loginAction} className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs text-slate-400">
                  Email
                </span>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-600" />
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="name@company.kz"
                    className="w-full rounded-xl border border-white/[0.1] bg-black/20 py-3 pl-10 pr-3.5 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-mint-400/50"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs text-slate-400">
                  Пароль
                </span>
                <div className="relative">
                  <LockKeyhole className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-600" />
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="current-password"
                    placeholder="Минимум 8 символов"
                    className="w-full rounded-xl border border-white/[0.1] bg-black/20 py-3 pl-10 pr-3.5 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-mint-400/50"
                  />
                </div>
              </label>
              <FormMessage state={loginState} />
              <SubmitButton pending={loginPending}>
                Войти
                <ArrowRight className="h-4 w-4" />
              </SubmitButton>
            </form>
          ) : (
            <form action={magicAction} className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs text-slate-400">
                  Email
                </span>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-600" />
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="name@company.kz"
                    className="w-full rounded-xl border border-white/[0.1] bg-black/20 py-3 pl-10 pr-3.5 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-mint-400/50"
                  />
                </div>
              </label>
              <label className="flex items-start gap-2.5 text-[11px] leading-5 text-slate-500">
                <input
                  name="consent"
                  type="checkbox"
                  required
                  className="mt-0.5 accent-[#4de2b2]"
                />
                <span>
                  Согласен с{" "}
                  <a
                    href="/legal/privacy"
                    className="text-slate-300 underline decoration-white/20 underline-offset-2"
                  >
                    обработкой данных
                  </a>{" "}
                  и{" "}
                  <a
                    href="/legal/terms"
                    className="text-slate-300 underline decoration-white/20 underline-offset-2"
                  >
                    условиями
                  </a>
                  .
                </span>
              </label>
              <FormMessage state={magicState} />
              <SubmitButton pending={magicPending}>
                Отправить ссылку
                <Mail className="h-4 w-4" />
              </SubmitButton>
            </form>
          )}
        </>
      ) : (
        <form action={registerAction} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs text-slate-400">
              Имя или компания
            </span>
            <input
              name="fullName"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
              placeholder="Муксуд / TOO Company"
              className="w-full rounded-xl border border-white/[0.1] bg-black/20 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-mint-400/50"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-slate-400">Email</span>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-600" />
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@company.kz"
                className="w-full rounded-xl border border-white/[0.1] bg-black/20 py-3 pl-10 pr-3.5 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-mint-400/50"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-slate-400">
              Пароль
            </span>
            <div className="relative">
              <LockKeyhole className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-600" />
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Минимум 8 символов"
                className="w-full rounded-xl border border-white/[0.1] bg-black/20 py-3 pl-10 pr-3.5 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-mint-400/50"
              />
            </div>
          </label>
          <label className="flex items-start gap-2.5 text-[11px] leading-5 text-slate-500">
            <input
              name="consent"
              type="checkbox"
              required
              className="mt-0.5 accent-[#4de2b2]"
            />
            <span>
              Согласен с{" "}
              <a
                href="/legal/privacy"
                className="text-slate-300 underline decoration-white/20 underline-offset-2"
              >
                обработкой данных
              </a>{" "}
              и{" "}
              <a
                href="/legal/terms"
                className="text-slate-300 underline decoration-white/20 underline-offset-2"
              >
                условиями
              </a>
              .
            </span>
          </label>
          <FormMessage state={registerState} />
          <SubmitButton pending={registerPending}>
            Создать аккаунт
            <ArrowRight className="h-4 w-4" />
          </SubmitButton>
        </form>
      )}

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[10px] leading-5 text-slate-600">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint-400/70" />
        Тексты AI-запросов не сохраняются. Подтверждение email защищает аккаунт от
        регистрации на чужой адрес.
      </div>
    </div>
  );
}
