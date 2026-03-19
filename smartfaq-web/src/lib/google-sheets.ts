import { google } from "googleapis";
import type { SurveyResponse } from "@/lib/types";
import { surveyResponseToSheetRow } from "@/lib/row-to-sheet";

function getServiceAccountJson(): Record<string, unknown> {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (b64?.trim()) {
    const json = Buffer.from(b64.trim(), "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  }
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw?.trim()) {
    return JSON.parse(raw) as Record<string, unknown>;
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
