import { NextResponse } from "next/server";
import { appendEvent } from "@/lib/store";
import type { ClientEvent } from "@/lib/types";
import { classifyDevice } from "@/lib/ua";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ClientEvent>;
    if (!body.t || !body.sessionId || !body.formId) {
      return NextResponse.json({ error: "bad payload" }, { status: 400 });
    }
    const ua = req.headers.get("user-agent") ?? "";
    const country =
      req.headers.get("x-vercel-ip-country") ??
      (typeof body.detail?.country === "string" ? body.detail.country : "") ??
      "";

    const detail = { ...(body.detail ?? {}) };
    if (body.t === "session_start") {
      detail.userAgent = ua;
      detail.device = classifyDevice(ua);
      if (country) detail.country = country;
    }

    const ev: ClientEvent = {
      t: body.t,
      sessionId: body.sessionId,
      formId: body.formId,
      at: body.at ?? new Date().toISOString(),
      detail,
    };
    await appendEvent(ev);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
