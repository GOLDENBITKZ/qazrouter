import {
  Activity,
  ArrowRight,
  Braces,
  ChevronRight,
  Cpu,
  Github,
  LogOut,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ApiKeysCard, type ApiKeyListItem } from "@/components/dashboard/api-keys-card";
import { BalanceCard } from "@/components/dashboard/balance-card";
import { QuickstartCard } from "@/components/dashboard/quickstart-card";
import { BrandMark, StatusDot } from "@/components/brand-mark";
import {
  formatKzt,
  MODEL_CATALOG,
  PUBLIC_MODELS
} from "@/lib/billing/pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Личный кабинет",
  robots: { index: false, follow: false }
};

interface UsageLog {
  id: string;
  request_id: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_kzt: number;
  status: string;
  masked_entities: unknown;
  masked_total: number;
  pii_engine: string;
  pii_policy_version: string;
  pii_risk: number;
  created_at: string;
}

interface DashboardMetrics {
  total_spent_kzt: number;
  month_spent_kzt: number;
  total_requests: number;
  total_tokens: number;
  masked_iin: number;
  masked_phone: number;
  masked_card: number;
  masked_total: number;
  pending_topups: number;
}

function getMaskedValue(entity: unknown, key: "iin" | "phone" | "card") {
  if (
    entity &&
    typeof entity === "object" &&
    key in entity &&
    typeof entity[key as keyof typeof entity] === "number"
  ) {
    return entity[key as keyof typeof entity] as number;
  }

  return 0;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-KZ", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/api/auth/github");
  }

  const [profileResult, keysResult, usageResult, metricsResult] =
    await Promise.all([
      supabase
        .from("users")
        .select("id,email,full_name,balance_kzt")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("api_keys")
        .select(
          "id,name,key_prefix,key_last_four,is_active,created_at,last_used_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("usage_logs")
        .select(
          "id,request_id,model,provider,input_tokens,output_tokens,total_tokens,cost_kzt,status,masked_entities,masked_total,pii_engine,pii_policy_version,pii_risk,created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.rpc("get_my_dashboard_metrics")
    ]);

  const profile = profileResult.data;
  const keys = (keysResult.data || []) as ApiKeyListItem[];
  const usageLogs = (usageResult.data || []) as UsageLog[];

  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center px-5">
        <div className="panel-border max-w-md rounded-2xl p-7 text-center">
          <h1 className="text-xl font-semibold text-white">
            Профиль ещё не создан
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Выполните SQL-схему на вкладке Supabase SQL Editor и войдите снова.
            Триггер создаст профиль автоматически.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 text-sm text-mint-400"
          >
            На главную <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    );
  }

  const metrics = (metricsResult.data || {
    total_spent_kzt: 0,
    month_spent_kzt: 0,
    total_requests: 0,
    total_tokens: 0,
    masked_iin: 0,
    masked_phone: 0,
    masked_card: 0,
    masked_total: 0,
    pending_topups: 0
  }) as DashboardMetrics;
  const displayName = profile.full_name || user.email || "Разработчик";
  const endpoint =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://your-domain.kz";

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#070b11]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-7 lg:px-10">
          <div className="flex items-center gap-5">
            <BrandMark />
            <span className="hidden h-5 w-px bg-white/10 sm:block" />
            <span className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
              <StatusDot />
              Все системы работают
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="#quickstart"
              className="hidden rounded-lg px-3 py-2 text-xs text-slate-400 transition hover:text-white md:inline-flex"
            >
              Документация
            </Link>
            <div className="hidden items-center gap-2.5 border-l border-white/[0.08] pl-4 sm:flex">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.07] text-[10px] font-semibold text-slate-200">
                {initials(displayName) || "KZ"}
              </span>
              <div className="max-w-36">
                <p className="truncate text-xs font-medium text-slate-200">
                  {displayName}
                </p>
                <p className="truncate text-[10px] text-slate-600">
                  {profile.email}
                </p>
              </div>
            </div>
            <form action="/auth/logout" method="post">
              <button
                type="submit"
                aria-label="Выйти"
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.05] hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-7 sm:py-10 lg:px-10 lg:py-12">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-mint-400">
              <Github className="h-3.5 w-3.5" />
              Developer console
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Добрый день, {displayName.split(" ")[0]}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Управляйте ключами, балансом и расходом моделей.
            </p>
          </div>
          <Link
            href="/#pricing"
            className="inline-flex items-center gap-2 self-start rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs text-slate-400 transition hover:text-white sm:self-auto"
          >
            Модели и тарифы
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_.85fr_1fr]">
          <BalanceCard
            balance={Number(profile.balance_kzt)}
            totalSpent={Number(metrics.total_spent_kzt)}
            spentThisMonth={Number(metrics.month_spent_kzt)}
            pendingTopups={Number(metrics.pending_topups)}
          />

          <div className="panel-border rounded-2xl p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Activity className="h-4 w-4 text-sky-300" />
              Использование
            </div>
            <p className="mt-5 text-3xl font-semibold tracking-tight text-white">
              {Number(metrics.total_requests).toLocaleString("ru-KZ")}
            </p>
            <p className="mt-2 text-xs text-slate-500">API-запросов всего</p>
            <div className="mt-6 space-y-4 border-t border-white/[0.07] pt-5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Токенов</span>
                <span className="font-mono text-xs text-slate-200">
                  {Number(metrics.total_tokens).toLocaleString("ru-KZ")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Моделей доступно</span>
                <span className="font-mono text-xs text-mint-400">
                  {PUBLIC_MODELS.length}
                </span>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-mint-400/15 bg-[radial-gradient(circle_at_90%_0%,rgba(77,226,178,.13),transparent_58%),#0b121b] p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <ShieldCheck className="h-4 w-4 text-mint-400" />
              Data Shield
            </div>
            <p className="mt-5 text-3xl font-semibold tracking-tight text-white">
              {Number(metrics.masked_total).toLocaleString("ru-KZ")}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              персональных данных замаскировано
            </p>
            <div className="mt-6 flex flex-wrap gap-1.5 border-t border-white/[0.07] pt-5">
              {[
                ["ИИН", metrics.masked_iin],
                ["Тел.", metrics.masked_phone],
                ["Карты", metrics.masked_card]
              ].map(([label, value]) => (
                <span
                  key={String(label)}
                  className="rounded-md bg-white/[0.045] px-2 py-1 text-[10px] text-slate-500"
                >
                  {label}: {String(value)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
          <ApiKeysCard keys={keys} />
          <div id="quickstart">
            <QuickstartCard endpoint={endpoint} />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
          <section className="panel-border overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4 sm:px-6">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-medium text-white">
                  <Activity className="h-4 w-4 text-sky-300" />
                  Последние запросы
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Детализация списаний по фактическим токенам
                </p>
              </div>
              <span className="font-mono text-[10px] text-slate-600">
                LAST 20
              </span>
            </div>

            {usageLogs.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.025] text-slate-600">
                  <Cpu className="h-5 w-5" />
                </span>
                <p className="mt-4 text-sm text-slate-300">
                  Запросов пока не было
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  История появится после первого вызова API.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[9px] uppercase tracking-wider text-slate-600">
                      <th className="px-5 py-3 font-medium sm:px-6">Запрос</th>
                      <th className="px-3 py-3 font-medium">Модель</th>
                      <th className="px-3 py-3 text-right font-medium">Токены</th>
                      <th className="px-3 py-3 text-right font-medium">PII</th>
                      <th className="px-5 py-3 text-right font-medium sm:px-6">
                        Стоимость
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {usageLogs.map((log) => {
                      const maskedCount = Number(
                        log.masked_total ||
                          getMaskedValue(log.masked_entities, "iin") +
                            getMaskedValue(log.masked_entities, "phone") +
                            getMaskedValue(log.masked_entities, "card")
                      );

                      return (
                        <tr
                          key={log.id}
                          className="text-xs transition hover:bg-white/[0.015]"
                        >
                          <td className="px-5 py-4 sm:px-6">
                            <p className="font-mono text-[10px] text-slate-300">
                              {log.request_id.slice(0, 8)}
                            </p>
                            <p className="mt-1 text-[9px] text-slate-600">
                              {formatDate(log.created_at)}
                            </p>
                          </td>
                          <td className="px-3 py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[9px] ${
                                log.model === "kz-gemini"
                                  ? "bg-violet-400/[0.08] text-violet-300"
                                  : "bg-sky-400/[0.08] text-sky-300"
                              }`}
                            >
                              {log.model === "kz-gemini" ? (
                                <Sparkles className="h-3 w-3" />
                              ) : (
                                <Braces className="h-3 w-3" />
                              )}
                              {log.model}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-right font-mono text-[10px] text-slate-400">
                            {log.total_tokens.toLocaleString("ru-KZ")}
                          </td>
                          <td className="px-3 py-4 text-right">
                            <span
                              title={`${log.pii_engine}; ${log.pii_policy_version}; risk ${Number(log.pii_risk).toFixed(2)}`}
                              className={
                                maskedCount > 0
                                  ? "text-mint-400"
                                  : "text-slate-600"
                              }
                            >
                              {maskedCount > 0 ? `−${maskedCount}` : "—"}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-[10px] text-slate-200 sm:px-6">
                            {formatKzt(Number(log.cost_kzt), 4)} ₸
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel-border rounded-2xl p-5 sm:p-6">
            <h2 className="text-sm font-medium text-white">Доступные модели</h2>
            <p className="mt-1 text-xs text-slate-500">
              Цена за 1 млн токенов
            </p>
            <div className="mt-5 space-y-3">
              {Object.values(MODEL_CATALOG).map((model) => (
                <div
                  key={model.publicName}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[11px] text-slate-200">
                      {model.publicName}
                    </p>
                    <span className="rounded bg-mint-400/[0.08] px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-mint-400">
                      online
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] text-slate-600">
                    <div>
                      <p>Вход</p>
                      <p className="mt-1 font-mono text-sm text-slate-200">
                        {model.inputPricePerMillionKzt} ₸
                      </p>
                    </div>
                    <div>
                      <p>Выход</p>
                      <p className="mt-1 font-mono text-sm text-slate-200">
                        {model.outputPricePerMillionKzt} ₸
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="mt-10 flex flex-col gap-3 border-t border-white/[0.06] pt-6 text-[10px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>QazRouter · Serverless AI infrastructure</span>
          <span>
            Комплаенс требует отдельного аудита ·{" "}
            <Link href="/#compliance" className="text-slate-500 hover:text-white">
              Подробнее
            </Link>
          </span>
        </footer>
      </div>
    </main>
  );
}
