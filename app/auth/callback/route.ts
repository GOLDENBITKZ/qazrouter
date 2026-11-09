import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next") || "/dashboard";

  // Не допускаем open redirect через параметр next.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//")
    ? nextParam
    : "/dashboard";

  if (!code) {
    return NextResponse.redirect(
      new URL("/?authError=missing_code", request.url)
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/?authError=session_exchange_failed", request.url)
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
