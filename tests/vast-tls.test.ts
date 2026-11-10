import { createServer, type Server } from "node:https";
import { once } from "node:events";
import { generate } from "selfsigned";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { workerJson } from "../lib/vast/transport";
import type { WorkerConnection } from "../lib/vast/transport";

// Only the address guard is replaced so a real TLS endpoint can be tested on loopback.
vi.mock("../lib/vast/api", () => ({ workerAddress: vi.fn().mockReturnValue({ host: "127.0.0.1", port: 1 }) }));
let server: Server;
let connection: WorkerConnection;
let status = 200;
let authorization = "";
beforeAll(async () => {
  const pair = await generate([{ name: "commonName", value: "qazrouter-worker" }], { algorithm: "sha256", keySize: 2048 });
  server = createServer({ key: pair.private, cert: pair.cert }, (req, res) => {
    authorization = req.headers.authorization || "";
    req.resume();
    res.writeHead(status, { "Content-Type": "application/json", Location: "https://evil.example/" });
    res.end(JSON.stringify({ data: [{ id: "kz-vast-qwen" }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing TLS port");
  connection = { id: "lease", host: "127.0.0.1", port: address.port, tls_cert: pair.cert };
}, 15_000);
beforeEach(() => {
  status = 200;
  vi.stubEnv("VAST_API_KEY", "control-key");
  vi.stubEnv("VAST_WORKER_IMAGE", `ghcr.io/example/qzr@sha256:${"a".repeat(64)}`);
  vi.stubEnv("VAST_DEPLOYMENT_SECRET", "long-secret-".repeat(4));
  vi.stubEnv("CRON_SECRET", "cron");
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });

describe("real per-lease TLS transport", () => {
  it("validates the pinned certificate and SNI, sending a worker credential only", async () => {
    expect(await workerJson(connection, "/v1/models")).toEqual({ data: [{ id: "kz-vast-qwen" }] });
    expect(authorization).toMatch(/^Bearer [\w-]{43}$/);
    expect(authorization).not.toContain("control-key");
  });
  it("rejects another lease's certificate", async () => {
    const other = await generate([{ name: "commonName", value: "qazrouter-worker" }], { algorithm: "sha256", keySize: 2048 });
    await expect(workerJson({ ...connection, tls_cert: other.cert }, "/v1/models")).rejects.toThrow();
  });
  it("does not follow redirects with a credential or prompt", async () => {
    status = 302;
    await expect(workerJson(connection, "/v1/models")).rejects.toThrow("HTTP 302");
  });
});
