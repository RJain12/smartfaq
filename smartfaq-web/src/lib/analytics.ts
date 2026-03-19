import type { ClientEvent } from "@/lib/types";
import type { SurveyResponse } from "@/lib/types";

function uniqSessions(events: ClientEvent[], predicate: (e: ClientEvent) => boolean) {
  const s = new Set<string>();
  for (const e of events) {
    if (predicate(e)) s.add(e.sessionId);
  }
  return s.size;
}

export function buildAdminStats(
  events: ClientEvent[],
  responses: SurveyResponse[],
  submitCounts: Record<string, number>
) {
  const sessions = new Set(events.map((e) => e.sessionId));

  const funnel = {
    connected: uniqSessions(events, (e) => e.t === "session_start"),
    intro: uniqSessions(events, (e) => e.t === "section" && e.detail?.section === 0),
    demographics: uniqSessions(events, (e) => e.t === "section" && e.detail?.section === 1),
    evaluation: uniqSessions(events, (e) => e.t === "section" && e.detail?.section === 2),
    tab_hospital: uniqSessions(events, (e) => e.t === "note_tab" && e.detail?.tab === "hc"),
    tab_discharge: uniqSessions(events, (e) => e.t === "note_tab" && e.detail?.tab === "dc"),
    tab_faq: uniqSessions(events, (e) => e.t === "note_tab" && e.detail?.tab === "faq"),
    first_submit: uniqSessions(events, (e) => e.t === "submit_success"),
  };

  const deviceCounts: Record<string, number> = {};
  for (const e of events) {
    if (e.t !== "session_start") continue;
    const d = String(e.detail?.device ?? "unknown");
    deviceCounts[d] = (deviceCounts[d] ?? 0) + 1;
  }

  const countryCounts: Record<string, number> = {};
  for (const e of events) {
    if (e.t !== "session_start") continue;
    const c = String(e.detail?.country ?? "");
    if (!c) continue;
    countryCounts[c] = (countryCounts[c] ?? 0) + 1;
  }

  const qTouch: Record<string, number> = {};
  for (const e of events) {
    if (e.t !== "question_touch") continue;
    const k = String(e.detail?.qkey ?? "");
    if (!k) continue;
    qTouch[k] = (qTouch[k] ?? 0) + 1;
  }

  const likertKeys = [
    "hc_understand",
    "hc_comfort",
    "hc_clarity",
    "hc_when_help",
    "dc_understand",
    "dc_comfort",
    "dc_clarity",
    "dc_when_help",
    "faq_understand",
    "faq_comfort",
    "faq_clarity",
    "faq_when_help",
  ] as const;

  const likertMeans: { note_id: string; item: string; mean: number; n: number }[] = [];
  const byNote: Record<string, SurveyResponse[]> = {};
  for (const r of responses) {
    byNote[r.note_id] ??= [];
    byNote[r.note_id].push(r);
  }
  for (const [note_id, rows] of Object.entries(byNote)) {
    for (const item of likertKeys) {
      const vals = rows
        .map((x) => Number((x as unknown as Record<string, number>)[item]))
        .filter((v) => !Number.isNaN(v));
      if (vals.length === 0) continue;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      likertMeans.push({ note_id, item, mean, n: vals.length });
    }
  }

  return {
    totalEventSessions: sessions.size,
    responseCount: responses.length,
    funnel,
    deviceCounts,
    countryCounts,
    qTouch,
    submitCounts,
    likertMeans,
    recentResponses: responses.slice(-40).reverse(),
  };
}
