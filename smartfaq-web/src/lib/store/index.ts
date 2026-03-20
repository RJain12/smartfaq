import type { ClientEvent } from "@/lib/types";
import type { SurveyResponse } from "@/lib/types";
import {
  appendEventFile,
  appendResponseFile,
  readAllEvents,
  readAllResponses,
} from "./file-store";
import { appendSurveyRowToGoogleSheet, googleSheetsConfigured } from "@/lib/google-sheets";

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

/** Where the row was written (for client messaging / debugging). */
export type ResponseStorage =
  | "google_sheets"
  | "google_sheets_plus_kv"
  | "upstash_sheet_failed"
  | "upstash_only"
  | "local_file";

/**
 * Persists one submission. Priority:
 * 1) Google Sheets (if `GOOGLE_SHEETS_SPREADSHEET_ID` + service account JSON env are set)
 * 2) else Upstash Redis (optional analytics / backup)
 * 3) else local file (dev only)
 */
export async function appendResponse(row: SurveyResponse): Promise<ResponseStorage> {
  if (googleSheetsConfigured()) {
    try {
      await appendSurveyRowToGoogleSheet(row);
      if (useUpstash()) {
        try {
          const { appendResponseUpstash } = await import("./upstash-store");
          await appendResponseUpstash(row);
        } catch {
          /* optional mirror */
        }
        return "google_sheets_plus_kv";
      }
      return "google_sheets";
    } catch (err) {
      console.error("Google Sheets append failed:", err);
      if (useUpstash()) {
        console.warn("Falling back to Upstash for this submission.");
        const { appendResponseUpstash } = await import("./upstash-store");
        await appendResponseUpstash(row);
        return "upstash_sheet_failed";
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
  if (useUpstash()) {
    const { appendResponseUpstash } = await import("./upstash-store");
    await appendResponseUpstash(row);
    return "upstash_only";
  }
  await appendResponseFile(row);
  return "local_file";
}

/** Admin reads events/responses from Upstash or local files — not from the Sheet API. */
export function storageInfo() {
  const kv = useUpstash();
  const sheets = googleSheetsConfigured();
  return {
    surveyRowsInGoogleSheets: sheets,
    adminAnalyticsUsesKv: kv,
    /** True when rows only land in Sheets and are not mirrored to KV — admin stats stay empty on Vercel. */
    adminMissingSubmissionsUnlessKv: sheets && !kv,
  };
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
