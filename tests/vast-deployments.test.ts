import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { deployModel, refreshDeployment, type DeploymentRow } from "../lib/vast/deployments";
import { signQuote } from "../lib/vast/credentials";
import { searchOffers, vastApi } from "../lib/vast/api";
import { workerJson } from "../lib/vast/transport";
import { generate } from "selfsigned";

const storage = vi.hoisted(() => ({ rows: new Map<string, DeploymentRow>() }));
vi.mock("../lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({
  from: () => ({
    insert: async (row: DeploymentRow) => {
      if ([...storage.rows.values()].some(item => item.user_id === row.user_id && !["failed", "terminated"].includes(item.state))) {
        return { error: { code: "23505" } };
      }
      storage.rows.set(row.id, { ...row });
      return { error: null };
    },
    update: (update: Partial<DeploymentRow>) => {
      let id = "";
      let excludeDeleting = false;
      const query = {
        eq: (_key: string, value: string) => { id = value; return query; },
        not: () => { excludeDeleting = true; return query; },
        then: (resolve: (result: { error: null }) => unknown) => {
          const row = storage.rows.get(id);
          if (row && !(excludeDeleting && ["deleting", "terminated"].includes(row.state))) Object.assign(row, update);
          return Promise.resolve(resolve({ error: null }));
        }
      };
      return query;
    }
  })
}) }));
vi.mock("../lib/vast/api", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/vast/api")>(),
  searchOffers: vi.fn(), vastApi: vi.fn()
}));
vi.mock("../lib/vast/transport", () => ({ workerJson: vi.fn() }));
vi.mock("selfsigned", () => ({ generate: vi.fn().mockResolvedValue({ cert: "public-cert", private: "private-key" }) }));

beforeEach(() => {
  storage.rows.clear();
  vi.resetAllMocks();
  vi.mocked(generate).mockResolvedValue({ cert: "public-cert", private: "private-key", public: "", fingerprint: "" });
  vi.stubEnv("VAST_API_KEY", "control-key");
  vi.stubEnv("VAST_WORKER_IMAGE", `ghcr.io/example/qzr@sha256:${"a".repeat(64)}`);
  vi.stubEnv("VAST_DEPLOYMENT_SECRET", "long-secret-".repeat(4));
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.stubEnv("VAST_MAX_HOURLY_USD", "0.5");
  vi.stubEnv("VAST_SESSION_MINUTES", "60");
  vi.stubEnv("VAST_ALLOWED_USER_IDS", "alice");
  vi.mocked(searchOffers).mockResolvedValue([{ id: 123, dph_total: 0.2, gpu_name: "RTX 4090",
    gpu_ram: 24576, num_gpus: 1, rentable: true, rented: false, verification: "verified", geolocation: "EU" }]);
});
afterEach(() => { vi.unstubAllEnvs(); });
const quote = () => signQuote({ userId: "alice", model: "kz-vast-qwen", offerId: 123,
  hourlyUsd: 0.2, expires: Date.now() + 240000, durationMinutes: 60 });

