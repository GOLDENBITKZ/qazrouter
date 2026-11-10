"use client";

import { useEffect, useState, useTransition } from "react";
import { Cpu, Loader2, ShieldCheck } from "lucide-react";
import { vastAction } from "@/app/dashboard/vast-actions";
import { VAST_MODELS, type DeploymentView, type OfferQuote, type VastModel } from "@/lib/vast/catalog";

const STATES: Record<string, string> = {
  creating: "Заказываем GPU", starting: "Загрузка модели", ready: "Модель готова",
  unknown: "Уточняем результат заказа", deleting: "Освобождаем GPU",
  terminated: "GPU освобождён", failed: "Заказ отклонён",
  expired: "Срок аренды истёк; освобождаем GPU"
};

export function VastModelsCard({ enabled, configured, initial, setupError }: {
  enabled: boolean;
  configured: boolean;
  initial: DeploymentView | null;
  setupError?: string;
}) {
  const [model, setModel] = useState<VastModel>(initial?.model || "kz-vast-qwen");
  const [quote, setQuote] = useState<OfferQuote | null>(null);
  const [deployment, setDeployment] = useState(initial);
  const [error, setError] = useState(setupError || "");
  const [pending, startTransition] = useTransition();
  const live = deployment && !["terminated", "failed"].includes(deployment.state);

  function run(action: "quote" | "deploy" | "refresh" | "destroy") {
    setError("");
    startTransition(async () => {
      try {
        const result = await vastAction(action, action === "quote" ? model : quote?.token || "");
        if (result.error) {
          setError(result.error);
          if (action === "deploy") setQuote(null);
        }
        if (result.quote) setQuote(result.quote);
        if ("deployment" in result) { setDeployment(result.deployment || null); setQuote(null); }
        // A create timeout still owns a durable reservation. Reload it before allowing another order.
        if (result.error && action === "deploy") {
          const status = await vastAction("refresh");
          if ("deployment" in status) setDeployment(status.deployment || null);
        }
      } catch { setError("Нет соединения с сервером. Обновите статус перед повторным заказом."); }
    });
  }

  useEffect(() => {
    if (!live || pending) return;
    const timer = setTimeout(() => {
      if (document.visibilityState === "visible") run("refresh");
      else setDeployment(current => current ? { ...current } : null);
    }, 15_000);
    return () => clearTimeout(timer);
    // The live row changes after every completed check. One request at a time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployment, pending]);

  const button = "rounded-lg bg-mint-400 px-4 py-2.5 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <section className="panel-border mt-4 rounded-2xl p-5 sm:p-6" id="vast-models">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-white"><Cpu className="h-4 w-4 text-mint-400" /> Своя модель на Vast.ai</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">Выберите модель, сравните стоимость GPU и запустите её из кабинета. Заказ — сразу, загрузка весов — обычно несколько минут.</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-lg bg-mint-400/10 px-2 py-1 text-[10px] text-mint-400"><ShieldCheck className="h-3 w-3" /> Локальная PII-защита</span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Модель для развёртывания">
        {(Object.entries(VAST_MODELS) as Array<[VastModel, typeof VAST_MODELS[VastModel]]>).map(([id, spec]) => (
          <button key={id} type="button" role="radio" aria-checked={model === id}
            disabled={Boolean(live) || pending} onClick={() => { setModel(id); setQuote(null); setError(""); }}
            className={`rounded-xl border p-4 text-left transition disabled:cursor-not-allowed ${model === id ? "border-mint-400/50 bg-mint-400/[0.06]" : "border-white/10 bg-white/[0.02]"}`}>
            <p className="text-sm font-medium text-slate-200">{spec.label}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{spec.description}</p>
            <p className="mt-3 text-[10px] text-slate-400">{spec.inputPricePerMillionKzt} ₸ вход / {spec.outputPricePerMillionKzt} ₸ выход за 1 млн токенов</p>
            <p className="mt-1 text-[10px] text-slate-400">Контекст 8K токенов вместе с ответом</p>
            <p className="mt-1 font-mono text-[9px] text-slate-600">{spec.huggingFaceId}</p>
          </button>
        ))}
      </div>

      {!configured && <p className="mt-4 text-xs text-amber-300">Владелец должен подключить Vast.ai и образ vLLM. Запуск пока недоступен.</p>}
      {configured && !enabled && !live && <p className="mt-4 text-xs text-amber-300">Владелец QazRouter должен открыть вашему аккаунту доступ к аренде GPU.</p>}
      {error && <p role="alert" className="mt-4 text-xs leading-5 text-rose-300">{error}</p>}

      {live ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.025] p-4" aria-live="polite">
          <p className="text-sm text-white">{STATES[deployment.state] || deployment.state} · {deployment.gpuName}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">${deployment.hourlyUsd.toFixed(4)}/час · освобождение после {new Date(deployment.expiresAt).toLocaleString("ru-KZ", { timeZone: "Asia/Qyzylorda" })} (Кызылорда)</p>
          {deployment.state === "ready" && <p className="mt-3 text-xs text-mint-400">Вызывайте API с <code className="font-mono">"model": "{deployment.model}"</code>. Доступ имеет только ваш аккаунт.</p>}
          {deployment.state === "unknown" && <p className="mt-3 text-xs text-amber-300">Повторный заказ заблокирован до сверки с Vast.ai. Аренда могла начаться.</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={pending} onClick={() => run("refresh")} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-300 disabled:opacity-40">Обновить статус</button>
            <button type="button" disabled={pending} onClick={() => run("destroy")} className="rounded-lg border border-rose-400/30 px-3 py-2 text-xs text-rose-300 disabled:opacity-40">Освободить GPU и удалить веса</button>
          </div>
        </div>
      ) : quote ? (
        <div className="mt-5 rounded-xl border border-mint-400/20 bg-mint-400/[0.03] p-4">
          <p className="text-sm text-white">{quote.gpuName} · {quote.location}</p>
          <p className="mt-2 text-xs text-slate-300">${quote.hourlyUsd.toFixed(4)}/час · сеанс {quote.durationMinutes} мин · около ${(quote.hourlyUsd * quote.durationMinutes / 60).toFixed(3)} за GPU</p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">Аренда списывается с аккаунта Vast.ai, включая время загрузки и простоя. Трафик оплачивается отдельно. API-токены списываются с баланса QazRouter по тарифу выше. Предложение действует 5 минут.</p>
          <button type="button" disabled={pending} onClick={() => run("deploy")} className={`${button} mt-4`}>Подтвердить цену и развернуть</button>
        </div>
      ) : (
        <button type="button" disabled={!enabled || !configured || pending || Boolean(setupError)} onClick={() => run("quote")} className={`${button} mt-5`}>Подобрать дешёвый GPU</button>
      )}
      {pending && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Выполняем запрос…</p>}
      <p className="mt-4 max-w-3xl text-[10px] leading-5 text-slate-500">Небольшие модели имеют отдельные алиасы и пилотные тарифы. Качество отличается от крупных Qwen/Llama. Персональные данные маскируются до отправки на GPU; при недоступном сканере запрос блокируется. Косвенные идентификаторы требуют дополнительной оценки.</p>
    </section>
  );
}
