import {
  ArrowRight,
  Braces,
  Check,
  ChevronRight,
  CircleDollarSign,
  DatabaseZap,
  FileCheck2,
  Fingerprint,
  Github,
  KeyRound,
  LockKeyhole,
  Route,
  ServerCog,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  WalletCards
} from "lucide-react";
import Link from "next/link";

import { BrandMark, StatusDot } from "@/components/brand-mark";
import { MODEL_CATALOG } from "@/lib/billing/pricing";

const apiExample = `curl https://your-domain.kz/api/v1/chat/completions \\
  -H "Authorization: Bearer kz_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "kz-deepseek",
    "messages": [
      {"role": "user", "content": "Проверь договор"}
    ]
  }'`;

const features = [
  {
    icon: Fingerprint,
    eyebrow: "DATA SHIELD",
    title: "PII не уходит провайдеру",
    text: "ИИН, телефоны, карты, ФИО и адреса заменяются локальным DLP-шлюзом до вызова любой модели."
  },
  {
    icon: Route,
    eyebrow: "SMART ROUTING",
    title: "Один API — шесть моделей",
    text: "DeepSeek, Gemini, GPT, Claude, Qwen и Llama маршрутизируются через единый LiteLLM-контур."
  },
  {
    icon: WalletCards,
    eyebrow: "KZT BILLING",
    title: "Тенге без валютных сюрпризов",
    text: "Баланс, тарифы и история списаний в KZT. Стоимость считается по фактическим токенам."
  },
  {
    icon: FileCheck2,
    eyebrow: "BUSINESS READY",
    title: "Документы для бухгалтерии",
    text: "Заявки на пополнение и журналирование операций создают основу для закрывающих документов."
  }
];

const complianceSteps = [
  {
    number: "01",
    title: "Локальный шлюз",
    text: "Сырой запрос обрабатывается в контуре компании или на сервере в Казахстане."
  },
  {
    number: "02",
    title: "Маскирование PII",
    text: "Regex-фильтр удаляет идентификаторы до выхода пакета в интернет."
  },
  {
    number: "03",
    title: "Frontier model",
    text: "Очищенный контекст уходит в глобальный API без персональных идентификаторов."
  },
  {
    number: "04",
    title: "Аудит и биллинг",
    text: "В KZ-базе остаются метаданные, количество скрытых сущностей и стоимость в тенге."
  }
];

