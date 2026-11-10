import { getDeployment } from "../vast/deployments";
import { isVastModel } from "../vast/catalog";
import { workerJson } from "../vast/transport";
import { normalizeFinishReason } from "./shared";
import { ProviderError, type CompletionRequest, type ProviderResult } from "./types";

/** Called only AFTER protectChatMessages. No provider fallback or prompt caching. */
export async function completeWithVast(request: CompletionRequest): Promise<ProviderResult> {
  if (!isVastModel(request.model)) throw new ProviderError("Неизвестная Vast-модель.", 400, "vastai");
  let row;
  try { row = await getDeployment(request.userId); }
  catch { throw new ProviderError("Состояние GPU временно недоступно.", 503, "vastai"); }
  if (!row || row.user_id !== request.userId || row.model !== request.model || row.state !== "ready" ||
      !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now()) {
    throw new ProviderError("Разверните выбранную модель в кабинете и дождитесь готовности GPU.", 503, "vastai");
  }
  try {
    const response = await workerJson(row, "/v1/chat/completions", {
      model: request.model, messages: request.messages,
      temperature: request.temperature, top_p: request.topP,
      max_tokens: request.maxTokens ?? 1024, stop: request.stop,
      response_format: request.responseFormat, stream: false
    });
    const choices = response.choices as Array<{ message?: { content?: unknown }; finish_reason?: string }> | undefined;
    const usage = response.usage as Record<string, unknown> | undefined;
    const text = choices?.[0]?.message?.content;
    const inputTokens = usage?.prompt_tokens;
    const outputTokens = usage?.completion_tokens;
    if (typeof text !== "string" || !Number.isSafeInteger(inputTokens) ||
        !Number.isSafeInteger(outputTokens) || Number(inputTokens) < 0 ||
        Number(outputTokens) < 0 || Number(inputTokens) + Number(outputTokens) <= 0) {
      throw new Error("Некорректный текст или учёт токенов GPU.");
    }
    return {
      text, finishReason: normalizeFinishReason(choices?.[0]?.finish_reason),
      inputTokens: Number(inputTokens), outputTokens: Number(outputTokens),
      totalTokens: Number(inputTokens) + Number(outputTokens), cachedInputTokens: 0,
      // Hourly GPU rental is separate; do not invent a per-request procurement cost.
      providerCostUsd: null, providerRequestId: typeof response.id === "string" ? response.id : null
    };
  } catch {
    throw new ProviderError("GPU недоступен или не вернул корректное потребление токенов.", 502, "vastai");
  }
}
