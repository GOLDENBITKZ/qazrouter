import { createHmac, timingSafeEqual } from "node:crypto";
import { isVastModel, type VastModel } from "./catalog";
import { vastSettings } from "./config";

function hmac(value: string) {
  return createHmac("sha256", vastSettings().secret).update(value).digest("base64url");
}

export function workerToken(deploymentId: string) {
  return hmac(`worker:${deploymentId}`);
}

export interface QuoteClaims {
  userId: string;
  model: VastModel;
  offerId: number;
  hourlyUsd: number;
  expires: number;
  durationMinutes: number;
}

export function signQuote(claims: QuoteClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${hmac(`quote:${payload}`)}`;
}

export function verifyQuote(token: string, userId: string): QuoteClaims {
  const [payload, signature, extra] = token.split(".");
  const expected = hmac(`quote:${payload}`);
  if (!payload || !signature || extra || Buffer.byteLength(signature) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Предложение изменено. Подберите GPU снова.");
  }
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as QuoteClaims;
  if (claims.userId !== userId || !isVastModel(claims.model) ||
      !Number.isSafeInteger(claims.offerId) || claims.offerId <= 0 ||
      !Number.isFinite(claims.hourlyUsd) || claims.hourlyUsd <= 0 ||
      !Number.isFinite(claims.expires) || claims.expires < Date.now() ||
      claims.expires > Date.now() + 5 * 60_000 ||
      claims.durationMinutes !== vastSettings().durationMinutes ||
      claims.hourlyUsd > vastSettings().maxHourlyUsd) {
    throw new Error("Предложение истекло. Подберите GPU снова.");
  }
  return claims;
}
