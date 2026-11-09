import { createHmac, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

export interface GeneratedApiKey {
  secret: string;
  hash: string;
  prefix: string;
  lastFour: string;
}

export function hashApiKey(secret: string): string {
  return createHmac("sha256", env.apiKeyHashPepper)
    .update(secret)
    .digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
  const secret = `kz_live_${randomBytes(32).toString("base64url")}`;

  return {
    secret,
    hash: hashApiKey(secret),
    prefix: secret.slice(0, 12),
    lastFour: secret.slice(-4)
  };
}
