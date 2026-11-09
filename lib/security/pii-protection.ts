import type { ChatMessage } from "../providers/types";
import { maskChatMessages } from "./mask-messages";

export interface PiiCounts {
  iin: number;
  phone: number;
  card: number;
  email: number;
  person: number;
  address: number;
  account: number;
  passport: number;
  other: number;
}

export interface RedactionReplacement {
  token: string;
  original: string;
}

export interface ProtectedMessages {
  messages: ChatMessage[];
  extras: Record<string, unknown>;
  counts: PiiCounts;
  maskedTotal: number;
  engine: string;
  policyVersion: string;
  riskScore: number;
  replacements: RedactionReplacement[];
}

export class PiiProtectionError extends Error {
  constructor(
    message: string,
    public readonly code: "scanner_unavailable" | "scanner_invalid_response"
  ) {
    super(message);
    this.name = "PiiProtectionError";
  }
}

const EMPTY_COUNTS: PiiCounts = {
  iin: 0,
  phone: 0,
  card: 0,
  email: 0,
  person: 0,
  address: 0,
  account: 0,
  passport: 0,
  other: 0
};

function normalizeCounts(value: unknown): PiiCounts {
  if (!value || typeof value !== "object") {
    throw new PiiProtectionError(
      "PII scanner вернул некорректные счётчики.",
      "scanner_invalid_response"
    );
  }

  const counts = { ...EMPTY_COUNTS };

  for (const key of Object.keys(counts) as Array<keyof PiiCounts>) {
    const count = Number((value as Record<string, unknown>)[key] || 0);
    counts[key] = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
  }

  return counts;
}

function normalizeReplacements(value: unknown): RedactionReplacement[] {
  if (!Array.isArray(value)) {
    throw new PiiProtectionError(
      "PII scanner не вернул карту восстановления.",
      "scanner_invalid_response"
    );
  }

  return value.slice(0, 500).map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as Record<string, unknown>).token !== "string" ||
      typeof (item as Record<string, unknown>).original !== "string"
    ) {
      throw new PiiProtectionError(
        "PII scanner вернул некорректную карту восстановления.",
        "scanner_invalid_response"
      );
    }

    const token = (item as { token: string }).token.slice(0, 120);

    if (!/^__KZ_PII_[A-Z]+_\d+__$/.test(token)) {
      throw new PiiProtectionError(
        "PII scanner вернул недопустимый токен восстановления.",
        "scanner_invalid_response"
      );
    }

    return {
      token,
      original: (item as { original: string }).original.slice(0, 4_096)
    };
  });
}

function fallbackProtection(messages: ChatMessage[]): ProtectedMessages {
  const fallback = maskChatMessages(messages);
  const counts: PiiCounts = {
    ...EMPTY_COUNTS,
    iin: fallback.counts.iin,
    phone: fallback.counts.phone,
    card: fallback.counts.card
  };

  return {
    messages: fallback.messages,
    extras: {},
    counts,
    maskedTotal:
      fallback.counts.iin + fallback.counts.phone + fallback.counts.card,
    engine: "regex-fallback-v1",
    policyVersion: process.env.PII_POLICY_VERSION || "kz-pii-v2",
    riskScore: 0.5,
    replacements: []
  };
}

/**
 * В strict-режиме отсутствие локального DLP-сервиса блокирует запрос.
 * Regex fallback предназначен только для разработки и явно помечается в логах.
 */
