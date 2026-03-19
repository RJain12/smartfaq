# SmartFAQs survey (Shiny)

Research survey with **Redis** as the primary database: full response rows, an append-only **event stream** for behaviour analytics, and an **Admin** tab (password-protected) for funnel, geography, devices, per-question engagement, and Likert summaries.

Remote repo: [github.com/RJain12/smartfaq](https://github.com/RJain12/smartfaq.git)

## Quick start

```bash
# Terminal 1 — Redis
docker compose up -d
```

```r
install.packages(c(
  "shiny", "bslib", "yaml", "htmltools", "commonmark",
  "redux", "jsonlite", "digest", "httr",
  "ggplot2", "dplyr", "tidyr"
))
shiny::runApp("/path/to/smartfaq_survey")
```

Set `REDIS_URL` if Redis is not at `redis://127.0.0.1:6379` (see `config.yml`).

## Configuration

| Item | Location |
|------|-----------|
| Forms → note ids | `config.yml` → `forms` |
| Note text + FAQs | `data/notes.yaml` |
| Redis URL / key prefix / IP geolocation | `config.yml` → `redis` |
| Admin password | Env `SMARTFAQ_ADMIN_PASSWORD` (default **`aditya`** — change for any real deployment) |

Cohort links: `https://your-host/app/?form=1` … `?form=5`.

## Admin dashboard

Open the **Admin** tab → password → **Refresh data**.

- **Visitor funnel**: unique sessions reaching connect, intro, demographics, evaluation, note tabs (hospital / discharge / FAQ), and first successful submit.
- **Demographics drop-off**: first interaction per question (unique sessions), ordered along your form — useful for where people stall.
- **Device**: coarse class from `User-Agent` (mobile / tablet / desktop / bot).
- **Country**: optional lookup via [ip-api.com](http://ip-api.com) from the app server’s view of the client IP (respect their rate limits; set `redis.geolookup: false` to disable).
- **Submissions by note** and **Likert means** from stored JSON responses.
- **Recent responses** table (PII present — restrict access).

## Redis key layout (prefix default `smartfaq`)

| Key pattern | Purpose |
|-------------|---------|
| `{prefix}:visitors` | SET of `session_id` |
| `{prefix}:session:{session_id}` | HASH — funnel flags, per-question dedupe fields, TTL ~90d |
| `{prefix}:stats:funnel` | HASH — counts per funnel step |
| `{prefix}:stats:q_first` | HASH — first-touch counts per question key |
| `{prefix}:stats:country`, `device`, `timezone` | HASH — session-unique aggregates |
| `{prefix}:stats:submissions_by_note` | HASH — successful submit counts |
| `{prefix}:events` | LIST — JSON events (trimmed) |
| `{prefix}:responses` | LIST — JSON response rows (trimmed) |

## Deploying (e.g. shinyapps.io)

1. Run a **managed Redis** (Upstash, Redis Cloud, ElastiCache, etc.) and set **`REDIS_URL`** in the hosting environment.
2. Set **`SMARTFAQ_ADMIN_PASSWORD`** to a strong secret; remove reliance on the default password.
3. `rsconnect::deployApp(appDir = "smartfaq_survey", ...)`

ShinyApps.io does not provide Redis; you must use an external URL. IP geolocation may resolve to the proxy, not the respondent — treat **country** as indicative only.

## Push to GitHub

```bash
cd smartfq   # or the folder that contains smartfaq_survey
git init
git add smartfaq_survey
git commit -m "Initial SmartFAQs survey + Redis analytics"
git remote add origin https://github.com/RJain12/smartfaq.git
git branch -M main
git push -u origin main
```

If the repo should be the app root, move contents of `smartfaq_survey/` up one level before pushing.

## Privacy & ethics

Logging email and behaviour requires appropriate consent and IRB/data agreements. Disable `geolookup` if you do not want third-party IP services.
