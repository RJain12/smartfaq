# Vercel + GitHub

## Live

**[https://smartfaq.vercel.app](https://smartfaq.vercel.app)** — deploys on every push to `main`.

## Environment variables (already on the project)

| Variable | Source |
|----------|--------|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | **Upstash for Redis** Vercel integration (provisioned via CLI) |
| `REDIS_URL`, `KV_URL`, `KV_REST_API_READ_ONLY_TOKEN` | Same integration (available if you need them) |
| `ADMIN_SESSION_SECRET` | Set via Vercel API (random 256-bit hex) — signs admin cookies |
| `SMARTFAQ_ADMIN_PASSWORD` | Set to `aditya` — **change this in** [Project → Settings → Environment Variables](https://vercel.com/rjain12s-projects/smartfaq/settings/environment-variables) for anything public-facing |

The Next app reads **`KV_REST_API_URL`** + **`KV_REST_API_TOKEN`** (or legacy `UPSTASH_REDIS_*` if you set those manually).

## Monorepo deploy

From repo root (folder that contains `smartfaq-web/`):

```bash
npx vercel deploy --prod --yes
```

Do not run production deploy only from inside `smartfaq-web/` when **Root Directory** is `smartfaq-web` (path gets doubled).

## Local dev

- **`vercel env pull`** from the linked project downloads envs into `.env.local` (gitignored).
- Or use **`.data/`** JSONL only: leave `KV_*` unset and the app uses the filesystem.
