import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { loadAnalytics } from "@/lib/store";
import { buildAdminStats } from "@/lib/analytics";

export async function GET() {
  const jar = await cookies();
  const tok = jar.get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminToken(tok)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { events, responses, submitCounts } = await loadAnalytics();
  const stats = buildAdminStats(events, responses, submitCounts);
  return NextResponse.json(stats);
}
