import { NextResponse } from "next/server";

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export async function GET() {
  const checks = {
    supabaseUrl:
      configured("SUPABASE_URL") || configured("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey:
      configured("SUPABASE_ANON_KEY") ||
      configured("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: configured("SUPABASE_SERVICE_ROLE_KEY"),
    apiKeyHashPepper: configured("API_KEY_HASH_PEPPER"),
    deepseekApiKey: configured("DEEPSEEK_API_KEY"),
    geminiApiKey: configured("GEMINI_API_KEY"),
    litellmBaseUrl: configured("LITELLM_BASE_URL"),
    litellmMasterKey: configured("LITELLM_MASTER_KEY"),
    piiScannerUrl: configured("PII_SCANNER_URL"),
    piiScannerToken: configured("PII_SCANNER_TOKEN"),
    piiStrictMode:
      !configured("PII_STRICT_MODE") ||
      process.env.PII_STRICT_MODE?.toLowerCase() !== "false"
  };

  const ready = Object.values(checks).every(Boolean);

  return NextResponse.json(
    {
      status: ready ? "ok" : "configuration_incomplete",
      checks,
      timestamp: new Date().toISOString()
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
