import { isIP } from "node:net";
import { vastSettings } from "./config";
import { VAST_MODELS, type VastModel } from "./catalog";

export interface VastOffer {
  id: number;
  dph_total: number;
  gpu_name: string;
  geolocation: string;
  gpu_ram: number;
  num_gpus: number;
  rentable: boolean;
  rented: boolean;
  verification: string;
}

export interface VastInstance {
  id: number;
  label: string;
  actual_status: string;
  public_ipaddr: string;
  ports?: Record<string, Array<{ HostPort: string }>>;
}

export class VastApiError extends Error {
  constructor(public readonly status: number) {
    super(`Vast.ai API: HTTP ${status}.`);
  }
}

export async function vastApi<T>(path: string, method = "GET", body?: unknown, version: "v0" | "v1" = "v0"): Promise<T> {
  // Fixed control-plane origin. Never return upstream bodies (may contain env/secrets).
  const response = await fetch(`https://console.vast.ai/api/${version}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${vastSettings().apiKey}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
    cache: "no-store"
  });
  if (!response.ok) throw new VastApiError(response.status);
  return await response.json() as T;
}

export async function searchOffers(model: VastModel, offerId?: number): Promise<VastOffer[]> {
  const spec = VAST_MODELS[model];
  const result = await vastApi<{ offers: VastOffer[] }>("bundles/", "POST", {
    type: "on-demand",
    verified: { eq: true }, rentable: { eq: true }, rented: { eq: false },
    num_gpus: { eq: 1 }, gpu_ram: { gte: spec.gpuRamMb },
    disk_space: { gte: spec.diskGb }, direct_port_count: { gte: 1 },
    cuda_vers: { gte: 12.8 }, compute_cap: { gte: 800 }, reliability: { gte: 0.99 },
    inet_down: { gte: 100 }, cpu_arch: { eq: "amd64" },
    allocated_storage: spec.diskGb,
    dph_total: { lte: vastSettings().maxHourlyUsd },
    ...(offerId === undefined ? {} : { id: { eq: offerId } }),
    order: [["dph_total", "asc"]], limit: 20
  });
  if (!Array.isArray(result.offers)) throw new Error("Некорректный список GPU от Vast.ai.");
  return result.offers.filter(offer =>
    Number.isSafeInteger(offer.id) && offer.id > 0 &&
    Number.isFinite(offer.dph_total) && offer.dph_total > 0 &&
    offer.dph_total <= vastSettings().maxHourlyUsd &&
    offer.gpu_ram >= spec.gpuRamMb && offer.num_gpus === 1 &&
    offer.rentable === true && offer.rented === false && offer.verification === "verified" &&
    (offerId === undefined || offer.id === offerId)
  ).sort((a, b) => a.dph_total - b.dph_total);
}

export function workerAddress(instance: VastInstance): { host: string; port: number } | null {
  const host = instance.public_ipaddr;
  if (isIP(host) !== 4) return null;
  const [a, b] = host.split(".").map(Number);
  // Only public IPv4 from the authenticated control plane; no DNS/redirect SSRF.
  if (a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))) return null;
  const port = Number(instance.ports?.["8443/tcp"]?.[0]?.HostPort);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? { host, port } : null;
}
