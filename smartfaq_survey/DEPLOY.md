# Deploy to shinyapps.io

## Automated deploy (credentials on your machine only)

If you use the repo’s **gitignored** helper (credentials live in `secrets/`, never committed):

```bash
Rscript smartfaq_survey/secrets/deploy_shinyapps.R
```

Install R (e.g. `brew install r` on Apple Silicon). The app needs **googlesheets4** and its dependencies (installed by the script if missing).

The app directory includes **`.rscignore`** listing `secrets` so deploy bundles never upload `secrets/deploy_shinyapps.R` (or any other credentials in that folder).

---

## 1. Authorize this computer (once)

In R, install `rsconnect` if needed, then run **exactly** the `rsconnect::setAccountInfo(...)` command from your shinyapps.io dashboard (**Account → Tokens**). Paste it only in your local R console — do not commit tokens or secrets to git.

## 2. Deploy

```r
library(rsconnect)
rsconnect::deployApp(
  appDir  = "path/to/smartfaq_survey",
  appName = "smartfaq-survey"
)
```

Use the real path to this folder (e.g. `"/Users/you/projects/smartfq/smartfaq_survey"`).

## 3. Environment variables (app Settings on shinyapps.io)

| Name | Notes |
|------|--------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON on the server, **or** use Posit’s secrets mechanism for the JSON file. |

Set **`google_sheet_id`** in `config.yml` inside the deployed app directory. Share the target Sheet with the service account (Editor).

## 4. Dependencies

CRAN packages are listed in `DESCRIPTION` / `README.md`. If deploy fails on missing packages, install them locally then redeploy.
