import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canDeployVast, vastSettings } from "../lib/vast/config";
import { signQuote, verifyQuote, workerToken, type QuoteClaims } from "../lib/vast/credentials";
import { searchOffers, vastApi, workerAddress } from "../lib/vast/api";

beforeEach(() => {
  vi.stubEnv("VAST_API_KEY", "control-plane-secret");
  vi.stubEnv("VAST_WORKER_IMAGE", `ghcr.io/example/qzr@sha256:${"a".repeat(64)}`);
  vi.stubEnv("VAST_DEPLOYMENT_SECRET", "deployment-secret-".repeat(3));
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.stubEnv("VAST_MAX_HOURLY_USD", "0.5");
  vi.stubEnv("VAST_SESSION_MINUTES", "60");
  vi.stubEnv("VAST_ALLOWED_USER_IDS", "alice,bob");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const claims = (): QuoteClaims => ({ userId: "alice", model: "kz-vast-qwen", offerId: 123,
  hourlyUsd: 0.2, expires: Date.now() + 240_000, durationMinutes: 60 });

describe("GPU spending authorization", () => {
  it("requires an explicit account allowlist and immutable image", () => {
    expect(canDeployVast("alice")).toBe(true);
    expect(canDeployVast("alice-other")).toBe(false);
    vi.stubEnv("VAST_WORKER_IMAGE", "vllm/vllm-openai:latest");
    expect(vastSettings).toThrow("digest");
  });
  it.each(["-1", "NaN", "Infinity", "11"])("rejects invalid hourly limit %s", value => {
    vi.stubEnv("VAST_MAX_HOURLY_USD", value);
    expect(vastSettings).toThrow();
  });
  it("binds a signed quote to its account, model, price, expiry and session length", () => {
    const token = signQuote(claims());
    expect(verifyQuote(token, "alice").offerId).toBe(123);
    expect(() => verifyQuote(token, "bob")).toThrow();
    const [payload, signature] = token.split(".");
    const changed = Buffer.from(JSON.stringify({ ...claims(), hourlyUsd: 0.01 })).toString("base64url");
    expect(() => verifyQuote(`${changed}.${signature}`, "alice")).toThrow();
    expect(() => verifyQuote(`${payload}.${signature}.extra`, "alice")).toThrow();
    expect(() => verifyQuote(signQuote({ ...claims(), expires: Date.now() - 1 }), "alice")).toThrow();
    vi.stubEnv("VAST_SESSION_MINUTES", "120");
    expect(() => verifyQuote(token, "alice")).toThrow();
  });
  it("isolates worker credentials from quotes and other deployments", () => {
    expect(workerToken("one")).not.toBe(workerToken("two"));
    expect(signQuote(claims())).not.toContain(workerToken("one"));
    expect(workerToken("one")).not.toContain("control-plane-secret");
  });
});

describe("Vast.ai control plane", () => {
  it("selects the cheapest verified single GPU that fits within the price cap", async () => {
    const base = { gpu_name: "RTX 4090", geolocation: "EU", gpu_ram: 24576,
      num_gpus: 1, rentable: true, rented: false, verification: "verified" };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ offers: [
      { ...base, id: 1, dph_total: 0.4 }, { ...base, id: 2, dph_total: 0.2 },
      { ...base, id: 3, dph_total: 0.6 }, { ...base, id: 4, dph_total: 0.1, gpu_ram: 12000 },
      { ...base, id: 5, dph_total: 0.1, verification: "unverified" }
    ] }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await searchOffers("kz-vast-qwen")).map(offer => offer.id)).toEqual([2, 1]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://console.vast.ai/api/v0/bundles/");
    expect(options.redirect).toBe("error");
    const query = JSON.parse(options.body);
    expect(query.allocated_storage).toBe(40);
    expect(query.gpu_ram.gte).toBe(24000);
    expect(query.type).toBe("on-demand");
  });
  it("does not expose raw upstream errors containing environment credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret prompt and token", { status: 500 })));
    await expect(vastApi("instances/")).rejects.toThrow("Vast.ai API: HTTP 500.");
  });
  it.each(["127.0.0.1", "10.1.1.1", "169.254.169.254", "172.16.2.1", "192.168.1.1", "100.64.1.1", "::1", "evil.example"])("rejects worker SSRF address %s", host => {
    expect(workerAddress({ id: 1, label: "", actual_status: "running", public_ipaddr: host,
      ports: { "8443/tcp": [{ HostPort: "12345" }] } })).toBeNull();
  });
  it("uses the external mapped TLS port, not an assumed port 8443", () => {
    expect(workerAddress({ id: 1, label: "", actual_status: "running", public_ipaddr: "8.8.4.4",
      ports: { "8443/tcp": [{ HostPort: "12345" }] } })).toEqual({ host: "8.8.4.4", port: 12345 });
  });
});
