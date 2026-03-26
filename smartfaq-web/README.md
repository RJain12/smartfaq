# SmartFAQs — Next.js (Vercel)

Survey UI for the SmartFAQs study: **Next.js**, **TypeScript**, **Tailwind**. No R/Shiny required for deployment.

- **Submissions**: Prefer **Google Sheets** (matches the original R pipeline). Optionally mirror rows to **Upstash Redis** for the in-app admin dashboard.
- **Local dev**: without Sheets/KV credentials, responses append to **JSON Lines** under `.data/` (gitignored).

## Run locally

```bash
cd smartfaq-web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use `?form=1` … `?form=4` to pick a form (each form is a different patient set).

- **Admin**: [http://localhost:3000/admin](http://localhost:3000/admin) — default password `aditya` (override with `SMARTFAQ_ADMIN_PASSWORD`). Set `ADMIN_SESSION_SECRET` for production cookies.

## Google Sheets (production)

1. Create a Google Cloud project → enable **Google Sheets API**.
2. Create a **service account**, download its JSON key.
3. Create a spreadsheet, **share it with the service account email** (Editor).
4. In Vercel (or `.env.local`), set:

| Variable | Description |
|----------|-------------|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ID from the spreadsheet URL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full JSON string of the service account key (or use base64 below) |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Alternative: base64-encoded JSON (if raw JSON is awkward in the dashboard) |
| `GOOGLE_SHEETS_APPEND_RANGE` | Optional, default `Sheet1!A1` — **must match your tab’s exact name** (e.g. `Form Responses!A1`). If the tab isn’t named `Sheet1`, the API can fail silently into backup storage — check Vercel logs. |

Add a header row once so columns align (see `SHEET_HEADER_ROW` in `src/lib/row-to-sheet.ts`). The **`form_id`** column (3rd column, after `session_id` and `submitted_at_utc`) stores which survey version the participant used (`1`–`4`), so you can filter or pivot in the spreadsheet.

### Admin dashboard + Sheets

The **admin** page reads analytics from **Upstash** or **local files**, not from the Sheets API. If you use **Sheets only** (no Upstash), submissions still save to the spreadsheet, but **saved response counts / recent rows here will stay empty**. Set Upstash vars to mirror each submission into Redis for this dashboard, or analyze in Google Sheets.

Optional Upstash:

- `UPSTASH_REDIS_REST_URL` (or `KV_REST_API_URL`)
- `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_TOKEN`)

## Deploy on Vercel

1. Push `smartfaq-web` (or set the repo root to this app).
2. Import in [Vercel](https://vercel.com).
3. Add env vars: at minimum **Google Sheets** credentials above for durable survey data; plus `SMARTFAQ_ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` if you use admin.

Without Sheets **or** Upstash, **submits will fail on Vercel** (filesystem is not writable for `.data/`).

## Edit note content

See `src/lib/study.ts` — forms, `NOTE_*` IDs, and markdown/text for each note.

## Legacy R/Shiny

The **`../smartfaq_survey/`** folder is the original R/Shiny app. This Next.js app replaces it for hosting on Vercel while keeping the same question wording (see `src/lib/survey-copy.ts`).
