# Changelog

One entry per phase of [SPEC.md](SPEC.md): what shipped, what was skipped and why, and what still needs Luke.

## Phase 2: Billing, plans and onboarding (Nov 22, 2026)

Billing now belongs to the workspace, every plan limit is enforced by the database, and a new signup gets a guided start with a filled-in sample project.

### Shipped

**Database** (`supabase/migrations/20261121000000_billing.sql`)

- Plans per workspace: trial (14 days), Starter, Team, Business, Enterprise. One function, `plan_limits()`, holds every limit: seats (5 / 5 / 15 / 50), AI runs per month (50 / 300 / 1,500 / 5,000), storage (1 / 5 / 50 / 250 GB) and feature gates (file AI and registers from Team, workload from Business). `workspace_limits()` returns the limits with current usage for the app.
- Read-only mode, worked out from dates so nothing has to run on a schedule: a trial past its end, an ended subscription, or a failed payment past its 7-day grace period. Everyone can still read and export; nothing can be created, changed or invited until a plan is paid. Enterprise is never read-only.
- Seat limit counts members plus pending invites; the 6th seat on Starter is refused. Guests stay free.
- `ai_usage` replaces `ai_extraction_events` (old rows copied; the old table stays for one release). AI runs are counted per workspace per calendar month; failed and empty runs are given back; 30 runs per person per hour still applies. Owners and admins can read the log.
- `stripe_events`: each Stripe event is handled once. `sync_workspace_subscription`, `record_payment_failed` (grace counts from the first failure and is never extended) and `record_payment_succeeded` are callable only by the server.
- `delete_workspace`: owner only, the name typed to confirm, refused while a subscription is live. Deleting an account is also refused until billing is canceled (the app cancels it first).
- The Phase 1 trigger copying billing from the profile to the workspace is removed.

**Billing**

- Checkout, the billing portal and plan changes all work per workspace and only for its owner. Monthly or annual for each plan. Switching plans with an existing subscription changes it in place with proration instead of starting a second one.
- Webhook handles `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_failed` and `invoice.paid`. It always re-reads the subscription from Stripe, so late or out-of-order events still end correct. A failed payment emails the owner.
- Billing page: plan and status, renewal date, meters for seats, AI runs and storage, plan picker, invoice history, and a list of who to remove when a workspace has more people than a smaller plan allows. Non-owners see the plan and are told to ask the owner.
- Banners across the app for a trial ending (last 3 days), a failed payment, too many people for the plan, and read-only. The sidebar badge shows trial days left. Upgrade prompts on the 6th invite and when AI runs run out.
- Pricing page rewritten: monthly/annual toggle, Starter/Team/Business/Enterprise, a full comparison table and an FAQ (what counts as a seat, what happens after the trial, export, where data is stored, AI training).

**Onboarding and export**

- New workspaces start at `/w/<slug>/onboarding`: name the workspace, start a project (sample, template or AI plan), invite the team. The sample project ("Sample: Pump Station Retrofit") has a schedule, decisions, risks, a question and the meeting notes they came from.
- Setup checklist on the workspace for admins until it's done or dismissed.
- CSV export of any project (from its overview), and a ZIP of CSVs for the whole workspace (Settings, owners and admins). Exports work while read-only.
- Settings: delete a workspace (owner, typed name, subscription canceled first).

**Tests**

- New `tests/db/billing.test.ts`: trial limits, members can't change billing, read-only on day 15 and unlock on payment, canceled subscription, 6th Starter seat refused, grace period and its end, a replayed Stripe event changes nothing, AI run counting and limits, workspace deletion.
- New `tests/e2e/onboarding.spec.ts`: signs up, confirms the email, goes through onboarding to the sample project, under 3 minutes.
- Unit tests for plans, prices, subscription sync, CSV escaping (including spreadsheet formulas) and the ZIP writer.

### Skipped or deferred

