# Forgeboard

The organized workspace for engineering teams. ENGR 310 class SaaS project by Luke Osman.

## Run locally

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build (what Vercel runs)
```

## Structure

- `src/app/layout.tsx` – page title, meta description, fonts
- `src/app/page.tsx` – assembles the landing page sections
- `src/components/` – one component per section (Navbar, Hero, Problem, Features, HowItWorks, Pricing, About, Footer)
- `src/lib/site.ts` – shared settings (product name, builder name, nav links)

## Roadmap

- Week 2+: authentication, database, AI notes-to-action-items extraction, Stripe payments.
  New routes go under `src/app/` (e.g. `src/app/dashboard/`, `src/app/api/`). Keep secrets in `.env.local` (git-ignored).
