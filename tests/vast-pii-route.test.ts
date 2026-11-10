import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/v1/chat/completions/route";
import { completeWithVast } from "../lib/providers/vastai";
import { completeWithLiteLLM } from "../lib/providers/litellm";
import { protectChatMessages, PiiProtectionError } from "../lib/security/pii-protection";

const db = vi.hoisted(() => ({ rpc: vi.fn(), rows: [] as unknown[] }));
vi.mock("../lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({
  rpc: db.rpc,
  from: () => {
    const chain = {
      select: () => chain, eq: () => chain, update: () => chain,
      maybeSingle: async () => ({ data: db.rows.shift(), error: null }),
      then: (resolve: (x: { error: null }) => unknown) => Promise.resolve(resolve({ error: null }))
    };
    return chain;
  }
}) }));
vi.mock("../lib/providers/vastai", () => ({ completeWithVast: vi.fn() }));
vi.mock("../lib/providers/litellm", () => ({ completeWithLiteLLM: vi.fn() }));
vi.mock("../lib/security/pii-protection", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/security/pii-protection")>(), protectChatMessages: vi.fn()
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("API_KEY_HASH_PEPPER", "test-pepper");
  vi.stubEnv("PII_STRICT_MODE", "true");
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.rows = [{ id: "key", user_id: "alice", is_active: true }, { id: "alice", balance_kzt: 1000 }];
  db.rpc.mockResolvedValue({ data: { success: true, balance_kzt: 999 }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const request = () => new NextRequest("http://localhost/api/v1/chat/completions", {
  method: "POST", headers: { Authorization: "Bearer kz_live_test", "Content-Type": "application/json" },
  body: JSON.stringify({ model: "kz-vast-qwen", messages: [{ role: "user", content: "Клиент Алия" }], max_tokens: 128 })
});

describe("Vast route privacy boundary", () => {
  it("never calls either upstream or billing if the PII scanner fails", async () => {
    vi.mocked(protectChatMessages).mockRejectedValue(new PiiProtectionError("scanner down", "scanner_unavailable"));
    expect((await POST(request())).status).toBe(503);
    expect(completeWithVast).not.toHaveBeenCalled();
    expect(completeWithLiteLLM).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("cannot send Vast requests in the optional regex-only fallback mode", async () => {
    vi.stubEnv("PII_STRICT_MODE", "false");
    expect((await POST(request())).status).toBe(503);
    expect(completeWithVast).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("sends only redacted text to Vast and restores originals only in the final client response", async () => {
    vi.mocked(protectChatMessages).mockResolvedValue({
      messages: [{ role: "user", content: "Клиент __KZ_PII_PERSON_1__" }], extras: {},
      counts: { iin: 0, phone: 0, card: 0, email: 0, person: 1, address: 0, account: 0, passport: 0, other: 0 },
      maskedTotal: 1, engine: "gliner+regex-v2", policyVersion: "kz-pii-v2", riskScore: 0.1,
      replacements: [{ token: "__KZ_PII_PERSON_1__", original: "Алия" }]
    });
    vi.mocked(completeWithVast).mockResolvedValue({ text: "Готово, __KZ_PII_PERSON_1__", finishReason: "stop",
      inputTokens: 10, outputTokens: 4, totalTokens: 14, cachedInputTokens: 0, providerCostUsd: null, providerRequestId: "upstream" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(JSON.stringify(vi.mocked(completeWithVast).mock.calls)).not.toContain("Алия");
    expect(JSON.stringify(db.rpc.mock.calls)).not.toContain("Алия");
    expect(db.rpc.mock.calls[0][1].p_provider).toBe("vastai");
    expect((await response.json()).choices[0].message.content).toBe("Готово, Алия");
    expect(completeWithLiteLLM).not.toHaveBeenCalled();
  });
});
