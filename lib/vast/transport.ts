import { request as httpsRequest } from "node:https";
import { workerAddress } from "./api";
import { workerToken } from "./credentials";

export interface WorkerConnection {
  id: string;
  host: string | null;
  port: number | null;
  tls_cert: string;
}

/** Trust this deployment's certificate only, with full TLS validation and a fixed SNI. */
export function workerJson(
  connection: WorkerConnection,
  path: "/v1/models" | "/v1/chat/completions",
  body?: unknown,
  timeout = 44_000
): Promise<Record<string, unknown>> {
  if (!connection.host || !connection.port || !workerAddress({
    id: 1, label: "", actual_status: "running", public_ipaddr: connection.host,
    ports: { "8443/tcp": [{ HostPort: String(connection.port) }] }
  })) throw new Error("GPU ещё не получил безопасный сетевой адрес.");
  const data = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = httpsRequest({
      hostname: connection.host!, port: connection.port!, path,
      method: data === undefined ? "GET" : "POST",
      servername: "qazrouter-worker", ca: connection.tls_cert,
      rejectUnauthorized: true, minVersion: "TLSv1.2", agent: false,
      signal: AbortSignal.timeout(timeout),
      headers: {
        Authorization: `Bearer ${workerToken(connection.id)}`,
        "Content-Type": "application/json",
        ...(data === undefined ? {} : { "Content-Length": Buffer.byteLength(data) })
      }
    }, response => {
      // No redirects and no response/error bodies in logs.
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`GPU вернул HTTP ${response.statusCode}.`));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 2_000_000) request.destroy(new Error("Слишком большой ответ GPU."));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>); }
        catch { reject(new Error("GPU вернул некорректный JSON.")); }
      });
    });
    request.on("error", reject);
    request.end(data);
  });
}
