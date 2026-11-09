import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const origin = productionHost
    ? `https://${productionHost.replace(/^https?:\/\//, "")}`
    : process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const callbackUrl = new URL("/auth/callback", origin);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: callbackUrl.toString(),
      skipBrowserRedirect: true
    }
  });

  if (error || !data.url) {
    return NextResponse.redirect(
      new URL("/?authError=github_unavailable", request.url)
    );
  }

  return NextResponse.redirect(data.url);
}
