# SmartFAQs

- **`smartfaq-web/`** — **Use this for Vercel.** Next.js, TypeScript, Tailwind. Run `npm run dev` → [http://localhost:3000](http://localhost:3000). No Docker, no R.
- **`smartfaq_survey/`** — Earlier R/Shiny + Redis prototype (fine for local stats workflows, not a Vercel target).

## GitHub + Vercel (auto deploy on push)

See **[DEPLOY.md](./DEPLOY.md)**. Summary: push this repo to GitHub, then in Vercel import the repo and set **Root Directory** to **`smartfaq-web`**.
