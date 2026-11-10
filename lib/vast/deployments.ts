import { randomUUID } from "node:crypto";
import { generate } from "selfsigned";
import { createSupabaseAdminClient } from "../supabase/admin";
import { VAST_MODELS, isVastModel, type DeploymentView, type OfferQuote, type VastModel } from "./catalog";
import { canDeployVast, vastSettings } from "./config";
import { searchOffers, vastApi, VastApiError, workerAddress, type VastInstance } from "./api";
import { signQuote, verifyQuote, workerToken } from "./credentials";
import { workerJson } from "./transport";

export interface DeploymentRow {
  id: string;
  user_id: string | null;
  model: VastModel;
  instance_id: number | null;
  state: string;
  hourly_usd: number;
  gpu_name: string;
  tls_cert: string;
  host: string | null;
  port: number | null;
  expires_at: string;
  created_at: string;
  last_checked_at?: string;
}

const live = ["creating", "starting", "ready", "unknown", "deleting"];

function requireAccess(userId: string) {
  if (!canDeployVast(userId)) throw new Error("Запуск GPU доступен пользователям, которым открыт доступ владельцем QazRouter.");
  vastSettings();
}

function requireModelAccess(model: VastModel) {
  if (VAST_MODELS[model].gated && !/^[A-Za-z0-9_./:=+@-]+$/.test(process.env.VAST_HF_TOKEN?.trim() || "")) {
    throw new Error("Для Llama владелец должен настроить Hugging Face read token и доступ к весам.");
  }
}

async function save(id: string, update: Partial<DeploymentRow>) {
  let query = createSupabaseAdminClient().from("vast_deployments")
    .update({ ...update, last_checked_at: new Date().toISOString() }).eq("id", id);
  // A late readiness poll must never resurrect an instance being deleted.
  if (update.state === "ready" || update.state === "starting") query = query.not("state", "in", "(deleting,terminated)");
  const { error } = await query;
  if (error) throw new Error("Не удалось сохранить состояние GPU. Обновите статус.");
}

export function deploymentView(row: DeploymentRow): DeploymentView {
  const state = live.includes(row.state) && Date.parse(row.expires_at) <= Date.now() ? "expired" : row.state;
  return { id: row.id, model: row.model, state, hourlyUsd: Number(row.hourly_usd),
    gpuName: row.gpu_name, expiresAt: row.expires_at };
}

export async function getDeployment(userId: string): Promise<DeploymentRow | null> {
  const { data, error } = await createSupabaseAdminClient().from("vast_deployments")
    .select("*").eq("user_id", userId).in("state", live).maybeSingle();
  if (error) throw new Error("Не удалось прочитать состояние GPU. Примените supabase/vast.sql.");
  return data as DeploymentRow | null;
}

export async function quoteDeployment(userId: string, model: string): Promise<OfferQuote> {
  requireAccess(userId);
  if (!isVastModel(model)) throw new Error("Выберите модель из каталога.");
  requireModelAccess(model);
  if (await getDeployment(userId)) throw new Error("Сначала освободите текущий GPU.");
  const [offer] = await searchOffers(model);
  if (!offer) throw new Error("Нет подходящего GPU в пределах лимита цены. Попробуйте позже.");
  const expires = Date.now() + 5 * 60_000;
  const durationMinutes = vastSettings().durationMinutes;
  return {
    token: signQuote({ userId, model, offerId: offer.id, hourlyUsd: offer.dph_total, expires, durationMinutes }),
    model, gpuName: offer.gpu_name, location: offer.geolocation,
    hourlyUsd: offer.dph_total, expiresAt: new Date(expires).toISOString(), durationMinutes
  };
}

