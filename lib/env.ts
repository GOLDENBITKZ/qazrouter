function readRequired(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Не задана обязательная переменная окружения: ${name}`);
  }

  return value;
}

function readFirst(names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  throw new Error(
    `Не задана обязательная переменная окружения: ${names.join(" или ")}`
  );
}

export const env = {
  get supabaseUrl() {
    return readFirst(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  },
  get supabaseAnonKey() {
    return readFirst(["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  },
  get supabaseServiceRoleKey() {
    return readRequired("SUPABASE_SERVICE_ROLE_KEY");
  },
  get apiKeyHashPepper() {
    return readRequired("API_KEY_HASH_PEPPER");
  },
  get siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  },
  get litellmBaseUrl() {
    return readRequired("LITELLM_BASE_URL").replace(/\/$/, "");
  },
  get litellmMasterKey() {
    return readRequired("LITELLM_MASTER_KEY");
  },
  get piiScannerUrl() {
    return readRequired("PII_SCANNER_URL").replace(/\/$/, "");
  },
  get piiScannerToken() {
    return readRequired("PII_SCANNER_TOKEN");
  },
  get piiStrictMode() {
    return process.env.PII_STRICT_MODE !== "false";
  },
  get piiPolicyVersion() {
    return process.env.PII_POLICY_VERSION || "kz-pii-v2";
  }
};
