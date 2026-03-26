import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { loadResponsesForExport } from "@/lib/store";
import { responsesToCsv } from "@/lib/csv-export";

export async function GET() {
  const jar = await cookies();
  if (!verifyAdminToken(jar.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const responses = await loadResponsesForExport();
  const csv = responsesToCsv(responses);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="smartfaq-responses-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
