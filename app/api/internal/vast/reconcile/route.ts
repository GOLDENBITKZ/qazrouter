import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { reapExpiredDeployments } from "@/lib/vast/deployments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (!secret || Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const terminated = await reapExpiredDeployments();
    return NextResponse.json({ terminated }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "GPU reconciliation incomplete; retry required" }, { status: 502 });
  }
}