- **Storage limits** are in place but nothing uploads files until Phase 4, so storage use stays at 0.
- **Registers and workload** gates exist in the database but those features arrive in later phases.
- **Activity history limits** (14 / 90 / 365 days) are defined but the activity log is Phase 3.
- **Email reminders before the trial ends** need a scheduled job; the in-app banner covers it for now.
- **Old billing columns** on profiles and the old AI usage table stay for one release, unused, so a rollback is possible.
- **Tests ran in CI, not locally** (they need Docker). On `phase-2` all pass: 89 database tests, 29 browser tests (including the signup-to-sample-project run), 53 unit tests, lint, typecheck and build.
- **Paid checkout not clicked through by hand.** It needs the new Stripe prices (below).

### Deployed (Nov 22, 2026)

1. Saved a copy of every live table (`backups/pre-phase-2-...json`, not committed).
2. Ran the migration on the live database, then merged `phase-2` into `main` and pushed; Vercel deployed.
3. Re-seeded the demo (Business plan, onboarded). Checked: all 8 workspaces carried over and count as onboarded, 6 AI usage rows copied, no workspace is read-only (trials end Dec 5), the existing Team subscription is still recognized through its old price, and the new pricing page, checkout redirect, webhook and exports respond on the live site.

### Still needs Luke

1. ~~Stripe test prices and webhook events~~ Done Nov 27 by Claude: Starter, Team and Business monthly and yearly test prices created (the old $299/$799 prices stay active for the existing subscription), their IDs set in Vercel as `STRIPE_PRICE_*_MONTHLY/ANNUAL`, and the webhook now also sends `customer.subscription.created`, `invoice.payment_failed` and `invoice.paid`.
2. **Live mode, later.** Before taking real payments, repeat this in Stripe live mode and swap the live key, webhook secret and price IDs into Vercel.
3. **Billing portal (optional).** Stripe → Settings → Billing → Customer portal: allow plan switching between the six prices if you want customers to change plans there as well as in the app.
4. **Sales tax (optional).** Turn on Stripe Tax, then set `STRIPE_AUTOMATIC_TAX=true` in Vercel.

### Decisions for Luke

- Prices, limits and the 14-day trial use the spec's defaults. Annual is 10× monthly (two months free).
- Grace period after a failed payment is 7 days, counted from the first failure. During grace everything works; after it, read-only.
- When a trial or subscription ends, the workspace becomes read-only and is kept. It's never deleted automatically.
- The trial gets Business features with Starter-sized limits (5 seats, 50 AI runs, 1 GB), so people can try everything.
- Only the workspace owner sees billing details and can pay or change plans. Admins see usage.

## Phase 1: Workspaces and members (Nov 20, 2026)

Forgeboard is now multi-user. Work belongs to a workspace (a firm or team), not to one account, and people join it by invite with one of four roles.

### Shipped

**Database** (`supabase/migrations/20261117000000_workspaces.sql`)

