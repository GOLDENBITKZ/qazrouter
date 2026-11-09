"use client";

import {
  Check,
  Clipboard,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import {
  createApiKeyAction,
  revokeApiKeyAction,
  type CreateKeyState
} from "@/app/dashboard/actions";
import { Modal } from "@/components/ui/modal";

const initialState: CreateKeyState = { status: "idle" };

export interface ApiKeyListItem {
  id: string;
  name: string;
  key_prefix: string;
  key_last_four: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Не использовался";
  }

  return new Intl.DateTimeFormat("ru-KZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function ApiKeysCard({ keys }: { keys: ApiKeyListItem[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [state, formAction, pending] = useActionState(
    createApiKeyAction,
    initialState
  );

  useEffect(() => {
    if (state.status === "success" && state.secret) {
      setSecret(state.secret);
      setCopied(false);
    }
  }, [state.secret, state.status]);

  function closeCreateModal() {
    setCreateOpen(false);
    // Секрет существует только в памяти этой вкладки и показывается один раз.
    setSecret(null);
    setCopied(false);
  }

  async function copySecret() {
    if (!secret) {
      return;
    }

    await navigator.clipboard.writeText(secret);
    setCopied(true);
  }

  return (
    <section className="panel-border rounded-2xl">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4 sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-white">
            <KeyRound className="h-4 w-4 text-mint-400" />
            API-ключи
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Ключ показывается один раз, в базе хранится только его хеш.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-mint-400/30 hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Создать ключ</span>
          <span className="sm:hidden">Создать</span>
        </button>
      </div>

      {keys.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.025] text-slate-600">
            <KeyRound className="h-5 w-5" />
          </span>
          <p className="mt-4 text-sm font-medium text-slate-300">
            У вас пока нет API-ключей
          </p>
          <p className="mt-1.5 text-xs text-slate-600">
            Создайте первый ключ для отправки запросов.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex flex-col gap-3 px-5 py-4 transition hover:bg-white/[0.015] sm:flex-row sm:items-center sm:px-6"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-slate-200">
                    {key.name}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                      key.is_active
                        ? "bg-mint-400/10 text-mint-400"
                        : "bg-white/[0.04] text-slate-600"
                    }`}
                  >
                    {key.is_active ? "active" : "revoked"}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <code className="font-mono text-[11px] text-slate-400">
                    {key.key_prefix}...{key.key_last_four}
                  </code>
                  <span className="text-[10px] text-slate-600">
                    {formatDate(key.last_used_at)}
                  </span>
                </div>
              </div>

              {key.is_active && (
                <form action={revokeApiKeyAction}>
                  <input type="hidden" name="keyId" value={key.id} />
                  <button
                    type="submit"
                    onClick={(event) => {
                      if (
                        !window.confirm(
                          `Отключить ключ «${key.name}»? Это действие нельзя отменить.`
                        )
                      ) {
                        event.preventDefault();
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] text-slate-500 transition hover:bg-red-400/[0.07] hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Отключить
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={closeCreateModal}
        title={secret ? "Ключ создан" : "Создать API-ключ"}
        description={
          secret
            ? "Скопируйте секрет сейчас. После закрытия окна восстановить его будет невозможно."
            : "Дайте ключу понятное имя — например, production или staging."
        }
      >
        {secret ? (
          <div>
            <div className="rounded-xl border border-mint-400/20 bg-mint-400/[0.05] p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-mint-400">
                <ShieldAlert className="h-4 w-4" />
                Показывается только один раз
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/[0.08] bg-black/30 p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-slate-200">
                  {secret}
                </code>
                <button
                  type="button"
                  onClick={copySecret}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/[0.05] text-slate-400 hover:text-white"
                  aria-label="Скопировать ключ"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-mint-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={closeCreateModal}
              className="mt-5 w-full rounded-xl bg-mint-400 px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-[#65efc2]"
            >
              Я сохранил ключ
            </button>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs text-slate-400">
                Название ключа
              </span>
              <input
                name="name"
                required
                maxLength={60}
                placeholder="Production"
                className="w-full rounded-xl border border-white/[0.1] bg-black/20 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-mint-400/50"
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
                <Clipboard className="h-4 w-4" />
              )}
              {pending ? "Создаём..." : "Создать ключ"}
            </button>
          </form>
        )}
      </Modal>
    </section>
  );
}
