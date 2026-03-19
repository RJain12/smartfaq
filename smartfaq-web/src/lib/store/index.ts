import type { ClientEvent } from "@/lib/types";
import type { SurveyResponse } from "@/lib/types";
import {
  appendEventFile,
  appendResponseFile,
  readAllEvents,
  readAllResponses,
} from "./file-store";

/** Vercel Upstash integration uses KV_REST_*; standalone Upstash uses UPSTASH_REDIS_*. */
function upstashRest() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  return { url, token };
}

function useUpstash() {
  const { url, token } = upstashRest();
  return Boolean(url && token);
}

export async function appendEvent(e: ClientEvent) {
  if (useUpstash()) {
    const { appendEventUpstash } = await import("./upstash-store");
    await appendEventUpstash(e);
    return;
  }
  await appendEventFile(e);
}

export async function appendResponse(row: SurveyResponse) {
  if (useUpstash()) {
    const { appendResponseUpstash } = await import("./upstash-store");
    await appendResponseUpstash(row);
    return;
  }
  await appendResponseFile(row);
}

export async function loadAnalytics() {
  if (useUpstash()) {
    const {
      readEventsUpstash,
      readResponsesUpstash,
      readSubmitCountsUpstash,
    } = await import("./upstash-store");
    const [events, responses, submitCounts] = await Promise.all([
      readEventsUpstash(),
      readResponsesUpstash(),
      readSubmitCountsUpstash(),
    ]);
    return { events, responses, submitCounts };
  }
  const [events, responses] = await Promise.all([
    readAllEvents(),
    readAllResponses(),
  ]);
  const submitCounts: Record<string, number> = {};
  for (const r of responses) {
    submitCounts[r.note_id] = (submitCounts[r.note_id] ?? 0) + 1;
  }
  return { events, responses, submitCounts };
}