export async function deployModel(userId: string, quoteToken: string): Promise<DeploymentView> {
  requireAccess(userId);
  const quote = verifyQuote(quoteToken, userId);
  const settings = vastSettings();
  requireModelAccess(quote.model);
  const [offer] = await searchOffers(quote.model, quote.offerId);
  if (!offer || offer.dph_total > quote.hourlyUsd) throw new Error("GPU недоступен или подорожал. Подберите ресурс снова.");
  const id = randomUUID();
  const tls = await generate([{ name: "commonName", value: "qazrouter-worker" }], {
    algorithm: "sha256", keySize: 2048,
    notBeforeDate: new Date(Date.now() - 60_000),
    notAfterDate: new Date(Date.now() + 24 * 60 * 60_000)
  });
  const row: DeploymentRow = {
    id, user_id: userId, model: quote.model, instance_id: null, state: "creating",
    hourly_usd: offer.dph_total, gpu_name: offer.gpu_name, tls_cert: tls.cert,
    host: null, port: null, created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + quote.durationMinutes * 60_000).toISOString()
  };
  // The partial unique index reserves capacity before any paid API call, across processes.
  const { error } = await createSupabaseAdminClient().from("vast_deployments").insert(row);
  if (error) throw new Error("GPU уже заказан либо не применена миграция. Обновите статус.");
  const model = VAST_MODELS[quote.model];
  const variables: Record<string, string> = {
    MODEL_ID: model.huggingFaceId, SERVED_MODEL: quote.model, WORKER_TOKEN: workerToken(id),
    TLS_CERT_B64: Buffer.from(tls.cert).toString("base64"),
    TLS_KEY_B64: Buffer.from(tls.private).toString("base64"),
    LEASE_EXPIRES_AT: row.expires_at
  };
  if (model.gated) variables.HF_TOKEN = process.env.VAST_HF_TOKEN!.trim();
  let instanceId: number | null = null;
  try {
    // Docker flag values are base64url/base64 or reviewed identifiers; no shell interpolation.
    const dockerEnv = "-p 8443:8443 " + Object.entries(variables)
      .map(([name, value]) => {
        if (!/^[A-Za-z0-9_./:=+@-]+$/.test(value)) throw new Error("Недопустимое значение окружения worker.");
        return `-e ${name}=${value}`;
      }).join(" ");
    const result = await vastApi<{ success: boolean; new_contract?: number }>(`asks/${offer.id}/`, "PUT", {
      image: settings.image, label: `qzr-${id}`, disk: model.diskGb,
      runtype: "args", args: [], env: dockerEnv, target_state: "running", cancel_unavail: true
    });
    if (result.success === false && !result.new_contract) throw new VastApiError(400);
    if (!result.success || !Number.isSafeInteger(result.new_contract) || result.new_contract! <= 0) {
      // A malformed success may still have created an instance: reconcile by durable label.
      throw new Error("Неопределённый результат создания GPU.");
    }
    instanceId = result.new_contract!;
    await save(id, { instance_id: instanceId, state: "starting" });
    return deploymentView({ ...row, instance_id: instanceId, state: "starting" });
  } catch (error) {
    // Never retry a paid PUT after timeout. Keep the reservation for reconciliation.
    const definitiveRejection = error instanceof VastApiError && [400,401,403,404,410,429].includes(error.status);
    await save(id, { instance_id: instanceId, state: definitiveRejection ? "failed" : "unknown" });
    throw new Error(definitiveRejection
      ? "Vast.ai отклонил заказ GPU. Подберите другое предложение."
      : "Результат заказа уточняется. Обновите статус; повторный заказ заблокирован.");
  }
}

async function locateInstance(row: DeploymentRow): Promise<VastInstance | null> {
  if (row.instance_id) {
    try {
      const result = await vastApi<{ instances: VastInstance }>(`instances/${row.instance_id}/`);
      if (result.instances?.label !== `qzr-${row.id}`) throw new Error("Метка GPU не совпала с заказом.");
      return result.instances;
    } catch (error) {
      if (error instanceof VastApiError && error.status === 404) return null;
      throw error;
    }
  }
  const result = await vastApi<{ instances: VastInstance[] }>("instances/");
  if (!Array.isArray(result.instances)) throw new Error("Не удалось сверить заказ GPU.");
  const matches = result.instances.filter(instance => instance.label === `qzr-${row.id}`);
  if (matches.length > 1) throw new Error("Обнаружено несколько GPU с одной меткой. Нужна проверка владельцем.");
  return matches[0] || null;
}

