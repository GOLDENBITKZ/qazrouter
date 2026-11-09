import { createHmac } from "node:crypto";

import { env } from "@/lib/env";
import {
  normalizeFinishReason,
  readProviderJson
} from "@/lib/providers/shared";
import {
  ProviderError,
  type CompletionRequest,
  type ProviderResult
} from "@/lib/providers/types";

interface LiteLLMResponse {
  id?: string;
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
    cache_read_input_tokens?: number;
  };
}

function tenantCacheTag(userId: string): string {
  return createHmac("sha256", env.apiKeyHashPepper)
    .update(`tenant:${userId}`)
    .digest("hex")
    .slice(0, 24);
}

/**
 * LiteLLM Proxy принимает только очищенные сообщения.
 * Публичный API-ключ QazRouter и service-role Supabase сюда не передаются.
 */
export async function completeWithLiteLLM(
  request: CompletionRequest
): Promise<ProviderResult> {
  const tenantTag = tenantCacheTag(request.userId);
  const response = await fetch(`${env.litellmBaseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.litellmMasterKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Request-ID": request.requestId
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      top_p: request.topP,
      max_tokens: request.maxTokens,
      stop: request.stop,
      response_format: request.responseFormat,
      stream: false,
      user: tenantTag,
      cache: request.contextCache.enabled
        ? {
            namespace: `kzr:${tenantTag}:${request.contextCache.key || "default"}`,
            ttl: request.contextCache.ttlSeconds || 3_600
          }
        : { "no-cache": true },
      metadata: {
        request_id: request.requestId,
        tenant_tag: tenantTag,
        context_cache: request.contextCache.enabled,
        context_cache_key: request.contextCache.key,
        context_cache_ttl: request.contextCache.ttlSeconds
      }
    }),
    signal: AbortSignal.timeout(48_000)
  });

  const payload = (await readProviderJson(
    response,
    "litellm"
  )) as LiteLLMResponse;
  const choice = payload.choices?.[0];
  const text = choice?.message?.content;
  const usage = payload.usage;

  if (typeof text !== "string" || !usage) {
    throw new ProviderError(
      "LiteLLM не вернул текст ответа или данные о токенах.",
      502,
      "litellm"
    );
  }

  const inputTokens = Number(usage.prompt_tokens || 0);
  const outputTokens = Number(usage.completion_tokens || 0);
  const totalTokens = Number(
    usage.total_tokens || inputTokens + outputTokens
  );

  if (inputTokens + outputTokens <= 0) {
    throw new ProviderError(
      "LiteLLM вернул нулевое потребление токенов.",
      502,
      "litellm"
    );
  }

  return {
    text,
    finishReason: normalizeFinishReason(choice?.finish_reason),
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: Number(
      usage.prompt_tokens_details?.cached_tokens ||
        usage.cache_read_input_tokens ||
        0
    ),
    providerRequestId: payload.id || null
  };
}
