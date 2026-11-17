# Forgeboard v2 – Build Spec for Claude Code

Nov 16, 2026 · @Luke

## 1. How to use this spec

This spec turns Forgeboard from a single-user class project into a multi-user product that a small engineering firm can pay for and rely on. It is written for Claude Code working in the `lukeosman07-droid/forgeboard` repo, audited at commit `a946eae` (Nov 12, 2026).

Save this document as `docs/SPEC.md` in the repo, then start Claude Code with: "Read docs/SPEC.md and AGENTS.md. Build Phase 0, stop, and show me the result before starting Phase 1."

Rules for Claude Code:

1. Work one phase at a time, in the order in section 9. Do not start a phase until the previous phase's acceptance criteria pass.
2. Read `AGENTS.md` first. This repo runs Next.js 16.4 with breaking changes (`src/proxy.ts` replaces middleware, `cacheComponents` is on). Check `node_modules/next/dist/docs/` before using any Next.js API from memory.
3. Keep the existing stack: Next.js App Router, React 19, Supabase (Postgres, Auth, Storage, Realtime), Stripe, Anthropic SDK, Tailwind 4, Zod. Add a dependency only when this spec names it or there is no reasonable way to do the work without one.
4. Every schema change is a new timestamped file in `supabase/migrations/`. Never edit an applied migration. Every new table gets Row Level Security in the same migration.
5. All authorization lives in the database (RLS and `security definer` functions). Server actions and API routes validate input with Zod and never trust IDs, plan names or task data sent by the browser.
6. Every phase ships with tests (section 7) and leaves `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` passing.
7. Do not delete working features. Migrate existing data forward; the four existing accounts and their projects must survive every migration.
8. Never commit secrets. New environment variables go in `.env.example` with a comment.
9. Where this spec says "Decision for Luke", use the stated default and list the question in the phase summary. Do not block on it.
10. At the end of each phase, write a short summary in `docs/CHANGELOG.md`: what shipped, what was skipped and why, and any manual steps Luke must do in the Supabase, Stripe or Vercel dashboards.

Definition of done for the whole project: a new firm can sign up, invite colleagues, run shared projects, pay per the pricing page, and get what the pricing page promises, with no step that needs Luke to touch the database.

## 2. Product positioning

Forgeboard is the project workspace for small engineering firms (5 to 50 people) that turns meetings, emails and documents into owned, dated, traceable work. Build every feature to serve that sentence; cut anything that does not.

**Customer.** Civil, mechanical, MEP and structural consultancies, design-build shops, and in-house engineering teams. The buyer is a principal or engineering manager who runs 5 to 30 active projects from spreadsheets, email and memory. The existing templates (engineering design, construction) and the landing page already point here.

**Problem.** Project knowledge is scattered. Action items die in meeting notes, decisions get re-argued, and nobody can show a client what was agreed and when. General tools (Asana, monday.com, ClickUp) do not know what an RFI, a submittal or a design review is. Industry tools (Monograph, Part3, Procore) are built around billing or construction administration and cost far more to adopt.

**Why Forgeboard wins.** Three things, in this order:

1. **Capture is automatic.** Paste notes, forward an email, or upload a PDF, and AI proposes tasks, decisions, risks and questions with the source quote attached. The user reviews and accepts. The source quote on every item is the trust feature: show it wherever the item appears.
2. **It speaks engineering.** RFI, submittal and design-review registers, a decision log, and a risk register are built in, not built by the customer from custom fields.
3. **One flat price per firm.** Competitors charge per seat and meter AI by credits. Forgeboard charges per company with AI included, so adding the intern or the client's PM costs nothing.

**Not building.** Time tracking, invoicing, payroll, BIM or CAD viewers, native mobile apps, and a public API. These belong to Monograph, Deltek and Procore; integrate later rather than compete.

**Decision for Luke: pricing.** The page lists Team at $299 and Business at $799 a month with no cheaper way in, which is a hard first purchase for a 6-person firm. Default to build: a 14-day full-access trial with no card, then Starter $79 (up to 5 users), Team $199 (up to 15), Business $499 (up to 50), Enterprise by quote, with annual billing at two months free. All amounts live in `src/lib/plans.ts` and Stripe, so changing them later is a config change.

## 3. Current state audit

The single-user app is solid, but the product sold on the pricing page does not exist yet: every table is scoped to one `owner_id`, so there are no teams, invites or shared projects. That gap is the first thing to fix. Findings below come from reading the repo at `a946eae`; the live site was not loaded in this audit.

**What is already good and must be kept**

- Row Level Security on every table, column-level grants on `profiles`, and `security definer` functions with an empty `search_path`.
- Stripe done correctly: signature-verified webhook as the only place plans change, subscriptions re-read from Stripe on every event, one customer per account, billing portal.
- AI usage claimed atomically in the database (`claim_ai_extraction`) with an hourly cap and refunds on failure; structured output through Zod schemas; prompt-injection guard text in every prompt.
- Five project views (table, board, calendar, timeline, overview) with drag and drop, a task drawer with subtasks and comments, My Work, a command palette, four templates, a demo seeder.

