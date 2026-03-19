# SmartFAQs

- **`smartfaq-web/`** — **Use this for Vercel.** Next.js, TypeScript, Tailwind. Run `npm run dev` → [http://localhost:3000](http://localhost:3000). Configure **Google Sheets** (and optional Upstash) per [`smartfaq-web/README.md`](./smartfaq-web/README.md). No Docker, no R.
- **`smartfaq_survey/`** — R/Shiny survey; responses go to **Google Sheets** (not a Vercel target).

## GitHub + Vercel (auto deploy on push)

Configured via Vercel CLI: **[DEPLOY.md](./DEPLOY.md)**. **Live:** [smartfaq.vercel.app](https://smartfaq.vercel.app). Push to `main` → production deploy.
