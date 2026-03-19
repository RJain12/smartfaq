# Deploy on Vercel (GitHub → auto deploy)

After this repo is on GitHub, connect Vercel **once**. Every push to the production branch will trigger a new deployment.

## 1. Push to GitHub

```bash
cd /path/to/smartfq
git remote add origin https://github.com/RJain12/smartfaq.git   # if not set
git push -u origin main
```

## 2. Import the repo in Vercel

1. Go to [vercel.com](https://vercel.com) → **Log in** → **Add New…** → **Project**.
2. **Import** `RJain12/smartfaq` (install the Vercel GitHub app if prompted).
3. Expand **Root Directory** → set to **`smartfaq-web`** (critical: the Next.js app lives in this subfolder).
4. Framework: **Next.js** (auto-detected).
5. **Environment variables** (production + preview if you want):

   | Name | Notes |
   |------|--------|
   | `UPSTASH_REDIS_REST_URL` | From [Upstash](https://upstash.com) — required for persistent saves on Vercel |
   | `UPSTASH_REDIS_REST_TOKEN` | Upstash token |
   | `SMARTFAQ_ADMIN_PASSWORD` | Strong password (not `aditya`) |
   | `ADMIN_SESSION_SECRET` | Long random string for admin cookie signing |

6. Click **Deploy**.

## 3. Auto deploy

With Git connected, Vercel will:

- Deploy **production** on pushes to the branch you set as Production (usually **`main`**).
- Create **preview** deployments for other branches / PRs.

No extra GitHub Action is required for the default Vercel ↔ GitHub integration.

## Troubleshooting

- **Build fails “Cannot find module”**: confirm Root Directory is **`smartfaq-web`**, not the repo root.
- **Submits don’t persist**: add Upstash env vars; Vercel cannot write the local `.data/` folder in production.
