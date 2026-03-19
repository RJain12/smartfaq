import { google } from "googleapis";
import type { SurveyResponse } from "@/lib/types";
import { surveyResponseToSheetRow } from "@/lib/row-to-sheet";

function parseServiceAccountJson(raw: string): Record<string, unknown> {
  let s = raw.trim();
  // Some dashboards store JSON as a quoted string
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    try {
      s = JSON.parse(s) as string;
    } catch {
      /* use as-is */
    }
  }
  try {
    let parsed: unknown = JSON.parse(s);
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    throw new Error(
      `Invalid GOOGLE_SERVICE_ACCOUNT_JSON (must be valid JSON): ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

function getServiceAccountJson(): Record<string, unknown> {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (b64?.trim()) {
    const json = Buffer.from(b64.trim(), "base64").toString("utf8");
    return parseServiceAccountJson(json);
  }
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw?.trim()) {
    return parseServiceAccountJson(raw);
  }
  throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
}

export function googleSheetsConfigured(): boolean {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const hasJson =
    !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
    !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  return Boolean(id && hasJson);
}

/**
 * Appends one data row. Ensure the sheet’s first row matches SHEET_HEADER_ROW (see row-to-sheet.ts)
 * or create the sheet with that header once.
 */
export async function appendSurveyRowToGoogleSheet(row: SurveyResponse): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  if (!spreadsheetId) throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID not set");

  const creds = getServiceAccountJson();
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const range = process.env.GOOGLE_SHEETS_APPEND_RANGE?.trim() || "Sheet1!A1";
  const values = [surveyResponseToSheetRow(row).map((v) => (v === null || v === undefined ? "" : v))];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}
