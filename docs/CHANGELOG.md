# Changelog

One entry per phase of [SPEC.md](SPEC.md): what shipped, what was skipped and why, and what Luke has to do by hand.

## Phase 0: Foundations (Nov 16, 2026)

A safety net and the missing basics. How the product works for a signed-in user is unchanged, apart from the new Settings page.

### Shipped

**Tests and CI**

- Vitest unit tests (`npm test`, 35 tests): plan helpers, Stripe plan mapping, AI output clean-up, password and redirect rules.
- Database isolation tests (`npm run test:db`): two users, every table, both directions. The owner can select, insert, update and delete; the other user and a signed-out visitor cannot. Also covers the locked `profiles` columns, the AI usage log and functions, and `delete_own_account`. Dropping a policy or turning off Row Level Security on any table fails the suite.
- Playwright browser tests (`npm run test:e2e`, 24 tests): public pages, security headers, content security policy violations, login, every project view, the error and 404 screens, Settings, password reset by email, change password, delete account.
- `supabase/config.toml` so `npx supabase start` gives a local database with every migration applied.
- GitHub Actions workflow (`.github/workflows/ci.yml`) on every pull request and on `main`: lint, typecheck, unit tests, database tests, build, browser tests.
- New scripts: `typecheck`, `test`, `test:db`, `test:e2e`.

**Error handling**

- `error.tsx`, `not-found.tsx` and `loading.tsx` at the root and in the dashboard, plus `global-error.tsx`. A crash inside the dashboard keeps the sidebar and offers Try again.
- Sentry (`@sentry/nextjs`) for server and browser errors, tagged with the user ID only (no email, no content, no tracing or replay). It stays off until `NEXT_PUBLIC_SENTRY_DSN` is set.

**Account basics**

- Forgot password and reset password pages. The reset form gives the same answer whether or not the email has an account.
- Settings page: profile (name, company), change email (current password plus a confirmation link), change password (current password required, other devices signed out), delete account (password required, Stripe subscription cancelled first).
- Minimum password length is now 10 for new and changed passwords. Existing passwords keep working.
- New migration `20261116000000_account_deletion.sql`: the `delete_own_account()` function.
- `/auth/callback` now follows a safe `?next=` path; new `/auth/confirm` route for email links that must work on a different device.
- The shared demo account's email, password and deletion are locked in the app and in the database function.

**Security and trust**

- Security headers on every response: Content-Security-Policy (self, Supabase, Stripe, Sentry), Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy. `X-Powered-By` removed.
- `/terms`, `/privacy`, `/security` and `/contact`, linked from the footer. Terms, Privacy and Security carry a "DRAFT: needs legal review" banner.
- Removed the ENGR 310 copy and the `sales@example.com` placeholder. Contact addresses come from `NEXT_PUBLIC_SALES_EMAIL`, `NEXT_PUBLIC_SUPPORT_EMAIL` and `NEXT_PUBLIC_SECURITY_EMAIL`; an unset one shows "Address coming soon". The Enterprise button now goes to `/contact`.
- The demo password is no longer in the repo. `scripts/seed-demo.mjs` reads `DEMO_EMAIL` and `DEMO_PASSWORD`.

**Code**

- `src/lib/ai/client.ts` is now the only file that calls the Anthropic API (model IDs, structured output, error messages, token and latency log). `assist.ts` and `extract.ts` use it. The output clean-up moved to `src/lib/ai/clean.ts` so it can be unit tested.
- README rewritten to match the product.

### Skipped or deferred

- **Database and account browser tests have not run yet.** They need Docker, which this machine doesn't have. They will run for the first time in GitHub Actions when this is pushed, and may need a fix then. Everything else (lint, typecheck, 35 unit tests, build, 19 browser tests) passed locally.
- **Sentry is wired but unproven end to end.** No DSN exists yet, so no error has actually been sent to Sentry. The acceptance check "appears in Sentry" needs the DSN (manual step 4), then one visit to a crashing page.
- **Avatar and time zone** in the profile wait for Phase 1, which adds those columns in the tenancy migration.
- **`withSentryConfig` and source map upload** are not set up, so Sentry stack traces will show built code. Worth adding once a Sentry project exists.
- **Content-Security-Policy keeps `'unsafe-inline'` for scripts.** A nonce would remove it but forces every page to render per request, which undoes the static landing page. Revisit in Phase 6.
- **AI token counts are logged, not stored.** The `ai_usage` table is Phase 2.
- **The demo password was not rotated.** It is out of the repo going forward but is still in git history and in the class submission. Rotation is on the launch checklist.
- **Next.js 16.4.4 has a published security advisory.** `next build` recommends upgrading (16.4.6 is current). Not done here because it wasn't in scope; it is a small, separate change.

### Manual steps for Luke

1. **Run the new migration.** Supabase → SQL Editor → paste `supabase/migrations/20261116000000_account_deletion.sql` → Run. Until then, "Delete account" shows an error and deletes nothing.
2. **Turn email confirmation on.** Supabase → Authentication → Sign In / Providers → Email → Confirm email. Existing accounts are already confirmed.
3. **Allow the email links.** Supabase → Authentication → URL Configuration: set Site URL to the live address and add `https://forgeboard-two.vercel.app/**` (and `http://localhost:3000/**`) to Redirect URLs. Without this, reset and confirmation links are rejected.
4. **Optional, for monitoring:** create a free Sentry project and add `NEXT_PUBLIC_SENTRY_DSN` in Vercel → Settings → Environment Variables.
5. **Add to Vercel when you have them:** `NEXT_PUBLIC_SALES_EMAIL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_SECURITY_EMAIL`. Also `DEMO_EMAIL` if the demo account is ever not `demo@demo.com`.
6. **Block merges on a failing check.** GitHub → Settings → Branches → add a rule for `main` → require the two CI jobs. This only bites if work goes through pull requests.
7. **Recommended in Supabase Auth settings:** minimum password length 10 and leaked-password protection (the latter needs a paid Supabase plan).
8. **Optional, for reset links that work on any device:** in Supabase → Authentication → Email Templates → Reset Password, change the link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`. With the default template the link must be opened in the browser that asked for it.

### Decisions for Luke

- None of the spec's "Decision for Luke" items fall in Phase 0.
- One new question: Supabase's built-in email sender is limited to a few messages an hour and is meant for testing. Phase 1 sets up Resend; until then, password reset and confirmation emails for real users may be throttled.
