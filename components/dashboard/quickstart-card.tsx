"use client";

import { Check, Copy, TerminalSquare } from "lucide-react";
import { useState } from "react";

export function QuickstartCard({ endpoint }: { endpoint: string }) {
  const [copied, setCopied] = useState(false);
  const snippet = `curl ${endpoint}/api/v1/chat/completions \\
  -H "Authorization: Bearer kz_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"model":"kz-deepseek","messages":[
    {"role":"user","content":"Привет!"}
  ]}'`;

  async function copyCode() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }

  return (
    <section className="panel-border overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4 sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-white">
            <TerminalSquare className="h-4 w-4 text-mint-400" />
            Быстрый старт
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            OpenAI-compatible endpoint
          </p>
        </div>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.035] px-2.5 py-2 text-[11px] text-slate-400 transition hover:text-white"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-mint-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <pre className="overflow-x-auto bg-black/20 p-5 font-mono text-[10px] leading-5 text-slate-400 sm:text-[11px]">
        <code>{snippet}</code>
      </pre>
    </section>
  );
}