function ModelGlyph({
  model
}: {
  model: (typeof MODEL_CATALOG)[keyof typeof MODEL_CATALOG]["provider"];
}) {
  if (model === "deepseek" || model === "groq") {
    return (
      <span className="grid h-11 w-11 place-items-center rounded-2xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
        <Braces className="h-5 w-5" strokeWidth={1.7} />
      </span>
    );
  }

  if (model === "anthropic") {
    return (
      <span className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-amber-200">
        <Sparkles className="h-5 w-5" strokeWidth={1.7} />
      </span>
    );
  }

  return (
    <span className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-400/20 bg-violet-400/10 text-violet-300">
      <Sparkles className="h-5 w-5" strokeWidth={1.7} />
    </span>
  );
}

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ authError?: string }>;
}) {
  const { authError } = await searchParams;
  const apiConfigured = Boolean(
    process.env.LITELLM_BASE_URL && process.env.PII_SCANNER_URL
  );

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[54rem] grid-lines mask-fade" />
      <div className="pointer-events-none absolute left-1/2 top-[-26rem] h-[54rem] w-[54rem] -translate-x-1/2 rounded-full border border-mint-400/10 bg-mint-400/[0.025] shadow-glow" />

      <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <BrandMark />
        <nav className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
          <a className="transition-colors hover:text-white" href="#capabilities">
            Возможности
          </a>
          <a className="transition-colors hover:text-white" href="#pricing">
            Тарифы
          </a>
          <a className="transition-colors hover:text-white" href="#compliance">
            Комплаенс
          </a>
          <a className="transition-colors hover:text-white" href="#api">
            API
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-slate-400 sm:flex">
            <StatusDot />
            {apiConfigured ? "API online" : "MVP preview"}
          </span>
          <Link
            href="/api/auth/github"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/[0.1]"
          >
            <Github className="h-4 w-4" />
            Войти
          </Link>
        </div>
      </header>

      {authError && (
        <div className="relative z-20 mx-auto mt-2 max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            Не удалось войти через GitHub. Проверьте настройки OAuth в Supabase и
            повторите попытку.
          </div>
        </div>
      )}

      <section className="relative z-10 mx-auto grid max-w-7xl gap-14 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:px-10 lg:pb-32 lg:pt-24">
        <div className="animate-fade-up">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-mint-400/20 bg-mint-400/[0.06] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-mint-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            AI infrastructure · Kazakhstan
          </div>
          <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
            Мировой ИИ для бизнеса в{" "}
            <span className="bg-gradient-to-r from-mint-400 via-emerald-200 to-white bg-clip-text text-transparent">
              Казахстане
            </span>
            .
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-400">
            Оплата в тенге, закрывающие документы для бухгалтерии,{" "}
            <span className="font-medium text-slate-200">
              100% комплаенс с МЦРИАП
            </span>{" "}
            по архитектуре обработки данных.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/api/auth/github"
              className="group inline-flex items-center justify-center gap-3 rounded-xl bg-mint-400 px-6 py-3.5 text-sm font-semibold text-ink-950 shadow-[0_12px_40px_rgba(77,226,178,.18)] transition hover:-translate-y-0.5 hover:bg-[#65efc2]"
            >
              <Github className="h-4 w-4" />
              Войти через GitHub
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#pricing"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-6 py-3.5 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              Посмотреть тарифы
            </a>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-xs text-slate-500">
            {[
              "OpenAI-compatible",
              "Без VPN",
              "Без карты в USD",
              "Данные маскируются"
            ].map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-mint-400" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative animate-fade-up lg:pl-8 [animation-delay:120ms]">
          <div className="absolute -inset-8 rounded-full bg-mint-400/10 blur-3xl" />
          <div className="relative overflow-hidden rounded-[28px] border border-white/[0.1] bg-[#0a111b]/90 p-2.5 shadow-panel backdrop-blur-xl">
            <div className="rounded-[20px] border border-white/[0.07] bg-[#080e17]">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-mint-400/70" />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
                  live request trace
                </span>
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Баланс</p>
                    <p className="mt-1 text-2xl font-semibold text-white">
                      125 000,00 ₸
                    </p>
                  </div>
                  <span className="rounded-full border border-mint-400/20 bg-mint-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-mint-400">
                    active
                  </span>
                </div>

                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs text-slate-300">
                      <LockKeyhole className="h-3.5 w-3.5 text-mint-400" />
                      Защита запроса
                    </span>
                    <span className="font-mono text-[10px] text-mint-400">
                      3 PII masked
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5 font-mono text-[11px] leading-5 text-slate-400">
                      ИИН:{" "}
                      <span className="text-mint-400">
                        [ИИН СКРЫТ ПО ЗАКОНУ РК]
                      </span>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5 font-mono text-[11px] leading-5 text-slate-400">
                      Phone:{" "}
                      <span className="text-mint-400">
                        [ТЕЛЕФОН СКРЫТ ПО ЗАКОНУ РК]
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
                    <p className="text-[10px] uppercase tracking-wider text-slate-600">
                      Model
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-slate-200">
                      kz-deepseek
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
                    <p className="text-[10px] uppercase tracking-wider text-slate-600">
                      Latency
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-slate-200">
                      814 ms
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-mint-400/15 bg-mint-400/[0.055] p-3.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-mint-400/10">
                    <CircleDollarSign className="h-4 w-4 text-mint-400" />
                  </span>
                  <div>
                    <p className="text-[11px] text-slate-400">Списано за запрос</p>
                    <p className="text-sm font-semibold text-white">
                      0,0427 ₸
                    </p>
                  </div>
                  <span className="ml-auto font-mono text-[10px] text-slate-500">
                    1 205 tok
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 border-y border-white/[0.06] bg-white/[0.018]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-white/[0.06] px-5 sm:px-8 lg:grid-cols-4 lg:px-10">
          {[
            ["6 моделей", "frontier-класса"],
            ["₸ KZT", "прозрачный биллинг"],
            ["< 1 сек", "оверлей фильтра"],
            ["1 API", "OpenAI-compatible"]
          ].map(([value, label]) => (
            <div key={value} className="px-5 py-7 text-center sm:px-8">
              <p className="text-lg font-semibold tracking-tight text-white">
                {value}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-slate-600">
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <section
        id="capabilities"
        className="relative z-10 mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10 lg:py-32"
      >
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-mint-400">
            Инфраструктура
          </span>
          <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">
            Всё, что отделяет бизнес от хаоса интеграций.
          </h2>
          <p className="mt-5 text-base leading-7 text-slate-400">
            Один контракт, один формат API и один понятный счёт в тенге — вместо
            десятка зарубежных подписок.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="group panel-border relative overflow-hidden rounded-2xl p-6 transition hover:border-white/[0.16] sm:p-7"
            >
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-mint-400/0 blur-2xl transition group-hover:bg-mint-400/[0.06]" />
              <div className="mb-8 flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-mint-400">
                  <feature.icon className="h-5 w-5" strokeWidth={1.6} />
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-600">
                  {feature.eyebrow}
                </span>
              </div>
              <h3 className="text-xl font-medium tracking-tight text-white">
                {feature.title}
              </h3>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
                {feature.text}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="pricing"
        className="relative z-10 border-y border-white/[0.06] bg-[#080d15]/70 py-24 lg:py-32"
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-mint-400">
                Тарифы
              </span>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">
                Платите за токены.
                <br />
                <span className="text-slate-500">Не за валюту.</span>
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-slate-500">
              Цены указаны в тенге за миллион токенов. Фактическое списание
              рассчитывается по usage от провайдера.
            </p>
          </div>

          <div className="mt-12 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0a111b]">
            <div className="grid grid-cols-[1.4fr_repeat(3,.7fr)] gap-4 border-b border-white/[0.07] px-5 py-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600 sm:px-7">
              <span>Модель</span>
              <span className="text-right">Вход / 1M</span>
              <span className="text-right">Выход / 1M</span>
              <span className="hidden text-right sm:block">Контекст</span>
            </div>
            {Object.values(MODEL_CATALOG).map((model, index) => (
              <div
                key={model.publicName}
                className={`grid grid-cols-[1.4fr_repeat(3,.7fr)] items-center gap-4 px-5 py-6 sm:px-7 ${
                  index === 0 ? "border-b border-white/[0.07]" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <ModelGlyph model={model.provider} />
                  <div>
                    <p className="font-mono text-sm font-medium text-white">
                      {model.publicName}
                    </p>
                    <p className="mt-1 hidden text-xs text-slate-500 sm:block">
                      {model.description}
                    </p>
                  </div>
                </div>
                <p className="text-right text-sm font-medium text-white">
                  {model.inputPricePerMillionKzt} ₸
                </p>
                <p className="text-right text-sm font-medium text-white">
                  {model.outputPricePerMillionKzt} ₸
                </p>
                <p className="hidden text-right text-sm text-slate-500 sm:block">
                  128K+
                </p>
              </div>
            ))}
            <div className="flex flex-col gap-3 border-t border-white/[0.07] bg-white/[0.02] px-5 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <span>Пополнение от 5 000 ₸. Комиссия сервиса уже включена.</span>
              <Link
                href="/api/auth/github"
                className="inline-flex items-center gap-1.5 font-medium text-mint-400 hover:text-white"
              >
                Начать работу
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        id="compliance"
        className="relative z-10 mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10 lg:py-32"
      >
        <div className="grid gap-14 lg:grid-cols-[.85fr_1.15fr] lg:items-start">
          <div className="lg:sticky lg:top-10">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-mint-400">
              Privacy by design
            </span>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">
              Персональные данные остаются невидимыми для модели.
            </h2>
            <p className="mt-6 text-sm leading-7 text-slate-400">
              Фильтр работает до маршрутизации. Провайдер получает смысл
              запроса, но не ИИН, телефон или номер карты.
            </p>
            <div className="mt-8 rounded-2xl border border-amber-300/15 bg-amber-300/[0.045] p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-200">
                <DatabaseZap className="h-4 w-4" />
                Требование резидентности
              </div>
              <p className="mt-2 text-xs leading-5 text-amber-100/60">
                Supabase Cloud не размещает проект в Казахстане. Для строгого
                хранения в РК используйте self-hosted Supabase и серверный шлюз
                на территории Казахстана. Vercel подходит для MVP, но получает
                исходный запрос до маскирования.
              </p>
            </div>
          </div>

          <div className="relative">
            <div className="absolute bottom-8 left-[21px] top-8 w-px bg-gradient-to-b from-mint-400/60 via-white/10 to-transparent" />
            <div className="space-y-3">
              {complianceSteps.map((step) => (
                <div
                  key={step.number}
                  className="relative grid grid-cols-[44px_1fr] gap-4"
                >
                  <span className="relative z-10 grid h-[44px] w-[44px] place-items-center rounded-full border border-mint-400/20 bg-[#0b1519] font-mono text-[10px] text-mint-400">
                    {step.number}
                  </span>
                  <div className="panel-border rounded-2xl p-5 sm:p-6">
                    <h3 className="font-medium text-white">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {step.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="api"
        className="relative z-10 border-y border-white/[0.06] bg-[#080d15]/70 py-24"
      >
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:items-center lg:px-10">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-mint-400">
              Developer first
            </span>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">
              Один запрос до замены.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-slate-400">
              Используйте привычный OpenAI SDK. Для перехода измените baseURL,
              API-ключ и название модели.
            </p>
            <div className="mt-8 space-y-4">
              {[
                {
                  icon: KeyRound,
                  text: "Bearer-ключ создаётся в кабинете и показывается один раз"
                },
                {
                  icon: ServerCog,
                  text: "Серверные функции работают на Node.js без отдельного бэкенда"
                },
                {
                  icon: TerminalSquare,
                  text: "Стандартный ответ chat.completion с usage"
                }
              ].map((item) => (
                <div
                  key={item.text}
                  className="flex items-center gap-3 text-sm text-slate-400"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-mint-400">
                    <item.icon className="h-4 w-4" />
                  </span>
                  {item.text}
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#060a10] shadow-panel">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-mint-400/60" />
              </div>
              <span className="font-mono text-[10px] text-slate-600">
                POST /api/v1/chat/completions
              </span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[11px] leading-6 text-slate-400 sm:p-7 sm:text-xs">
              <code>{apiExample}</code>
            </pre>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10">
        <div className="relative overflow-hidden rounded-[28px] border border-mint-400/15 bg-[radial-gradient(circle_at_80%_20%,rgba(77,226,178,.14),transparent_40%),linear-gradient(130deg,#0d1a1d,#090f18)] px-6 py-14 text-center sm:px-12 lg:py-20">
          <div className="absolute inset-0 grid-lines opacity-40" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-mint-400">
              Build without borders
            </p>
            <h2 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
              Подключите передовые модели за несколько минут.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-slate-400">
              Создайте API-ключ, пополните баланс в тенге и отправьте первый
              запрос через OpenAI-compatible endpoint.
            </p>
            <Link
              href="/api/auth/github"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-mint-400 px-6 py-3.5 text-sm font-semibold text-ink-950 transition hover:bg-[#65efc2]"
            >
              <Github className="h-4 w-4" />
              Войти через GitHub
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 text-xs text-slate-600 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <BrandMark />
          <p className="max-w-2xl leading-5">
            Технический комплаенс не является государственной сертификацией.
            Перед production-запуском проведите юридическую оценку и аудит
            инфраструктуры. Supabase Cloud не гарантирует хранение данных в РК.
          </p>
          <span>© {new Date().getFullYear()} QazRouter</span>
        </div>
      </footer>
    </main>
  );
}