export async function protectChatMessages(
  messages: ChatMessage[],
  requestId: string,
  extras: Record<string, unknown> = {}
): Promise<ProtectedMessages> {
  const scannerUrl = process.env.PII_SCANNER_URL?.replace(/\/$/, "");
  const scannerToken = process.env.PII_SCANNER_TOKEN;
  const strictMode = process.env.PII_STRICT_MODE !== "false";

  if (!scannerUrl || !scannerToken) {
    if (strictMode) {
      throw new PiiProtectionError(
        "Локальный PII scanner не настроен. Запрос заблокирован.",
        "scanner_unavailable"
      );
    }

    const fallback = fallbackProtection(messages);
    const fallbackExtras = maskChatMessages([
      { role: "system", content: extras }
    ]);
    const extraContent = fallbackExtras.messages[0]?.content;

    fallback.counts.iin += fallbackExtras.counts.iin;
    fallback.counts.phone += fallbackExtras.counts.phone;
    fallback.counts.card += fallbackExtras.counts.card;
    fallback.maskedTotal +=
      fallbackExtras.counts.iin +
      fallbackExtras.counts.phone +
      fallbackExtras.counts.card;
    fallback.extras =
      extraContent && typeof extraContent === "object"
        ? (extraContent as Record<string, unknown>)
        : {};

    return fallback;
  }

  let response: Response;

  try {
    response = await fetch(`${scannerUrl}/v1/redact`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${scannerToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        request_id: requestId,
        messages,
        extras,
        policy_version:
          process.env.PII_POLICY_VERSION || "kz-pii-v2"
      }),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw new PiiProtectionError(
      "Локальный PII scanner недоступен. Запрос заблокирован.",
      "scanner_unavailable"
    );
  }

  if (!response.ok) {
    throw new PiiProtectionError(
      "Локальный PII scanner отклонил запрос.",
      "scanner_unavailable"
    );
  }

  let payload: Record<string, unknown>;

  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new PiiProtectionError(
      "Локальный PII scanner вернул некорректный JSON.",
      "scanner_invalid_response"
    );
  }

  const responseExtras =
    payload.extras && typeof payload.extras === "object"
      ? (payload.extras as Record<string, unknown>)
      : null;

  if (
    !Array.isArray(payload.messages) ||
    payload.messages.length !== messages.length ||
    !responseExtras
  ) {
    throw new PiiProtectionError(
      "Локальный PII scanner вернул некорректные сообщения.",
      "scanner_invalid_response"
    );
  }

  const counts = normalizeCounts(payload.counts);
  const replacements = normalizeReplacements(payload.replacements);
  const expectedPolicy =
    process.env.PII_POLICY_VERSION || "kz-pii-v2";
  const engine =
    typeof payload.engine === "string"
      ? payload.engine.slice(0, 80)
      : "external-gliner";
  const requiredEngine =
    process.env.PII_REQUIRED_ENGINE || "gliner+regex-v2";

  if (
    typeof payload.policy_version !== "string" ||
    payload.policy_version !== expectedPolicy
  ) {
    throw new PiiProtectionError(
      "Версия PII-политики scanner не совпадает с политикой API.",
      "scanner_invalid_response"
    );
  }

  if (strictMode && !engine.startsWith(requiredEngine)) {
    throw new PiiProtectionError(
      "PII scanner работает без обязательного NER-слоя.",
      "scanner_invalid_response"
    );
  }

  const protectedJson = JSON.stringify({
    messages: payload.messages,
    extras: responseExtras
  });

  // Проверка на ошибку сканера: исходное значение не должно остаться в prompt.
  if (replacements.some(({ original }) => original && protectedJson.includes(original))) {
    throw new PiiProtectionError(
      "PII scanner не удалил найденное значение из prompt.",
      "scanner_invalid_response"
    );
  }

  const maskedTotal = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0
  );

  return {
    messages: payload.messages as ChatMessage[],
    extras: responseExtras,
    counts,
    maskedTotal,
    engine,
    policyVersion: expectedPolicy,
    riskScore:
      typeof payload.risk_score === "number"
        ? Math.max(0, Math.min(1, payload.risk_score))
        : 0,
    replacements
  };
}

export function restoreRedactedText(
  text: string,
  replacements: RedactionReplacement[]
): string {
  let restored = text;

  for (const { token, original } of replacements) {
    if (token) {
      restored = restored.split(token).join(original);
    }
  }

  return restored;
}
