import { NextResponse, type NextRequest } from "next/server";

import { openAIError } from "@/lib/api/openai-errors";
import {
  calculateCostKzt,
  isPublicModel,
  MODEL_CATALOG,
  PUBLIC_MODELS
} from "@/lib/billing/pricing";
import { completeWithLiteLLM } from "@/lib/providers/litellm";
import {
  ProviderError,
  type ChatMessage,
  type ChatRole,
  type CompletionRequest,
  type ContextCacheOptions
} from "@/lib/providers/types";
import { hashApiKey } from "@/lib/security/api-keys";
import {
  PiiProtectionError,
  protectChatMessages,
  restoreRedactedText
} from "@/lib/security/pii-protection";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_ROLES = new Set<ChatRole>([
  "system",
  "user",
  "assistant",
  "tool"
]);
const REQUEST_LIMIT_BYTES = 1_000_000;

interface ChatCompletionBody {
  model?: unknown;
  messages?: unknown;
  temperature?: unknown;
  top_p?: unknown;
  max_tokens?: unknown;
  max_completion_tokens?: unknown;
  stop?: unknown;
  response_format?: unknown;
  stream?: unknown;
  n?: unknown;
  metadata?: unknown;
  context_cache?: unknown;
}

function parseBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");

  if (!header) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function parseOptionalNumber(
  value: unknown,
  name: string,
  min: number,
  max: number
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${name} должен быть числом от ${min} до ${max}.`);
  }

  return value;
}

function parseMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("messages должен быть непустым массивом.");
  }

  if (value.length > 200) {
    throw new Error("Количество сообщений не может превышать 200.");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`messages[${index}] имеет некорректный формат.`);
    }

    const candidate = item as Record<string, unknown>;
    const role = candidate.role;

    if (typeof role !== "string" || !ALLOWED_ROLES.has(role as ChatRole)) {
      throw new Error(`messages[${index}].role имеет недопустимое значение.`);
    }

    if (
      candidate.content !== null &&
      typeof candidate.content !== "string" &&
      !Array.isArray(candidate.content)
    ) {
      throw new Error(`messages[${index}].content имеет некорректный формат.`);
    }

    if (Array.isArray(candidate.content)) {
      const textOnly = candidate.content.every(
        (part) =>
          part &&
          typeof part === "object" &&
          (part as Record<string, unknown>).type === "text" &&
          typeof (part as Record<string, unknown>).text === "string"
      );
      if (!textOnly) {
        throw new Error(
          `messages[${index}] содержит неподдерживаемый медиаформат. ` +
            "Для strict PII разрешён только текст."
        );
      }
    }

    return {
      role: role as ChatRole,
      content: candidate.content,
      ...(typeof candidate.name === "string"
        ? { name: candidate.name }
        : {}),
      ...(typeof candidate.tool_call_id === "string"
        ? { tool_call_id: candidate.tool_call_id }
        : {}),
      ...(Array.isArray(candidate.tool_calls)
        ? { tool_calls: candidate.tool_calls }
        : {})
    };
  });
}

function parseStop(value: unknown): string | string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value === "string" ||
    (Array.isArray(value) &&
      value.length <= 4 &&
      value.every((item) => typeof item === "string"))
  ) {
    return value as string | string[];
  }

  throw new Error("stop должен быть строкой или массивом строк.");
}

function parseContextCache(body: ChatCompletionBody): ContextCacheOptions {
  const metadata =
    body.metadata && typeof body.metadata === "object"
      ? (body.metadata as Record<string, unknown>)
      : {};
  const raw =
    body.context_cache && typeof body.context_cache === "object"
      ? (body.context_cache as Record<string, unknown>)
      : metadata.context_cache &&
          typeof metadata.context_cache === "object"
        ? (metadata.context_cache as Record<string, unknown>)
        : {};

  const key =
    typeof raw.key === "string"
      ? raw.key.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 80)
      : undefined;
  const ttlSeconds =
    typeof raw.ttl_seconds === "number" && raw.ttl_seconds > 0
      ? Math.min(Math.floor(raw.ttl_seconds), 86_400)
      : undefined;

  return {
    enabled: raw.enabled !== false,
    key,
    ttlSeconds
  };
}

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();
  const requestId = crypto.randomUUID();
  const contentLength = Number(request.headers.get("content-length") || 0);

  if (contentLength > REQUEST_LIMIT_BYTES) {
    return openAIError(
      413,
      "Размер запроса превышает 1 МБ.",
      "invalid_request_error",
      "request_too_large"
    );
  }

  const bearerToken = parseBearerToken(request);

  if (!bearerToken || !bearerToken.startsWith("kz_live_")) {
    return openAIError(
      401,
      "Передайте действующий API-ключ в заголовке Authorization: Bearer kz_live_...",
      "authentication_error",
      "invalid_api_key"
    );
  }

  let body: ChatCompletionBody;

  try {
    const parsed = (await request.json()) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return openAIError(
        400,
        "Тело запроса должно быть JSON-объектом.",
        "invalid_request_error",
        "invalid_json"
      );
    }

    body = parsed as ChatCompletionBody;
  } catch {
    return openAIError(
      400,
      "Тело запроса должно быть корректным JSON.",
      "invalid_request_error",
      "invalid_json"
    );
  }

  if (body.stream === true) {
    return openAIError(
      400,
      "В этой версии поддерживается stream: false. Streaming будет добавлен отдельным этапом.",
      "invalid_request_error",
      "stream_not_supported",
      "stream"
    );
  }

  if (body.n !== undefined && body.n !== 1) {
    return openAIError(
      400,
      "Поддерживается только n = 1.",
      "invalid_request_error",
      "unsupported_parameter",
      "n"
    );
  }

  const modelValue = body.model;

  if (typeof modelValue !== "string" || !isPublicModel(modelValue)) {
    return openAIError(
      400,
      `Доступные модели: ${PUBLIC_MODELS.join(", ")}.`,
      "invalid_request_error",
      "model_not_found",
      "model"
    );
  }

  let messages: ChatMessage[];
  let temperature: number | undefined;
  let topP: number | undefined;
  let maxTokens: number | undefined;
  let stop: string | string[] | undefined;

  try {
    messages = parseMessages(body.messages);
    temperature = parseOptionalNumber(body.temperature, "temperature", 0, 2);
    topP = parseOptionalNumber(body.top_p, "top_p", 0, 1);
    maxTokens = parseOptionalNumber(
      body.max_completion_tokens ?? body.max_tokens,
      "max_tokens",
      1,
      131_072
    );
    stop = parseStop(body.stop);
  } catch (error) {
    return openAIError(
      400,
      error instanceof Error ? error.message : "Некорректный запрос.",
      "invalid_request_error",
      "invalid_request"
    );
  }

  const supabase = createSupabaseAdminClient();
  const keyHash = hashApiKey(bearerToken);
  const { data: apiKey, error: keyError } = await supabase
    .from("api_keys")
    .select("id,user_id,is_active")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (keyError) {
    console.error("api_key_lookup_failed", {
      requestId,
      code: keyError.code
    });
    return openAIError(
      500,
      "Не удалось проверить API-ключ.",
      "server_error",
      "key_lookup_failed"
    );
  }

  if (!apiKey || !apiKey.is_active) {
    return openAIError(
      401,
      "API-ключ не существует или отключён.",
      "authentication_error",
      "invalid_api_key"
    );
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id,balance_kzt")
    .eq("id", apiKey.user_id)
    .maybeSingle();

  if (userError || !user) {
    console.error("user_lookup_failed", {
      requestId,
      userId: apiKey.user_id,
      code: userError?.code
    });
    return openAIError(
      500,
      "Не удалось получить данные владельца API-ключа.",
      "server_error",
      "user_lookup_failed"
    );
  }

  if (Number(user.balance_kzt) <= 0) {
    return openAIError(
      402,
      "Недостаточно средств. Пополните баланс в личном кабинете.",
      "insufficient_quota",
      "insufficient_balance"
    );
  }

  let protectedMessages;

  try {
    protectedMessages = await protectChatMessages(messages, requestId, {
      stop,
      response_format: body.response_format
    });
  } catch (error) {
    if (error instanceof PiiProtectionError) {
      console.error("pii_protection_failed", {
        requestId,
        code: error.code
      });
      return openAIError(
        503,
        "Защита персональных данных временно недоступна. Запрос не отправлен провайдеру.",
        "server_error",
        error.code
      );
    }

    console.error("pii_protection_unhandled_error", {
      requestId,
      error: error instanceof Error ? error.name : "unknown"
    });
    return openAIError(
      500,
      "Внутренняя ошибка PII-защиты. Запрос не отправлен провайдеру.",
      "server_error",
      "pii_internal_error"
    );
  }

  const estimatedInputTokens = Buffer.byteLength(
    JSON.stringify(protectedMessages.messages),
    "utf8"
  );
  const estimatedMaxTokens = maxTokens ?? 8_192;
  const estimatedMaximumCost = calculateCostKzt(
    modelValue,
    estimatedInputTokens,
    estimatedMaxTokens
  );

  // Не даём запускать дорогой запрос с символическим балансом, если итоговое
  // списание заведомо не сможет пройти. Это защищает от бесплатных вызовов.
  if (Number(user.balance_kzt) < estimatedMaximumCost) {
    return openAIError(
      402,
      "Баланса недостаточно для покрытия максимальной стоимости этого запроса.",
      "insufficient_quota",
      "insufficient_balance"
    );
  }

  const contextCache = parseContextCache(body);
  const completionRequest: CompletionRequest = {
    messages: protectedMessages.messages,
    userId: user.id,
    requestId,
    model: modelValue,
    temperature,
    topP,
    maxTokens,
    stop: protectedMessages.extras.stop as string | string[] | undefined,
    responseFormat: protectedMessages.extras.response_format,
    contextCache
  };

  // Фиксируем последнее использование ключа, не задерживая основной запрос.
  void supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKey.id)
    .then(({ error }) => {
      if (error) {
        console.error("api_key_touch_failed", {
          requestId,
          code: error.code
        });
      }
    });

  try {
    const providerResult = await completeWithLiteLLM(completionRequest);
    const pricing = MODEL_CATALOG[modelValue];
    const costKzt = calculateCostKzt(
      modelValue,
      providerResult.inputTokens,
      providerResult.outputTokens
    );
    const latencyMs = Date.now() - requestStartedAt;

    // Атомарное списание исключает отрицательный баланс при параллельных вызовах.
    const { data: chargeResult, error: chargeError } = await supabase.rpc(
      "charge_usage",
      {
        p_user_id: user.id,
        p_api_key_id: apiKey.id,
        p_request_id: requestId,
        p_model: modelValue,
        p_provider: pricing.provider,
        p_input_tokens: providerResult.inputTokens,
        p_output_tokens: providerResult.outputTokens,
        p_total_tokens: providerResult.totalTokens,
        p_cached_input_tokens: providerResult.cachedInputTokens,
        p_input_price_per_million: pricing.inputPricePerMillionKzt,
        p_output_price_per_million: pricing.outputPricePerMillionKzt,
        p_cost_kzt: costKzt,
        p_latency_ms: latencyMs,
        p_masked_entities: protectedMessages.counts as unknown as Json,
        p_masked_total: protectedMessages.maskedTotal,
        p_pii_engine: protectedMessages.engine,
        p_pii_policy_version: protectedMessages.policyVersion,
        p_pii_risk: protectedMessages.riskScore
      }
    );

    if (chargeError) {
      console.error("usage_charge_failed", {
        requestId,
        userId: user.id,
        code: chargeError.code
      });
      return openAIError(
        500,
        "Не удалось списать средства. Запрос не выполнен.",
        "server_error",
        "billing_failed"
      );
    }

    const charge = chargeResult as {
      success: boolean;
      balance_kzt?: number;
      reason?: string;
    } | null;

    if (!charge?.success) {
      return openAIError(
        402,
        "Недостаточно средств для завершения запроса.",
        "insufficient_quota",
        "insufficient_balance"
      );
    }

    const restoredText = restoreRedactedText(
      providerResult.text,
      protectedMessages.replacements
    );

    return NextResponse.json(
      {
        id: `chatcmpl-${requestId}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: modelValue,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: restoredText
            },
            finish_reason: providerResult.finishReason,
            logprobs: null
          }
        ],
        usage: {
          prompt_tokens: providerResult.inputTokens,
          completion_tokens: providerResult.outputTokens,
          total_tokens: providerResult.totalTokens
        },
        system_fingerprint: `kzrouter:${pricing.provider}`
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "x-request-id": requestId,
          "x-kz-cost-kzt": costKzt.toFixed(4),
          "x-kz-balance-kzt": Number(charge.balance_kzt || 0).toFixed(4),
          "x-kz-masked-total": String(protectedMessages.maskedTotal),
          "x-kz-pii-engine": protectedMessages.engine
        }
      }
    );
  } catch (error) {
    if (error instanceof ProviderError) {
      console.error("provider_request_failed", {
        requestId,
        provider: error.provider,
        status: error.status
      });

      return openAIError(
        error.status,
        error.status === 429
          ? "Провайдер временно ограничил частоту запросов."
          : "AI-провайдер временно недоступен. Попробуйте позже.",
        error.status === 429 ? "rate_limit_error" : "server_error",
        "provider_error"
      );
    }

    console.error("completion_unhandled_error", {
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });

    return openAIError(
      500,
      "Внутренняя ошибка маршрутизатора.",
      "server_error",
      "internal_error"
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type"
    }
  });
}
