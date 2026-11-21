# Forgeboard

The project workspace for small engineering firms: table, board, calendar and timeline views, with AI that plans projects, turns meeting notes into tasks, decisions and risks, and writes status reports.

Built with Next.js 16 (App Router), React 19, Supabase (Postgres and Auth), Stripe, the Anthropic SDK, Tailwind 4 and Zod.

- **Where it's going:** [docs/SPEC.md](docs/SPEC.md) is the v2 build spec, in phases.
- **What has shipped:** [docs/CHANGELOG.md](docs/CHANGELOG.md), one entry per phase, with any manual setup steps.
- **Working on the code with an AI agent:** read [AGENTS.md](AGENTS.md) first. This Next.js version has breaking changes.

## What works today

- Sign up, log in, log out, forgot and reset password, email confirmation links
- Settings: profile, change email, change password, delete account
- Projects with sections, tasks, subtasks, comments, and a decisions, risks and questions log
- Five project views (overview, table, board, calendar, timeline), My Work, and Ctrl/⌘K search
- AI: extract items from pasted notes, plan a project from a description, write a status report
- Stripe subscriptions (Team and Business): checkout, webhook, billing portal
- Terms, Privacy, Security and Contact pages (legal text is a draft)
- Custom error and not-found pages, security headers, optional Sentry error monitoring

Not built yet: teams and invites, plan limits beyond AI runs, notifications, file uploads. See the spec.

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the values (each one is explained in the file)
npm run dev                  # http://localhost:3000
```

One-time Supabase setup:

1. Run every file in `supabase/migrations/` in the Supabase SQL Editor, oldest first.
2. In **Authentication → Sign In / Providers → Email**, keep **Confirm email** on.
3. In **Authentication → URL Configuration**, set the Site URL and add `<your site>/**` to the Redirect URLs, so the links in confirmation and reset emails are accepted.

Optional: `npm run seed:demo` creates or resets the demo account (`DEMO_EMAIL` / `DEMO_PASSWORD` in `.env.local`) with sample projects.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm run start` | Production build, and serve it |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types, then TypeScript |
| `npm test` | Unit tests (Vitest). No network or database needed. |
| `npm run test:db` | Database isolation tests. Needs a local Supabase (below). |
| `npm run test:e2e` | Browser tests (Playwright) against the production build. Run `npm run build` first. |
| `npm run seed:demo` | Create or reset the demo account |

## Tests

- **Unit** (`tests/unit/`): plan rules, Stripe plan mapping, AI output clean-up, account rules.
- **Database** (`tests/db/`): signs in as two users and proves neither can read, change or delete the other's rows in any table, and that each owner still can. They refuse to run against anything but a local Supabase.
- **Browser** (`tests/e2e/`): public pages, security headers, login, every project view, the error and 404 screens, and Settings. The tests that reset a password or delete an account also need a local Supabase and are skipped otherwise.

To run the database tests and the full browser suite on your machine you need Docker:

```bash
npx supabase start            # local Postgres + Auth with all migrations applied
npx supabase status -o env    # copy the URL and keys into your shell or .env.local
npm run test:db
```

GitHub Actions (`.github/workflows/ci.yml`) does all of this on every pull request: lint, typecheck, unit tests, database tests, build, then the browser tests.

## Structure

- `src/app/page.tsx` – the landing page
- `src/app/(auth)/` – login, sign-up, forgot and reset password, and their server actions
- `src/app/(legal)/` – terms, privacy, security, contact
- `src/app/auth/` – landing routes for the links in Supabase emails
- `src/app/w/[slug]/` – the signed-in app, one workspace per URL: home, My Work, projects, members, billing, settings
- `src/lib/supabase/proxy.ts` – session refresh, login redirects, and forwarding old `/dashboard/...` links to the same page in the last-used workspace
- `src/app/invite/[token]/` – the page an invite link opens
- `src/server/` – server actions (projects, tasks, comments, members and invites) and their Zod schemas
- `src/app/api/` – AI routes, Stripe checkout, billing portal and webhook
- `src/components/` – landing page sections, the app frame (`app/`) and task UI (`work/`)
- `src/lib/ai/` – `client.ts` is the only file that calls the Anthropic API; prompts and output clean-up sit beside it
- `src/lib/supabase/` – Supabase clients (browser, server, proxy, admin)
- `src/lib/plans.ts`, `src/lib/stripe.ts` – plan rules and Stripe mapping
- `src/proxy.ts` – runs on every request: refreshes the session and guards signed-in pages
- `src/instrumentation*.ts` – error monitoring start-up
- `supabase/migrations/` – tables, Row Level Security and database functions
- `scripts/seed-demo.mjs` – demo account seeder (uses the service role key)