**Gaps, most serious first**

| # | Area | What the code does today | Why it blocks selling |
| --- | --- | --- | --- |
| 1 | Teams | No workspace, membership, invite or role tables. `assignee` is free text. | Pricing promises "up to 15 users" and "up to 50 users". A buyer gets one login. |
| 2 | Plan entitlements | `hasPaidAccess` is only used to lift the 3-run AI trial cap. Free accounts get every view and unlimited projects. Team and Business behave identically. | Nothing to upgrade for except AI runs. "Priority AI processing", "Templates & workload overview" and seat limits are unenforced claims. |
| 3 | Account basics | No password reset, no email change, no profile or settings page, no account deletion, no data export. README tells the operator to turn email confirmation off. | Users get locked out permanently. No way to meet a deletion or export request. |
| 4 | Notifications | No email of any kind. No in-app notifications. | Assigning work or mentioning someone does nothing. Due dates pass silently. |
| 5 | Collaboration | No realtime updates, no @mentions, comments cannot be edited, no activity history, no file attachments. | Two people on one project overwrite each other and cannot share a drawing. |
| 6 | Engineering depth | Items are action items, decisions, risks and questions only. No dependencies, milestones, recurring tasks, custom fields, RFIs or submittals. | Nothing a generic tool lacks; the niche claim is only in the copy. |
| 7 | AI input | Paste-only text, 30,000 characters, into one project. | Real inputs are PDFs, email threads and recordings. |
| 8 | Quality | No tests, no CI, no `error.tsx`, `not-found.tsx` or `loading.tsx`, no error monitoring, no analytics. | Regressions ship unseen; a crash shows the default Next.js error page. |
| 9 | Legal and trust | No Terms, Privacy Policy, security page or cookie notice. `salesEmail` is `sales@example.com`. Landing page says "class project for ENGR 310". Demo password is in the public repo and the submission doc. | A firm cannot sign up for a product with no terms, and the About section tells them it is homework. |
| 10 | Scale and search | Home and My Work load every task for the account with no pagination. Search is `ILIKE` on titles only, capped at 8 results. | Slows with real data; cannot find a decision by its text. |
| 11 | Hardening | No security headers or CSP in `next.config.ts`. No rate limit on auth or write actions beyond Supabase defaults. Webhook has no event idempotency table. `past_due` removes access instantly with no grace period. | Avoidable risk, and a failed card locks a paying firm out mid-project. |
| 12 | Docs drift | README roadmap still lists AI and Stripe as future work. | Misleads any contributor, including Claude Code. |

## 4. Competitive research

General work tools are cheap per seat but meter AI and know nothing about engineering; engineering tools know the domain but cover billing or construction administration, not day-to-day project tracking. Forgeboard fits between them. Prices are list prices per month on annual billing, as reported by the linked pages on the dates they give.

