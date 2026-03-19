import { mkdir, appendFile, readFile } from "fs/promises";
import { join } from "path";
import type { ClientEvent } from "@/lib/types";
import type { SurveyResponse } from "@/lib/types";

const DATA = join(process.cwd(), ".data");

async function ensureDir() {
  await mkdir(DATA, { recursive: true });
}

export async function appendEventFile(e: ClientEvent) {
  await ensureDir();
  await appendFile(join(DATA, "events.jsonl"), JSON.stringify(e) + "\n");
}

export async function appendResponseFile(r: SurveyResponse) {
  await ensureDir();
  await appendFile(join(DATA, "responses.jsonl"), JSON.stringify(r) + "\n");
}

export async function readJsonl(path: string, maxLines = 25_000): Promise<string[]> {
  try {
    const buf = await readFile(path, "utf8");
    const lines = buf.trim().split("\n").filter(Boolean);
    if (lines.length <= maxLines) return lines;
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

export async function readAllEvents(): Promise<ClientEvent[]> {
  const lines = await readJsonl(join(DATA, "events.jsonl"));
  return lines
    .map((l) => {
      try {
        return JSON.parse(l) as ClientEvent;
      } catch {
        return null;
      }
    })
    .filter((x): x is ClientEvent => x != null);
}

export async function readAllResponses(): Promise<SurveyResponse[]> {
  const lines = await readJsonl(join(DATA, "responses.jsonl"));
  return lines
    .map((l) => {
      try {
        return JSON.parse(l) as SurveyResponse;
      } catch {
        return null;
      }
    })
    .filter((x): x is SurveyResponse => x != null);
}
