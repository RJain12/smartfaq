import { NextResponse } from "next/server";
import { appendEvent, appendResponse } from "@/lib/store";
import type { SurveyResponse } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const raw = (await req.json()) as SurveyResponse;
    const form_id = String(raw.form_id ?? "").trim() || "1";
    const session_id = String(raw.session_id ?? "").trim();
    const note_id = String(raw.note_id ?? "").trim();
    if (!session_id || !note_id) {
      return NextResponse.json({ error: "bad payload" }, { status: 400 });
    }
    const row: SurveyResponse = { ...raw, form_id, session_id, note_id };
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
