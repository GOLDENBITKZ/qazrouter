"use client";

import {
  ArrowUpRight,
  Check,
  Clock3,
  Loader2,
  QrCode,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import { useActionState, useState } from "react";

import {
  createTopupRequestAction,
  type TopupState
} from "@/app/dashboard/actions";
import { Modal } from "@/components/ui/modal";
import { formatKzt } from "@/lib/billing/pricing";

const initialState: TopupState = { status: "idle" };

export function BalanceCard({
  balance,
  totalSpent,
  spentThisMonth,
  pendingTopups
}: {
  balance: number;
  totalSpent: number;
  spentThisMonth: number;
  pendingTopups: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createTopupRequestAction,
    initialState
  );

  return (
    <>
      <section className="panel-border relative overflow-hidden rounded-2xl p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-mint-400/[0.08] blur-3xl" />
        <div className="relative">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <WalletCards className="h-4 w-4 text-mint-400" />
              Баланс
            </div>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] text-slate-500">
              KZT
            </span>
          </div>
          <p className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
            {formatKzt(balance)}{" "}
            <span className="text-mint-400">₸</span>
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Доступно для API-запросов
          </p>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-mint-400 px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-[#65efc2]"
          >
            Пополнить баланс
            <ArrowUpRight className="h-4 w-4" />
          </button>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-5">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-600">
                За месяц
              </p>
              <p className="mt-1.5 text-sm font-medium text-slate-200">
                {formatKzt(spentThisMonth, 4)} ₸
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-600">
                Всего
              </p>
              <p className="mt-1.5 text-sm font-medium text-slate-200">
                {formatKzt(totalSpent, 4)} ₸
              </p>
            </div>
          </div>

          {pendingTopups > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.045] px-3 py-2 text-[11px] text-amber-200/80">
              <Clock3 className="h-3.5 w-3.5" />
              На проверке: {pendingTopups}
            </div>
          )}
        </div>
      </section>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Пополнить баланс"
        description="Переведите сумму на Kaspi ТОО/ИП и вставьте номер транзакции. Зачисление выполняется после ручной сверки."
      >
        <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
          <div className="relative grid min-h-36 place-items-center overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.035]">
            <div className="absolute inset-0 grid-lines opacity-30" />
            <div className="relative text-center">
              <QrCode className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-500">
                Kaspi QR
              </p>
              <p className="mt-1 text-[9px] text-slate-600">место для QR</p>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 text-xs leading-6 text-slate-400">
            <p className="font-medium text-slate-200">Реквизиты получателя</p>
            <p className="mt-2">ТОО «QazRouter»</p>
            <p>Kaspi: +7 (700) 000-00-00</p>
            <p className="mt-2 text-[10px] leading-5 text-slate-600">
              Замените реквизиты в компоненте перед production-запуском.
            </p>
          </div>
        </div>

        {state.status === "success" ? (
          <div className="mt-5 rounded-xl border border-mint-400/20 bg-mint-400/[0.07] p-5 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-mint-400/15 text-mint-400">
              <Check className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-medium text-white">
              Заявка отправлена
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              {state.message}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 rounded-lg border border-white/10 px-4 py-2 text-xs text-slate-200 hover:bg-white/[0.04]"
            >
              Закрыть
            </button>
          </div>
        ) : (
          <form action={formAction} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs text-slate-400">
                Сумма, ₸
              </span>
              <input
                name="amount"
                inputMode="decimal"
                required
                min="5000"
                max="1000000"
                step="0.01"
                placeholder="25 000"
                className="w-full rounded-xl border border-white/[0.1] bg-black/20 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-mint-400/50"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-slate-400">
                Номер Kaspi-транзакции
              </span>
              <input
                name="transactionId"
                required
                minLength={6}
                maxLength={100}
                placeholder="Например, 127398465"
                className="w-full rounded-xl border border-white/[0.1] bg-black/20 px-3.5 py-3 font-mono text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-mint-400/50"
              />
            </label>

            {state.status === "error" && (
              <p className="rounded-lg border border-red-400/20 bg-red-400/[0.07] px-3 py-2.5 text-xs text-red-200">
                {state.message}
              </p>
            )}

            <button
              disabled={pending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-mint-400 px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-[#65efc2] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {pending ? "Отправляем..." : "Отправить на проверку"}
            </button>
          </form>
        )}
      </Modal>
    </>
  );
}