| Product | Price | What it does well | Where it leaves room |
| --- | --- | --- | --- |
| [monday.com](https://www.withorb.com/pricing-atlas/monday) | $9, $12, $19 per seat; paid plans start at 3 users | Polished boards, automations, many views | AI limited to 1,000 to 3,000 credits a month by plan; no engineering concepts |
| [Asana](https://www.withorb.com/pricing-atlas/asana) | $10.99 and $24.99 per user | Timelines, portfolios, unlimited free guests on Starter | AI capped at 5 requests per user a month, 50 per account on Starter and Advanced |
| [ClickUp](https://academy.techpresso.co/reviews/is-clickup-brain-worth-it) | $9 and $17 per user; Max at $100 | AI assistant, meeting notetaker and AI fields in every plan | Pooled AI credits; the whole workspace is billed whether or not people use AI |
| [Monograph](https://thedigitalprojectmanager.com/tools/monograph-review/) | From $45 a month | Built for architecture and engineering firms: phases, budgets, time tracking, invoicing | Reviewer notes basic report customization, a limited mobile app and few integrations |
| [Part3](https://softwarefinder.com/construction/part3) | $150 to $200 a month for 5 users | Construction administration: AI checks submittals against specs, field reports, change orders | Reviewers cite long manual setup and awkward markup; nothing for the design phase or internal tasks |

AI meeting assistants such as Fireflies and Fellow are a third group: they record calls and push action items into a tracker, but they are a second subscription and the items land without project context.

**What to take from each**

- From monday.com and Asana: saved views with filters, automations ("when status changes to Stuck, notify the owner"), guests who do not count as seats, forms that create tasks.
- From ClickUp: an assistant that answers questions from the workspace's own tasks and notes ("what did we decide about the pump sizing?").
- From Monograph: project phases with a workload view across people, so a manager sees who is overbooked.
- From Part3: RFI and submittal registers with a ball-in-court owner, a due date and cycle-time tracking, plus AI that reads the attached document.
- From the meeting assistants: accept audio and transcript uploads, and an inbound email address per project.

**Where Forgeboard is different**

- Flat price per firm with AI included, against per-seat pricing with AI credits.
- Engineering registers ship ready to use, against weeks of custom-field setup.
- Every AI-created item keeps its source quote and a link to the source document, so a decision can be traced in a dispute.

## 5. Target feature set

P0 is what makes the product honest and sellable, P1 is what makes a firm choose it over Asana, and P2 waits for paying customers to ask. Build in that order; the phase that delivers each item is in the last column.

**P0: required before charging anyone**

| Feature | Behavior | Phase |
| --- | --- | --- |
| Workspaces | Each firm is a workspace. Signing up creates one. All projects, tasks, notes and billing belong to the workspace, not a person. A user can belong to several and switch between them. | 1 |
| Members and roles | Owner (billing, delete workspace), Admin (members, settings), Member (create and edit work), Guest (only the projects they are added to, read and comment, free, not counted as a seat). | 1 |
| Invites | Invite by email with a role. Signed, single-use link valid 7 days. Works for people with and without an account. Resend and revoke. Seat limit enforced when the invite is sent and when it is accepted. | 1 |
| Real assignees | `assignee` becomes a member reference. Keep a text fallback for external names found by AI ("Unassigned", "Contractor"), with one click to map a name to a member. | 1 |
| Workspace billing | Subscription, plan and AI usage move from `profiles` to `workspaces`. Trial is 14 days of full access. Plans gate seats and features per the entitlement table in section 6. | 2 |
| Account basics | Forgot and reset password, change email, change password, profile (name, avatar, time zone), delete account, leave workspace, transfer ownership. Email confirmation on. | 0 |
| Transactional email | Invite, password reset, email confirm, assigned to you, mentioned, due tomorrow and overdue digest, payment failed, trial ending in 3 days. Per-user notification preferences. | 3 |
| In-app notifications | Bell with unread count; assignment, mention, comment on your task, status change on tasks you own. Mark read, mark all read. | 3 |
| Legal and trust pages | Terms, Privacy, Security, Contact. Real sales and support addresses. Remove "class project" copy. Cookie-free analytics so no banner is needed. | 0 |
| Error handling | `error.tsx`, `not-found.tsx`, `loading.tsx` at root and dashboard; toast on every failed action with a retry; error monitoring. | 0 |
| Data export and deletion | Export a project to CSV and the whole workspace to a ZIP of CSV plus attachments. Owner can delete the workspace; deletion cancels the subscription first. | 2 |

**P1: reasons to choose Forgeboard**

| Feature | Behavior | Phase |
| --- | --- | --- |
| Realtime | Task, comment and section changes appear for everyone viewing the project within 2 seconds. Presence avatars on the project header. | 3 |
| Comments | @mentions with autocomplete, edit and delete own comment, Markdown, attachments. | 3 |
| Activity log | Every change to a task (who, what, old and new value, when) shown in the drawer and in a project feed. Also the audit trail for disputes. | 3 |
| File attachments | Upload to tasks, registers and notes; drag and drop; preview images and PDFs; 25 MB per file; storage quota per plan. | 4 |
| AI from documents | Extract from PDF, DOCX, email (.eml or pasted) and audio or transcript uploads, with the source file linked to every item created. | 4 |
| Project inbox | Each project gets an address such as `p-7f3k@in.forgeboard.app`. Forwarded emails become notes with attachments, ready for one-click AI Extract. | 4 |
| Ask Forgeboard | Chat panel that answers from the workspace's tasks, decisions, notes and registers with links to the items it used. Respects project permissions. | 4 |
| RFI register | Number, subject, question, asked by, ball-in-court, date required, response, status (draft, open, answered, closed), linked tasks and files, days open. | 5 |
| Submittal register | Number, spec section, description, from, reviewer, received, due, action (approved, approved as noted, revise and resubmit, rejected), revision history. | 5 |
| Design reviews and milestones | Milestones on the timeline (30%, 60%, 90%, IFC). A review collects comments as items with a disposition and a close-out check. | 5 |
| Dependencies | Finish-to-start links between tasks, shown on the timeline, with a warning when a date change breaks one. | 5 |
| Saved views and filters | Filter and sort by assignee, status, priority, due date, section, type; save a view per project; share its URL. | 5 |
| Workload | Across all projects: open tasks per person per week, with overdue highlighted. Business plan. | 5 |
| Weekly report | AI status report generated every Monday per project and emailed to chosen recipients, including guests. Shareable read-only link. | 4 |
| Custom templates | Save any project as a template for the workspace. Business plan. | 5 |
| Onboarding | First-run checklist: name the workspace, create a project from a template or AI plan, paste notes, invite a colleague. Sample project preloaded. | 2 |

**P2: later, only on customer demand**

Recurring tasks, custom fields, automations, forms that create tasks, calendar sync (ICS feed first), Slack and Teams notifications, Google and Microsoft sign-in, SSO, time tracking, a public API, native mobile apps.

## 6. Architecture and data model

The core change is moving ownership from the user to the workspace: every row gains a `workspace_id`, and every RLS policy changes from "is this my row" to "am I a member of this row's workspace with a sufficient role". Everything else builds on that.

### Tenancy

```sql
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique,
  created_by uuid not null references auth.users (id),
  plan text not null default 'trial'
    check (plan in ('trial','starter','team','business','enterprise')),
  subscription_status text,              -- mirrors Stripe: active, past_due, canceled...
  trial_ends_at timestamptz not null default now() + interval '14 days',
  grace_ends_at timestamptz,             -- set when a payment fails
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  storage_bytes_used bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner','admin','member','guest')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','member','guest')),
  token_hash text not null unique,       -- store a SHA-256 hash, never the token
  invited_by uuid not null references auth.users (id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz
);

-- Guests see only the projects listed here. Members see every project.
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (project_id, user_id)
);
```

Authorization helpers, all `security definer`, `stable`, `set search_path = ''`, executable by `authenticated`:

- `is_workspace_member(ws uuid) returns boolean`
- `workspace_role(ws uuid) returns text`
- `can_read_project(p uuid) returns boolean`: member of the workspace with role above guest, or listed in `project_members`
- `can_write_project(p uuid) returns boolean`: as above, excluding guests, and false when the workspace is read-only (trial expired, or grace period over)

Every policy on `projects`, `sections`, `items`, `subtasks`, `item_comments`, `notes` and all new tables calls these helpers. Guests may insert comments only. Use helpers rather than inline subqueries so policies stay readable and avoid recursive RLS on `workspace_members`.

### Migrating existing data

One migration, in a transaction:

1. Create the tables above.
2. For each row in `profiles`, create a workspace named from `company_name` (fallback: "`full_name`'s workspace"), copy `plan`, `subscription_status` and both Stripe IDs, and add the user as `owner`. Map `free` to `trial` with `trial_ends_at = now() + 14 days`.
3. Add `workspace_id` to `projects`, `sections`, `notes`, `items`, `subtasks`, `item_comments` and `ai_extraction_events`; backfill from the owner's workspace; set `not null`; index it.
4. Rename `owner_id` to `created_by` on those tables. Add `assignee_id uuid references auth.users` to `items` and keep `assignee` as the text fallback.
5. Drop the old owner-based policies and create the membership-based ones.
6. Leave the Stripe and plan columns on `profiles` for one release, unused, then drop them in a later migration.

Add `profiles.avatar_url`, `profiles.time_zone` and `profiles.last_workspace_id`.

### New tables by phase

| Table | Purpose | Phase |
| --- | --- | --- |
| `stripe_events` | Processed webhook event IDs, for idempotency | 2 |
| `ai_usage` | One row per AI call: workspace, user, feature, model, input and output tokens, status. Replaces `ai_extraction_events` and `profiles.ai_extractions_used`. | 2 |
| `activity` | Workspace, project, item, actor, verb, JSON diff, timestamp. Written by a trigger on `items` and by server actions. | 3 |
| `notifications` | Recipient, type, item or comment reference, read timestamp | 3 |
| `notification_prefs` | Per user and workspace: email and in-app switches per type, digest hour | 3 |
| `attachments` | Workspace, project, parent type and ID, storage path, name, size, MIME type, uploader | 4 |
| `documents` | An uploaded or emailed source: extracted text, AI summary, origin (upload, email, paste). `notes` rows migrate into it. | 4 |
| `project_inboxes` | Random address token per project | 4 |
| `rfis`, `submittals`, `reviews`, `milestones` | Engineering registers, each with a per-project running number | 5 |
| `item_dependencies` | Predecessor and successor item IDs, unique pair, no self-links, cycle check in a trigger | 5 |
| `saved_views` | Project, name, JSON filter and sort, creator, shared flag | 5 |
| `templates` | Workspace-owned project plans in the existing `ProjectPlan` shape | 5 |

Add a generated `tsvector` column with a GIN index on `items` (title, details), `item_comments` (body), `documents` (text) and the registers, and replace the `ILIKE` search with one `search_workspace(ws, query)` function that returns ranked, typed results.

### Plan entitlements

One source of truth in `src/lib/plans.ts`, mirrored by a SQL function `workspace_limits(ws)` so the database enforces what the UI shows.

|  | Trial (14 days) | Starter | Team | Business |
| --- | --- | --- | --- | --- |
| Seats (guests are free) | 5 | 5 | 15 | 50 |
| AI runs per month | 50 | 300 | 1,500 | 5,000 |
| Storage | 1 GB | 5 GB | 50 GB | 250 GB |
| Views, tasks, decisions, risks | Yes | Yes | Yes | Yes |
| File and email AI, project inbox, Ask Forgeboard | Yes | No | Yes | Yes |
| RFI and submittal registers, dependencies | Yes | No | Yes | Yes |
| Workload, custom templates, scheduled reports | Yes | No | No | Yes |
| Activity history | 14 days | 90 days | 1 year | Unlimited |

When a trial ends without a subscription, or 7 days after a failed payment, the workspace becomes read-only: everything stays visible and exportable, nothing can be created or edited, and a banner links to billing. Never delete data for non-payment.

### Server structure

- Split `src/app/dashboard/actions.ts` (536 lines) into `src/server/` modules by domain: `projects`, `tasks`, `comments`, `members`, `registers`, `files`, `search`. Each action: get session, resolve workspace, Zod-validate, call Supabase with the user's client so RLS applies, return a typed result.
- Use the service-role client only in webhooks, the inbound-email route, cron routes and the AI usage functions. Each such file starts with a comment stating why it bypasses RLS.
- Routes: `/w/[slug]/...` replaces `/dashboard/...`; redirect old URLs. Workspace slug in the URL makes links shareable and switching explicit.
- Scheduled work runs as Vercel Cron routes guarded by a `CRON_SECRET` header: due-date digest (hourly, sends at each user's local 8 am), weekly reports (Monday), trial and grace expiry (daily), storage recount (daily).
- Email through Resend with React Email templates in `src/emails/`. Point Supabase Auth's SMTP at the same sender so auth emails match.
- Files in a private Supabase Storage bucket, path `workspace_id/project_id/uuid-filename`, with storage policies that call `can_read_project` and `can_write_project`. Serve through short-lived signed URLs.
- Realtime through Supabase Realtime `postgres_changes` on `items`, `sections`, `item_comments` and `notifications`, filtered by `project_id`. The existing `task-store.tsx` becomes the single place that merges remote changes with optimistic local ones; last write wins per field, using `updated_at`.

### AI pipeline

- One module, `src/lib/ai/client.ts`, wraps the Anthropic SDK: model choice, structured output, error mapping, token accounting into `ai_usage`. Remove the duplicated `run` logic in `assist.ts` and `extract.ts`.
- Keep model IDs in one config object. Use the current Sonnet-class model for extraction, planning and reports, and a Haiku-class model for classification and titles. Check the Anthropic docs for current model IDs and structured-output API before changing the calls; do not rely on memory.
- Document extraction: PDFs go to the model as document blocks (it reads text and drawings); DOCX is converted to text server-side with `mammoth`; `.eml` is parsed with `postal-mime`; audio is out of scope until a transcription provider is chosen, so accept pasted or uploaded transcripts (`.txt`, `.vtt`, `.srt`) first.
- Long inputs: split by page or heading into chunks under the context limit, extract per chunk, then run one merge pass that removes duplicates. Raise the paste limit from 30,000 to 200,000 characters.
- Every extracted item stores `source_document_id`, `source_quote` and, for PDFs, the page number. The UI shows the quote and opens the source at that page.
- Ask Forgeboard: retrieve with `search_workspace` restricted to projects the asker can read, pass the top results as context, and require the model to cite item IDs. Render citations as links. Answer "I could not find that" when retrieval returns nothing relevant. No embeddings in the first version.
- Keep the injection guard: all user and document text goes inside tagged blocks, and the system prompt states that content inside them is data. AI never performs writes directly; it proposes, and the user accepts in the existing review panel.
- Monthly AI limits are enforced in `claim_ai_use(workspace, user, feature)`, the successor to `claim_ai_extraction`, with the same atomic claim and refund-on-failure behavior.

## 7. Security, billing and reliability

A firm will put client project data in Forgeboard, so the bar is: one tenant can never see another's data, a failed card never destroys work, and a bug is caught by a test before a customer sees it.

### Security

- **Tenant isolation tests.** A test suite that creates two workspaces and, as a member of one, attempts to select, insert, update and delete every table in the other through the anon-key client. Every attempt must return zero rows or an error. Add a case for each new table in the same pull request that creates it. Include guest cases: a guest sees only their listed projects and can only comment.
- **Role checks in the database.** Removing a member, changing roles, deleting a workspace and reading billing fields are enforced by RLS or `security definer` functions, never only in the UI. A workspace always has exactly one owner; ownership transfer is a single function.
- **Invites.** Random 32-byte token, stored hashed, single use, 7-day expiry, bound to the invited email. Accepting requires being signed in as that email.
- **Headers.** In `next.config.ts`: Content-Security-Policy (self, Supabase, Stripe), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`.
- **Rate limits.** Per-user and per-IP limits on login, signup, password reset, invite sending (20 a day per workspace), comment and task creation, uploads and search. Implement with a Postgres table and function so no extra service is needed; return 429 with a clear message.
- **Uploads.** Allow-list of MIME types (PDF, DOCX, XLSX, PNG, JPG, DWG, DXF, TXT, EML, VTT, SRT), 25 MB limit, checked server-side. Never render uploaded HTML or SVG inline. Downloads use signed URLs that expire in 5 minutes.
- **Inbound email.** Verify the provider's webhook signature. Accept mail only from addresses that belong to workspace members unless the project allows outside senders. Strip HTML to text before storing.
- **Secrets and demo.** Rotate the demo account password, move it to an environment variable used by the seed script, and make the demo workspace reset nightly. Add `CRON_SECRET`, `RESEND_API_KEY` and inbound-webhook secrets to `.env.example`.
- **Auth settings.** Turn email confirmation on. Minimum password length 10 with Supabase leaked-password protection enabled. Sessions end on password change.

### Billing

- Checkout creates the subscription for the **workspace**: `client_reference_id` and metadata carry `workspace_id`. Only owners can start checkout or open the portal.
- Prices: one monthly and one annual Stripe price per plan, IDs in environment variables. `planForPriceId` handles all of them.
- Handle these events: `checkout.session.completed`, `customer.subscription.created`, `.updated`, `.deleted`, `invoice.payment_failed`, `invoice.paid`. Record each `event.id` in `stripe_events` and skip repeats.
- `past_due` no longer cuts access at once. On `invoice.payment_failed`, set `grace_ends_at` to 7 days out, email the owner, and show a banner. On `invoice.paid`, clear it. The daily cron makes the workspace read-only when grace runs out.
- Downgrades: if the workspace has more members than the new plan allows, block the change in-app with a list of who to remove. If it happens in the Stripe portal anyway, keep everyone, block new invites, and show the owner a banner.
- Enable Stripe Tax and collect a billing address. Show plan, seats used, AI runs used, storage used, next invoice date and invoice history on the billing page.
- Before going live: create live-mode products, prices and the webhook endpoint; `findOrCreateCustomer` already handles the test-to-live customer switch.

### Reliability and quality

- **Tests.** Vitest for unit tests (`plans.ts`, date helpers, Stripe mapping, Zod schemas, AI output clamping). A database test suite run against a local Supabase (`supabase start`) for RLS and SQL functions. Playwright for end-to-end flows: sign up, create workspace, invite and accept, create a project from a template, drag a card, AI Extract with a mocked model response, checkout with Stripe test card, read-only mode after trial expiry.
- **CI.** GitHub Actions on every pull request: install, lint, typecheck, unit tests, database tests, build, Playwright against the build. Block merges on failure. Add `typecheck` and `test` scripts to `package.json`.
- **Monitoring.** Sentry for server and client errors with the user and workspace ID attached (no email or content). Vercel Analytics or Plausible for page views. Log every AI call's tokens and latency to `ai_usage`.
- **Performance.** Paginate or virtualize any list over 100 rows. Load My Work and Home with server-side filters (open tasks assigned to me, due within 30 days) instead of every task. Target under 2 seconds to interactive on a project with 500 tasks.
- **Backups.** Turn on Supabase point-in-time recovery when moving to a paid Supabase plan; document the restore steps in `docs/RUNBOOK.md`.
- **Accessibility.** Keyboard access for every action including drag and drop alternatives (move via menu), visible focus, labels on all inputs, contrast at WCAG AA. Run axe in the Playwright suite.

## 8. UX and design direction

Keep the current dark slate and orange identity and the five views; the work is filling in the screens a team needs and making the first ten minutes succeed. A new user should reach a populated project with AI-extracted tasks in under 3 minutes without reading anything.

### Screens to add or rebuild

| Screen | What it must do |
| --- | --- |
| Onboarding (new) | Three steps after signup: name the workspace; pick a template, describe a project for AI, or open the sample project; invite teammates (skippable). Then land in the project with a dismissible checklist. |
| Workspace switcher (new) | Top of the sidebar: workspace name and plan badge, list of the user's workspaces, "Create workspace". |
| Members (new) | Table of members and pending invites: name, email, role dropdown, last active, remove. Invite form takes several emails at once. Seat counter: "7 of 15 seats used". |
| Settings (new) | Tabs: Profile, Notifications, Workspace (name, logo, delete), Members, Billing, Export. |
| Inbox (new) | All notifications for the user, grouped by day, with filters for mentions and assignments. Bell in the header shows the unread count. |
| Home (rebuild) | Greeting, my tasks due this week, projects with health (on track, at risk, off track from overdue and stuck counts), recent activity across the workspace. |
| Project header (rebuild) | Name, color, member avatars with presence, Share button (add members and guests), view tabs, filter bar, saved-view picker. |
| Task drawer (extend) | Assignee picker with avatars, dependencies, attachments, activity tab beside comments, source quote with a link to the source document, @mention autocomplete. |
| Registers (new) | RFIs and Submittals as tabs beside Table and Board. Table layout with a status pill, ball-in-court avatar, days open in red past due. Row opens a drawer like the task drawer. |
| Capture (rebuild of AI Extract) | One panel with three inputs: paste text, drop files, or pick from the project inbox. Review screen keeps today's checkbox list and adds assignee matching and duplicate warnings ("similar to existing task: ..."). |
| Ask Forgeboard (new) | Slide-over chat from the command palette and a header button. Answers show cited items as chips that open the drawer. |
| Workload (new) | People down the side, weeks across, task count per cell with color by load; click a cell to see and reassign tasks. |
| Read-only and limit states (new) | Banner for trial ending, trial ended, payment failed; inline upgrade prompt where a gated feature would be, stating the plan that unlocks it. |

### Interaction rules

- Optimistic updates everywhere, with an undo toast for delete and for drag moves.
- Every list has a designed empty state with one primary action and one sentence of guidance.
- Skeleton loaders that match the final layout; no spinners on full pages.
- Keyboard: `Cmd/Ctrl+K` palette (exists), `C` new task, `/` search, `Esc` close drawer, arrow keys in the table, `?` shows the shortcut list.
- Destructive actions need a typed confirmation only for workspace and project deletion; everything else uses undo.
- Dates display in the user's time zone from `profiles.time_zone`; store dates as `date` and timestamps as `timestamptz`, as now.
- Mobile (360 px and up): the sidebar collapses (exists); board and list views work by touch; table view falls back to a card list; timeline shows a notice suggesting a wider screen. No horizontal scroll on any page except the timeline.
- Add a light theme behind a toggle only after everything else ships; do not let it delay launch.

### Marketing site

- Rewrite the landing page for the customer in section 2. Headline about engineering firms, not generic work management. Show a real screenshot or short screen recording of notes becoming tasks instead of the mock.
- Replace the "About the builder" section with a short founder note and a contact address. Remove the ENGR 310 line.
- Pricing page: monthly and annual toggle, the entitlement table from section 6, an FAQ (what counts as a seat, what happens after the trial, can I export my data, where is data stored, is my data used to train AI).
- Add `/security`, `/terms`, `/privacy`, `/contact`, a public changelog, `sitemap.xml`, `robots.txt` and Open Graph images.
- Replace the shared demo login with a "Try the demo" button that opens a read-only sample workspace without credentials.

## 9. Phased build plan

Seven phases, each shippable on its own; the product can be sold honestly at the end of Phase 3 and is competitive at the end of Phase 5. Do them in order, because each depends on the one before.

### Phase 0: Foundations

Goal: a safety net and the missing basics, with no change to how the product works.

- Add Vitest, Playwright, a local Supabase test setup, and the GitHub Actions workflow from section 7. Write tests for what exists: plan helpers, Stripe mapping, AI output clamping, and RLS isolation between two users.
- Add `error.tsx`, `not-found.tsx` and `loading.tsx` at root and dashboard level. Add Sentry.
- Add forgot-password and reset-password pages, a Settings page (profile, change email, change password, delete account), and turn email confirmation on.
- Add security headers. Add `/terms`, `/privacy`, `/security`, `/contact` with placeholder text clearly marked "DRAFT: needs legal review".
- Remove the ENGR 310 copy and the `sales@example.com` placeholder (read addresses from environment variables). Move the demo password to an environment variable. Update the README to match reality.
- Unify the two AI wrappers into `src/lib/ai/client.ts`.

Accept when: CI is green on a pull request; a user can reset a forgotten password end to end; a thrown error in a dashboard page shows the custom error screen and appears in Sentry; the RLS test fails if any policy is dropped.

### Phase 1: Workspaces and members

Goal: several people share one workspace.

- Run the tenancy migration in section 6, including the backfill. Rewrite every policy to use the helper functions.
- Move routes to `/w/[slug]/...` with redirects. Add the workspace switcher and "Create workspace".
- Build Members: invite by email (set up Resend and the invite template), accept flow for new and existing users, role changes, removal, leave, ownership transfer.
- Add guests and `project_members`, with the Share dialog on the project header.
- Replace the free-text assignee with a member picker; keep the text fallback and a "map to member" action. AI Extract matches extracted names to members by name and email.
- Extend isolation tests to two workspaces, all four roles and guests.

Accept when: user A invites user B, B accepts and sees A's projects; a guest sees one project and cannot edit tasks; a member of workspace X gets zero rows from workspace Y for every table; all four pre-existing accounts still see their projects.

### Phase 2: Billing, entitlements and onboarding

Goal: the pricing page is true.

- Move billing to the workspace. Add the Starter plan, annual prices, the 14-day trial, the grace period and read-only mode. Add `stripe_events` idempotency and the extra webhook events.
- Implement `workspace_limits` and enforce seats, AI runs, storage and feature gates in the database and the UI. Replace `ai_extraction_events` with `ai_usage`.
- Rebuild the billing page per section 7. Add upgrade prompts and the trial and payment banners.
- Build onboarding, the sample project and the checklist.
- Add CSV export per project and the workspace ZIP export. Add workspace deletion.
- Rewrite the pricing section and FAQ.

Accept when: a trial workspace turns read-only on day 15 and unlocks on payment; a 6th invite on Starter is refused with an upgrade prompt; replaying the same Stripe event twice changes nothing; a failed payment starts a 7-day grace period; a new signup reaches a populated project in under 3 minutes in the Playwright run.

### Phase 3: Collaboration

Goal: a team can work together without email or chat on the side.

- Realtime on tasks, sections and comments, with presence.
- Activity log trigger and UI. Comment editing, Markdown and @mentions.
- Notifications table, bell, Inbox page, and preferences.
- Emails: assigned, mentioned, daily due digest, trial ending, payment failed. Cron routes with `CRON_SECRET`.
- Full-text search across tasks, comments and notes, replacing the `ILIKE` search in the command palette.

Accept when: two browsers on one project see each other's edits within 2 seconds; mentioning a user creates one notification and one email and respects their preferences; the task drawer shows who changed the due date and when; search finds a task by a word in a comment.

### Phase 4: Files and AI capture

Goal: any document or email becomes tracked work.

- Attachments with storage policies, previews and quota accounting.
- `documents` table; migrate `notes` into it. PDF, DOCX, EML and transcript extraction with chunking and a merge pass. Source quote and page on every item.
- Project inbox address with an inbound-email webhook route.
- Capture panel rebuild with duplicate detection against existing open tasks.
- Ask Forgeboard with citations.
- Weekly AI report on a schedule, emailed, with a read-only share link that expires.

Accept when: a 40-page PDF of meeting minutes yields tasks that each open the source at the right page; an email forwarded to the project address appears as a document within a minute; Ask Forgeboard answers a question about a recorded decision with a working citation and refuses to reveal items from a project the asker cannot read; uploading past the storage quota is refused with a clear message.

### Phase 5: Engineering depth

Goal: the product does things a general tool does not.

- RFI and submittal registers with numbering, ball-in-court, due dates, status flow, attachments, linked tasks, CSV and PDF log export.
- Milestones and design reviews. Dependencies on the timeline with conflict warnings.
- Filters, sorting and saved views across table, board and calendar.
- Workload view. Custom templates. Add templates for MEP design, structural design, site and civil, and product development (NPI).
- AI helpers on registers: draft an RFI from a highlighted question; summarize a submittal PDF against a pasted spec section and list deviations for the reviewer to confirm.

Accept when: an RFI can be created from an extracted question in two clicks and shows days open; changing a predecessor's date flags its successors; a saved view reloads with the same filters from its URL; the workload view matches a manual count on the seeded data.

### Phase 6: Launch polish

Goal: ready for strangers.

- New landing page, screenshots, demo workspace, changelog, SEO files.
- Accessibility pass with axe at zero serious violations. Mobile pass at 360 px.
- Performance pass against the 500-task target. Load test the AI and webhook routes.
- Help docs: ten short articles covering setup, inviting, capture, registers, billing and export, linked from a help menu.
- `docs/RUNBOOK.md`: deploy, rollback, restore from backup, rotate keys, handle a Stripe dispute, delete a customer's data on request.

Accept when: Lighthouse scores are 90 or higher for performance and accessibility on the landing page and the project page; every item in section 10 is checked.

## 10. Launch checklist

These are the steps Claude Code cannot do, because they need Luke's accounts, money or judgment. None of them blocks building; all of them block taking a real payment.

**Business and legal**

- [ ] Form a legal entity (an LLC is typical) and open a business bank account before accepting live payments.
- [ ] Have Terms of Service and a Privacy Policy written or reviewed by a lawyer; replace the drafts from Phase 0.
- [ ] Decide final pricing (section 2) and whether to offer a founding-customer discount.
- [ ] Check with Penn State whether a project started in ENGR 310 carries any university IP or course-policy conditions before commercializing it.

**Accounts and infrastructure**

- [ ] Buy a domain and point it at Vercel; set `NEXT_PUBLIC_SITE_URL`. Add an `in.` subdomain for inbound email.
- [ ] Verify the domain with the email provider (SPF, DKIM, DMARC) and create `support@`, `sales@` and `security@` addresses.
- [ ] Activate the Stripe account for live mode; create live products, prices and the webhook; turn on the Customer Portal and Stripe Tax.
- [ ] Move Supabase to a paid plan with point-in-time recovery; rotate the service-role key and the demo password.
- [ ] Set a monthly spending limit and alert on the Anthropic account.
- [ ] Create Sentry and analytics projects and add their keys in Vercel.

**Before the first customer**

- [ ] Run a restore drill from a backup once and time it.
- [ ] Ask two or three engineers at real firms to use it for a week on a live project; fix what stops them.
- [ ] Write down the support promise (hours, response time) and put it on the contact page.
- [ ] Confirm the AI data statement in the Privacy Policy matches Anthropic's current API data-use terms.

**Open decisions carried from this spec**

- Pricing tiers and trial length (section 2).
- Whether outside senders may email a project inbox by default (section 7; default is no).
- Transcription provider for audio uploads (section 6; default is transcripts only).

## Sources

Competitor prices and features come from third-party pages, not the vendors' own pricing pages; confirm on the vendor site before quoting them in marketing.

- [Forgeboard repository](https://github.com/lukeosman07-droid/forgeboard), commit `a946eae`, read in full for section 3
- [How monday.com prices](https://www.withorb.com/pricing-atlas/monday), Orb Pricing Atlas, captured Sep 18, 2026
- [How Asana prices](https://www.withorb.com/pricing-atlas/asana), Orb Pricing Atlas, captured Nov 2, 2026
- [Is ClickUp Brain worth it in 2026?](https://academy.techpresso.co/reviews/is-clickup-brain-worth-it), AI Academy, Nov 5, 2026
- [Monograph review](https://thedigitalprojectmanager.com/tools/monograph-review/), The Digital Project Manager
- [Part3 overview, pricing and reviews](https://softwarefinder.com/construction/part3), Software Finder
