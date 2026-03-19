import { NextResponse } from "next/server";
import { adminPassword, adminCookieHeader, signAdminToken } from "@/lib/admin-auth";

export async function POST(req: Request) {
  const { password } = (await req.json()) as { password?: string };
  if (password !== adminPassword()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const tok = signAdminToken();
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": adminCookieHeader(tok, 60 * 60 * 24 * 7),
      },
    }
  );
}