export async function refreshDeployment(row: DeploymentRow, destroy = false): Promise<DeploymentRow> {
  // Avoid racing the in-flight create request before its 15-second deadline.
  if (!row.instance_id && Date.now() - Date.parse(row.created_at) < 60_000) {
    if (destroy) {
      await save(row.id, { state: "deleting" });
      return { ...row, state: "deleting" };
    }
    return row;
  }
  const instance = await locateInstance(row);
  if (!instance) {
    if (row.instance_id) {
      await save(row.id, { state: "terminated", host: null, port: null });
      return { ...row, state: "terminated", host: null, port: null };
    }
    // Unknown creation stays reserved: provider eventual consistency must not create a second lease.
    await save(row.id, {});
    return row;
  }
  const next = { ...row, instance_id: instance.id };
  if (destroy || row.state === "deleting" || Date.parse(row.expires_at) <= Date.now()) {
    await save(row.id, { instance_id: instance.id, state: "deleting", host: null, port: null });
    const result = await vastApi<{ success: boolean }>(`instances/${instance.id}/`, "DELETE");
    if (!result.success) throw new Error("Vast.ai ещё не подтвердил освобождение GPU.");
    await save(row.id, { state: "terminated", host: null, port: null });
    return { ...next, state: "terminated", host: null, port: null };
  }
  const address = instance.actual_status === "running" ? workerAddress(instance) : null;
  next.state = "starting";
  next.host = address?.host || null;
  next.port = address?.port || null;
  if (address) {
    try {
      const models = await workerJson(next, "/v1/models", undefined, 3_000);
      if (Array.isArray(models.data) && models.data.some(item => item?.id === row.model)) next.state = "ready";
    } catch { /* Loading weights or unhealthy worker. Never report ready without TLS + model check. */ }
  }
  await save(row.id, { instance_id: next.instance_id, state: next.state, host: next.host, port: next.port });
  return next;
}

export async function refreshForUser(userId: string, destroy = false): Promise<DeploymentView | null> {
  // Existing owners can free a lease even after their launch permission is revoked.
  const row = await getDeployment(userId);
  return row ? deploymentView(await refreshDeployment(row, destroy)) : null;
}

export async function reapExpiredDeployments(): Promise<number> {
  const { data, error } = await createSupabaseAdminClient().from("vast_deployments")
    .select("*").in("state", live).lte("expires_at", new Date().toISOString())
    .order("last_checked_at", { ascending: true }).limit(20);
  if (error) throw new Error("Не удалось прочитать аренды GPU.");
  // Bound parallel API requests and execution time. Remaining leases are retried by the next cron tick.
  const rows = (data || []) as DeploymentRow[];
  const results: PromiseSettledResult<DeploymentRow>[] = [];
  const started = Date.now();
  let index = 0;
  await Promise.all([0, 1].map(async () => {
    while (index < rows.length && Date.now() - started < 25_000) {
      const row = rows[index++];
      try { results.push({ status: "fulfilled", value: await refreshDeployment(row, true) }); }
      catch (reason) {
        // Rotate failed/unknown leases so they cannot starve cleanup of other billable GPUs.
        try { await save(row.id, {}); } catch { /* Database failure is reported by the failed cron. */ }
        results.push({ status: "rejected", reason });
      }
    }
  }));
  if (index < rows.length || results.some(result => result.status === "rejected")) throw new Error("Не все GPU освобождены. Повторите сверку.");
  return results.filter(result => result.status === "fulfilled" && result.value.state === "terminated").length;
}