describe("durable paid deployment lifecycle", () => {
  it("releases a reservation after an explicit provider rejection", async () => {
    vi.mocked(vastApi).mockResolvedValueOnce({ success: false });
    await expect(deployModel("alice", quote())).rejects.toThrow("отклонил");
    expect([...storage.rows.values()][0].state).toBe("failed");
    vi.mocked(vastApi).mockResolvedValueOnce({ success: true, new_contract: 456 });
    expect((await deployModel("alice", quote())).state).toBe("starting");
  });
  it("persists a destroy request while creation is still being reconciled", async () => {
    vi.mocked(vastApi).mockRejectedValueOnce(new Error("timeout"));
    await expect(deployModel("alice", quote())).rejects.toThrow("уточняется");
    const [row] = [...storage.rows.values()];
    expect((await refreshDeployment(row, true)).state).toBe("deleting");
    expect(row.state).toBe("deleting");
    expect(vastApi).toHaveBeenCalledTimes(1);
  });
  it("reserves a single live lease before concurrent paid create calls", async () => {
    vi.mocked(vastApi).mockResolvedValue({ success: true, new_contract: 456 });
    const token = quote();
    const results = await Promise.allSettled([deployModel("alice", token), deployModel("alice", token)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(vastApi).toHaveBeenCalledTimes(1);
    const [row] = [...storage.rows.values()];
    expect(row.instance_id).toBe(456);
    expect(row.state).toBe("starting");
    const body = vi.mocked(vastApi).mock.calls[0][2] as Record<string, string>;
    expect(body.label).toBe(`qzr-${row.id}`);
    expect(body.env).toContain("-p 8443:8443");
    expect(body.env).toContain("MODEL_ID=Qwen/Qwen2.5-7B-Instruct");
    expect(body.env).not.toContain("control-key");
    expect(JSON.stringify(results)).not.toContain("private-key");
  });
  it("does not retry a timed-out create and reconciles it by the durable label", async () => {
    vi.mocked(vastApi).mockRejectedValueOnce(new Error("timeout"));
    const token = quote();
    await expect(deployModel("alice", token)).rejects.toThrow("уточняется");
    const [row] = [...storage.rows.values()];
    expect(row.state).toBe("unknown");
    await expect(deployModel("alice", token)).rejects.toThrow("уже заказан");
    expect(vastApi).toHaveBeenCalledTimes(1);
    row.created_at = new Date(Date.now() - 70_000).toISOString();
    vi.mocked(vastApi).mockResolvedValueOnce({ instances: [{ id: 456, label: `qzr-${row.id}`,
      actual_status: "running", public_ipaddr: "8.8.4.4", ports: { "8443/tcp": [{ HostPort: "12345" }] } }] });
    vi.mocked(workerJson).mockResolvedValueOnce({ data: [{ id: row.model }] });
    expect((await refreshDeployment(row)).state).toBe("ready");
    expect(row.instance_id).toBe(456);
    const [path, method, , version] = vi.mocked(vastApi).mock.calls[1];
    const url = new URL(path, "https://console.vast.ai/api/v1/");
    expect(method).toBe("GET");
    expect(version).toBe("v1");
    expect(url.searchParams.get("limit")).toBe("2");
    expect(JSON.parse(url.searchParams.get("select_filters")!)).toEqual({ label: { eq: `qzr-${row.id}` } });
  });
  it("rejects a price increase before reserving or renting any GPU", async () => {
    vi.mocked(searchOffers).mockResolvedValueOnce([{ id: 123, dph_total: 0.4 } as never]);
    await expect(deployModel("alice", quote())).rejects.toThrow("подорожал");
    expect(storage.rows.size).toBe(0);
    expect(vastApi).not.toHaveBeenCalled();
  });
  it("does not allow an account outside the allowlist to create resources", async () => {
    await expect(deployModel("mallory", quote())).rejects.toThrow("доступен");
    expect(searchOffers).not.toHaveBeenCalled();
  });
  it("deletes an expired GPU and clears its inference address only after provider confirmation", async () => {
    vi.mocked(vastApi).mockResolvedValueOnce({ success: true, new_contract: 456 });
    await deployModel("alice", quote());
    const [row] = [...storage.rows.values()];
    row.expires_at = new Date(Date.now() - 1000).toISOString();
    vi.mocked(vastApi).mockResolvedValueOnce({ instances: { id: 456, label: `qzr-${row.id}`, actual_status: "running" } });
    vi.mocked(vastApi).mockResolvedValueOnce({ success: false });
    await expect(refreshDeployment(row)).rejects.toThrow("не подтвердил");
    expect(row.state).toBe("deleting");
    expect(workerJson).not.toHaveBeenCalled();
    vi.mocked(vastApi).mockResolvedValueOnce({ instances: { id: 456, label: `qzr-${row.id}`, actual_status: "running" } });
    vi.mocked(vastApi).mockResolvedValueOnce({ success: true });
    expect((await refreshDeployment(row)).state).toBe("terminated");
    expect(row.host).toBeNull();
  });
  it("never marks a different model or an unhealthy TLS worker ready", async () => {
    vi.mocked(vastApi).mockResolvedValueOnce({ success: true, new_contract: 456 });
    await deployModel("alice", quote());
    const [row] = [...storage.rows.values()];
    const instance = { id: 456, label: `qzr-${row.id}`, actual_status: "running", public_ipaddr: "8.8.4.4",
      ports: { "8443/tcp": [{ HostPort: "12345" }] } };
    vi.mocked(vastApi).mockResolvedValue({ instances: instance });
    vi.mocked(workerJson).mockResolvedValueOnce({ data: [{ id: "different-model" }] });
    expect((await refreshDeployment(row)).state).toBe("starting");
    vi.mocked(workerJson).mockRejectedValueOnce(new Error("TLS validation failed"));
    expect((await refreshDeployment(row)).state).toBe("starting");
  });
});
