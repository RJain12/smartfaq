import { NextResponse } from "next/server";
import { appendEvent, appendResponse } from "@/lib/store";
import type { SurveyResponse } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const row = (await req.json()) as SurveyResponse;
    if (!row.session_id || !row.note_id || !row.form_id) {
      return NextResponse.json({ error: "bad payload" }, { status: 400 });
    }
    await appendResponse(row);
    await appendEvent({
      t: "submit_success",
      sessionId: row.session_id,
      formId: row.form_id,
      at: new Date().toISOString(),
      detail: { note_id: row.note_id },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
