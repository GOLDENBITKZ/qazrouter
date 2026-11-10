import type { PublicModel } from "@/lib/billing/pricing";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: unknown;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown;
}

export interface ContextCacheOptions {
  enabled: boolean;
  key?: string;
  ttlSeconds?: number;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  userId: string;
  requestId: string;
  model: PublicModel;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stop?: string | string[];
  responseFormat?: unknown;
  contextCache: ContextCacheOptions;
}

export interface ProviderResult {
  text: string;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  providerCostUsd: number | null;
  providerRequestId: string | null;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly provider: string
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
