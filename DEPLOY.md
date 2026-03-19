# Vercel + GitHub (configured)

## What’s already done (CLI)

- **Project:** `rjain12s-projects/smartfaq` on Vercel  
- **Production URL:** [https://smartfaq.vercel.app](https://smartfaq.vercel.app)  
- **GitHub:** [github.com/RJain12/smartfaq](https://github.com/RJain12/smartfaq) is **connected** — pushes to the production branch trigger deployments.  
- **Root directory:** `smartfaq-web` (monorepo: Next.js app lives in that folder).

## Deploy from your machine (optional)

Run **`vercel deploy --prod`** from the **repository root** (`smartfq/`), not from inside `smartfaq-web/`, so Vercel doesn’t double the path:

```bash
cd /path/to/smartfq   # root that contains smartfaq-web/
npx vercel deploy --prod --yes
```

Local link metadata lives in `/.vercel/` (gitignored).

## Environment variables (production)

In [Vercel → Project → Settings → Environment Variables](https://vercel.com/rjain12s-projects/smartfaq/settings/environment-variables), add:

| Name | Purpose |
|------|--------|
| `UPSTASH_REDIS_REST_URL` | Persist responses on serverless |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash token |
| `SMARTFAQ_ADMIN_PASSWORD` | Strong admin password |
| `ADMIN_SESSION_SECRET` | Long random string for admin cookie |

Without Upstash, **submits won’t persist** in production (read-only filesystem).

## Security

If any automation or log ever exposed a Vercel token, rotate it under **Vercel → Account → Tokens**.
