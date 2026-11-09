"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

function appOrigin(): string {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();

  if (productionHost) {
    return `https://${productionHost.replace(/^https?:\/\//, "")}`;
  }

  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
}

function normalizeEmail(value: FormDataEntryValue | null): string {
  return String(value || "").trim().toLowerCase();
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function authErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Неверный email или пароль.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Подтвердите email по ссылке из письма, затем войдите снова.";
  }
  if (normalized.includes("user already registered")) {
    return "Аккаунт с таким email уже существует. Войдите или восстановите пароль.";
  }
  if (normalized.includes("password should be")) {
    return "Пароль должен содержать не менее 8 символов.";
  }
  if (normalized.includes("rate limit")) {
    return "Слишком много попыток. Подождите несколько минут.";
  }
  if (normalized.includes("signups not allowed")) {
    return "Регистрация временно закрыта.";
  }

  return "Не удалось выполнить действие. Проверьте данные и попробуйте снова.";
}

export async function signInWithPasswordAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") || "");

  if (!validEmail(email) || password.length < 8) {
    return {
      status: "error",
      message: "Введите корректный email и пароль от 8 символов."
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { status: "error", message: authErrorMessage(error.message) };
  }

  redirect("/dashboard");
}

export async function signUpWithPasswordAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim().slice(0, 100);
  const consent = formData.get("consent") === "on";

  if (!validEmail(email)) {
    return { status: "error", message: "Введите корректный email." };
  }
  if (password.length < 8) {
    return {
      status: "error",
      message: "Пароль должен содержать не менее 8 символов."
    };
  }
  if (fullName.length < 2) {
    return { status: "error", message: "Укажите имя или название компании." };
  }
  if (!consent) {
    return {
      status: "error",
      message: "Подтвердите согласие на обработку персональных данных."
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${appOrigin()}/auth/callback?next=/dashboard`
    }
  });

  if (error) {
    return { status: "error", message: authErrorMessage(error.message) };
  }

  if (data.session) {
    redirect("/dashboard");
  }

  return {
    status: "success",
    message:
      "Аккаунт создан. Откройте письмо от Supabase и подтвердите email, после чего войдите в кабинет."
  };
}

export async function sendMagicLinkAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = normalizeEmail(formData.get("email"));
  const consent = formData.get("consent") === "on";

  if (!validEmail(email)) {
    return { status: "error", message: "Введите корректный email." };
  }
  if (!consent) {
    return {
      status: "error",
      message: "Подтвердите согласие на обработку персональных данных."
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${appOrigin()}/auth/callback?next=/dashboard`
    }
  });

  if (error) {
    return { status: "error", message: authErrorMessage(error.message) };
  }

  return {
    status: "success",
    message:
      "Ссылка для входа отправлена. Проверьте почту и откройте письмо на этом устройстве."
  };
}
