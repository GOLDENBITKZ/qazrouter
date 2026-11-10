import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeWithVast } from "../lib/providers/vastai";
import { getDeployment } from "../lib/vast/deployments";
import { workerJson } from "../lib/vast/transport";
import type { CompletionRequest } from "../lib/providers/types";

vi.mock("../lib/vast/deployments", () => ({ getDeployment: vi.fn() }));
vi.mock("../lib/vast/transport", () => ({ workerJson: vi.fn() }));
const request: CompletionRequest = {
  userId: "alice", requestId: "request", model: "kz-vast-qwen",
  messages: [{ role: "user", content: "Проверь __KZ_PII_PERSON_1__" }],
  maxTokens: 128, contextCache: { enabled: true, key: "private-context" }
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getDeployment).mockResolvedValue({ id: "lease", user_id: "alice", model: "kz-vast-qwen",
    state: "ready", instance_id: 123, host: "8.8.4.4", port: 23456, tls_cert: "cert",
    gpu_name: "RTX 4090", hourly_usd: 0.2, created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString() });
});
afterEach(() => vi.restoreAllMocks());

describe("tenant-specific redacted Vast inference", () => {
  it("forwards only completion fields and bills validated usage without inventing GPU token cost", async () => {
    vi.mocked(workerJson).mockResolvedValue({ id: "upstream", choices: [{ message: { content: "Готово" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 3 } });
    const result = await completeWithVast(request);
    expect(result).toMatchObject({ inputTokens: 12, outputTokens: 3, totalTokens: 15, providerCostUsd: null, cachedInputTokens: 0 });
    expect(getDeployment).toHaveBeenCalledWith("alice");
    const body = vi.mocked(workerJson).mock.calls[0][2] as Record<string, unknown>;
    expect(body.messages).toEqual(request.messages);
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("contextCache");
    expect(body.stream).toBe(false);
  });
  it.each([null, { state: "starting" }, { state: "ready", model: "kz-vast-llama" },
    { state: "ready", model: "kz-vast-qwen", expires_at: "2020-01-01T00:00:00Z" }])("blocks absent, wrong, unready or expired lease %j", async row => {
    vi.mocked(getDeployment).mockResolvedValue(row as never);
    await expect(completeWithVast(request)).rejects.toMatchObject({ status: 503, provider: "vastai" });
    expect(workerJson).not.toHaveBeenCalled();
  });
  it.each([{ prompt_tokens: -1, completion_tokens: 2 }, { prompt_tokens: "10", completion_tokens: 2 },
    { prompt_tokens: 0, completion_tokens: 0 }, { prompt_tokens: 1.5, completion_tokens: 2 },
    { prompt_tokens: Infinity, completion_tokens: 2 }])("rejects invalid billing usage %j", async usage => {
    vi.mocked(workerJson).mockResolvedValue({ choices: [{ message: { content: "OK" } }], usage });
    await expect(completeWithVast(request)).rejects.toMatchObject({ status: 502 });
  });
});
