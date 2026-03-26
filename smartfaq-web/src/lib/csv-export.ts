import type { SurveyResponse } from "@/lib/types";
import { SHEET_HEADER_ROW, surveyResponseToSheetRow } from "@/lib/row-to-sheet";

function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const t = typeof v === "string" ? v : String(v);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

/** UTF-8 BOM helps Excel open UTF-8 CSV correctly. */
export function responsesToCsv(responses: SurveyResponse[]): string {
  const sorted = [...responses].sort(
    (a, b) => new Date(a.submitted_at_utc).getTime() - new Date(b.submitted_at_utc).getTime()
  );
  const lines: string[] = [SHEET_HEADER_ROW.map((h) => csvCell(h)).join(",")];
  for (const row of sorted) {
    lines.push(surveyResponseToSheetRow(row).map((c) => csvCell(c)).join(","));
  }
  return "\uFEFF" + lines.join("\n");
}
