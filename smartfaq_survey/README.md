# SmartFAQs survey (Shiny)

Layout and question flow follow the reference app **[SmartFAQs Survey – Patient Perspective](https://agutierrezsacristan.shinyapps.io/sm4rtf4q-1/)**: **questions on the left**, **Hospital course / Discharge summary / SmartFAQs** as tabs on the right, note selector + progress at the top of the rating step, **Reset this note**, and **one Google Sheet row per successful submit**.

**Question wording** matches the Google Forms study copy: hospital-course items without the “On a scale…” prefix; discharge-summary and SmartFAQs items with **“On a scale of 1–10, …”**; all twelve Likert sliders plus the Yes/No follow-up (*“Are you left with any unanswered questions that require further clarification from your doctor?”*) are required. **Email** (and optional name + acknowledgments consent) are collected with **demographics**, not on the note step.

**Storage:** responses are appended to **Google Sheets** (`googlesheets4`). There is no Redis or in-app analytics dashboard — analyze data in the Sheet (or export to R/Excel).

Remote repo: [github.com/RJain12/smartfaq](https://github.com/RJain12/smartfaq.git)

## Quick start

```r
install.packages(c(
  "shiny", "bslib", "yaml", "htmltools", "commonmark",
  "googlesheets4"
))
```

1. Create a Google Sheet whose **header row** matches the columns in `R/02_survey_copy.R` → `sheet_columns` (or let the first append create headers depending on your Sheet setup — you may need to add headers manually once).
2. Create a **service account**, download JSON, share the sheet with that email as **Editor**.
3. Set `google_sheet_id` in `config.yml` and either `google_service_account_json` or env `GOOGLE_APPLICATION_CREDENTIALS`.

```r
shiny::runApp("/path/to/smartfaq_survey")
```

If `google_sheet_id` is empty, the app still runs for testing; successful submits are kept **only in the browser session** — enable **Show local CSV download** to export.

## Configuration

| Item | Location |
|------|-----------|
| Forms → note ids | `config.yml` → `forms` |
| Note text + FAQs | `data/notes.yaml` |
| Google Sheet + auth | `config.yml` → `google_sheet_id`, `google_service_account_json` or `GOOGLE_APPLICATION_CREDENTIALS` |

Cohort links: `https://your-host/app/?form=1` … `?form=5`.

## Deploying (e.g. shinyapps.io)

1. Put `google_sheet_id` in `config.yml` in the deployed bundle (or use a private config pattern you trust).
2. Provide the service account JSON to the host (e.g. `GOOGLE_APPLICATION_CREDENTIALS` — see Posit docs for secrets on shinyapps.io).
3. `rsconnect::deployApp(appDir = "smartfaq_survey", ...)`

No Redis or extra env vars are required. See `DEPLOY.md` for a scripted deploy.

## Push to GitHub

```bash
cd smartfq   # or the folder that contains smartfaq_survey
git init
git add smartfaq_survey
git commit -m "SmartFAQs survey (Shiny + Google Sheets)"
git remote add origin https://github.com/RJain12/smartfaq.git
git branch -M main
git push -u origin main
```

## Privacy & ethics

Collecting email and health-related responses requires appropriate consent and IRB/data agreements. Restrict access to the Google Sheet.
