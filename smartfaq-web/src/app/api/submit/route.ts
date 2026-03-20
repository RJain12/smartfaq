import { NextResponse } from "next/server";
import { appendEvent, appendResponse } from "@/lib/store";
import type { SurveyResponse } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const row = (await req.json()) as SurveyResponse;
    if (!row.session_id || !row.note_id || !row.form_id) {
      return NextResponse.json({ error: "bad payload" }, { status: 400 });
    }
    const stored = await appendResponse(row);
    try {
      await appendEvent({
        t: "submit_success",
        sessionId: row.session_id,
        formId: row.form_id,
        at: new Date().toISOString(),
        detail: { note_id: row.note_id, stored },
      });
    } catch (e) {
      console.error("appendEvent after submit failed (response still saved):", e);
    }
    return NextResponse.json({ ok: true, stored });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server error";
    console.error("POST /api/submit:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
