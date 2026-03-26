import { Redis } from "@upstash/redis";
import type { ClientEvent } from "@/lib/types";
import type { SurveyResponse } from "@/lib/types";

const PREFIX = process.env.REDIS_PREFIX ?? "smartfaq";

function redis() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Upstash / KV REST env missing");
  return new Redis({ url, token });
}

export async function appendEventUpstash(e: ClientEvent) {
  const r = redis();
  await r.lpush(`${PREFIX}:events`, JSON.stringify(e));
  await r.ltrim(`${PREFIX}:events`, 0, 99_999);
}

export async function appendResponseUpstash(row: SurveyResponse) {
  const r = redis();
  await r.lpush(`${PREFIX}:responses`, JSON.stringify(row));
  await r.ltrim(`${PREFIX}:responses`, 0, 49_999);
  await r.hincrby(`${PREFIX}:stats:submissions_by_note`, row.note_id, 1);
}

export async function readEventsUpstash(max = 40_000): Promise<ClientEvent[]> {
  const r = redis();
  const lines = await r.lrange(`${PREFIX}:events`, 0, max - 1);
  if (!lines) return [];
  return (lines as string[])
    .map((l) => {
      try {
        return JSON.parse(l) as ClientEvent;
      } catch {
        return null;
      }
    })
    .filter((x): x is ClientEvent => x != null);
}

export async function readResponsesUpstash(max = 40_000): Promise<SurveyResponse[]> {
  const r = redis();
  const lines = await r.lrange(`${PREFIX}:responses`, 0, max - 1);
  if (!lines) return [];
  return (lines as string[])
    .map((l) => {
      try {
        return JSON.parse(l) as SurveyResponse;
      } catch {
        return null;
      }
    })
    .filter((x): x is SurveyResponse => x != null);
}

export async function readSubmitCountsUpstash(): Promise<Record<string, number>> {
  const r = redis();
  const h = await r.hgetall(`${PREFIX}:stats:submissions_by_note`);
  if (!h || typeof h !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(h)) {
    out[k] = Number(v) || 0;
  }
  return out;
}
