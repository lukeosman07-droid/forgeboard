# Forgeboard

The organized workspace for engineering teams. ENGR 310 class SaaS project by Luke Osman.

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev                  # http://localhost:3000
npm run build                # production build (what Vercel runs)
npm run seed:demo            # create/reset demo@demo.com with sample data
```

One-time Supabase setup: run `supabase/migrations/*.sql` in the Supabase SQL Editor,
and (for easy testing) turn off **Authentication → Sign In / Providers → Email → Confirm email**.

## Structure

- `src/app/page.tsx` – assembles the landing page sections
- `src/app/(auth)/` – `/login` and `/signup` pages plus the login/signup/logout server actions
- `src/app/dashboard/` – protected dashboard (signed-in users only)
- `src/app/auth/callback/` – handles Supabase email links (only used if email confirmation is on)
- `src/proxy.ts` – runs on every request: refreshes the login session and guards `/dashboard`
- `src/lib/supabase/` – Supabase clients (browser, server, proxy)
- `src/lib/auth.ts` – `getCurrentUser()` helper
- `src/components/` – one component per landing page section
- `src/lib/site.ts` – shared settings (product name, builder name, nav links)
- `supabase/migrations/` – database tables, Row Level Security, and the new-user trigger
- `scripts/seed-demo.mjs` – demo account seeder (uses the service role key)

## Roadmap

1. ~~Auth + database~~ (done)
2. AI notes-to-action-items extraction
3. Stripe payments
4. Polish & launch
