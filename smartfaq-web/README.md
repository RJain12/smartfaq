# SmartFAQs — Next.js (Vercel)

This is the **modern deployment** of the survey: **no R, no Shiny, no Docker required** for local development.

- **Local storage**: JSON Lines under `.data/` (gitignored) — works on your machine with `npm run dev`.
- **Vercel / production**: set **Upstash Redis** env vars so API routes can persist data (Vercel’s filesystem is read-only for app code).

## Run locally

```bash
cd smartfaq-web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Try `?form=1` … `?form=5`.

- **Admin**: [http://localhost:3000/admin](http://localhost:3000/admin) — default password `aditya` (override with `SMARTFAQ_ADMIN_PASSWORD`). Set `ADMIN_SESSION_SECRET` for production cookies.

## Why we had Docker & R before

The earlier **`smartfaq_survey/`** folder was a **research prototype** in R/Shiny with optional Redis in Docker. That stack does **not** run on Vercel’s serverless model. This Next.js app gives you the same study flow, better UI, and a normal Node hosting path.

## Deploy on Vercel

1. Push this `smartfaq-web` directory (or monorepo with root = this app) to GitHub.
2. Import the project in [Vercel](https://vercel.com).
3. Add environment variables:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `SMARTFAQ_ADMIN_PASSWORD` (strong value)
   - `ADMIN_SESSION_SECRET` (long random string)

Without Upstash, **submits will fail** on Vercel (cannot write `.data/`). Locally, `.data/` is created automatically.

## Edit note content

See `src/lib/study.ts` — forms, `NOTE_*` placeholders, and sample text for `NOTE_001` / `NOTE_002`.