- New tables: `workspaces`, `workspace_members` (owner, admin, member, guest; exactly one owner), `project_members` (which projects a guest can see), `workspace_invites` (7-day, single-use links; only a SHA-256 hash of the token is stored).
- Backfill: every existing account gets a workspace named after its company (or "Name's workspace") and becomes its owner. All of its projects, sections, notes, tasks, subtasks and updates move into that workspace. A paid plan and Stripe IDs are copied across; free accounts start a 14-day trial.
- Every content table has `workspace_id`, set by a trigger from the parent project, so it can't be forged. `owner_id` is renamed `created_by` (kept when an account is deleted). Tasks get `assignee_id` for a member, beside the existing free-text `assignee`.
- Row Level Security is now membership-based: members and admins read and write everything in their workspace; guests read only shared projects and can post updates; nobody outside a workspace gets a row from it. Membership and invites can only change through database functions that check the rules (who may invite, seat limits, one owner, owner can't leave, only the owner creates admins).
- Seat limits per plan: trial 5, starter 5, team 15, business 50. Pending invites hold a seat; guests are free. Up to 20 invites per workspace per day.
- New accounts get their own workspace at sign-up. Deleting an account deletes workspaces where you're the only person, and is refused while you own one that other people use.
- Each project has a PM (`manager_id`). It starts as the project's creator (existing projects: the account owner) and only admins can reassign it. Only the PM and the workspace's admins can invite guests to a project or change who it's shared with. Someone who leaves, or becomes a guest, stops being PM; their projects fall back to the admins until a new PM is named.
- Billing still lives on the profile until Phase 2; a trigger copies it to the workspace the person owns.

**App**

- All app pages moved from `/dashboard/...` to `/w/<workspace>/...`. Old links (bookmarks, emails, Stripe return URLs) forward to the same page in the workspace you used last.
- Workspace switcher at the top of the sidebar, with "Create workspace".
- Members page: everyone in the workspace with their role, change role, remove, make owner, leave, rename the workspace, seat counter, invite several emails at once, pending invites with resend and cancel.
- Invite emails through Resend with a React Email template. Without `RESEND_API_KEY`, the invite is still created and the link is shown to copy and send by hand.
- Invite page (`/invite/<token>`): shows the workspace and role, then sign up or log in with the invited address (it carries through email confirmation) and accept.
- Share dialog on each project: shows the PM (admins can change it), and lets the PM or an admin invite a guest by email or add and remove existing guests.
- Owner picker on tasks: choose a member, or type a name for someone outside the workspace. Picking a member for a typed name moves every task with that name in the project to them. AI Extract now matches names in notes to members (exact email, exact full name, or a first name only one member has).
- Guests see a read-only project: no New task, rename, delete, color or field edits, but they can post updates. Updates now show who wrote them; you can delete your own (admins any).
- Server actions are split into `src/server/` with Zod validation on every input.

**Tests**

- Database tests rewritten for workspaces: all four roles, guests before and after sharing, zero rows across workspaces for every table, cross-workspace links and moves, invites (preview, wrong email, single use, cancel), the PM rule (only the PM or an admin shares; only admins pick the PM; the PM must be a member), seat limits, removal keeping task names, ownership transfer, account deletion.
- Browser tests use the new URLs, cover the `/dashboard` redirect and the Members page, and a new `invite.spec.ts` runs the acceptance flow: A invites B, B accepts and sees A's projects; A shares one project with guest G, who sees only it and can't edit.

### Skipped or deferred

- **Tests ran in CI, not locally** (they need Docker). On the `phase-1` branch all pass: 75 database tests, 28 browser tests, 35 unit tests, lint, typecheck and build. CI now also runs on pushes to `phase-*` branches, so a phase is tested before a pull request exists.
- **Not clicked through by hand.** The local app uses the hosted database, which doesn't have this migration yet. The browser tests cover the main flows against a local database in CI.
- **Signing up from an invite still creates a personal workspace** for the new person, next to the one they joined. Harmless, but could be skipped later.
- **Avatars and time zone** have columns but no settings UI yet.
- **Billing per workspace** (moving Stripe off the profile) is Phase 2.

### Deploying (Claude does this once it has database access)

1. Save a copy of every table in the live database to a local file.
2. Run `supabase/migrations/20261117000000_workspaces.sql` on the live database, then straight away merge `phase-1` into `main` and push (Vercel deploys). The old code stops working once the migration runs, so these go back to back.
3. Re-seed the demo (`npm run seed:demo`) and check that the 4 existing accounts each have one workspace and still see their projects.

### Still needs Luke

1. **Database access for Claude, once:** sign in to the Supabase plugin (`/mcp` in a terminal running `claude`), or add `SUPABASE_DB_URL` (Supabase → Project Settings → Database → Connection string, URI) to `.env.local`.
2. **Email (optional but recommended):** create a free Resend account and verify a domain you own. Then Claude can add `RESEND_API_KEY` and `EMAIL_FROM` (for example `Forgeboard <invites@yourdomain.com>`) to Vercel. Until then invites show a link to send by hand.
3. **Allow the invite redirect:** Supabase → Authentication → URL Configuration → Redirect URLs must include `https://forgeboard-two.vercel.app/**` (step 3 of Phase 0) so confirmation links can return to an invite.

### Decisions for Luke

- Seat limits use the spec's numbers (trial and starter 5, team 15, business 50). Guests are free and unlimited.
- Only the owner can create admins (by invite or role change); admins manage members and guests.
- Guests are brought in only by the project's PM or an admin, not by every member (Luke, Nov 21). Each project has an assigned PM: its creator by default, reassignable by admins.

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

- Next.js upgraded from 16.4.4 to 16.4.6 (Nov 17) because 16.4.4 has a published security advisory. `eslint-config-next` moved with it.

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
