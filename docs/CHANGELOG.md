# Changelog

One entry per phase of [SPEC.md](SPEC.md): what shipped, what was skipped and why, and what still needs Luke.

## Phase 5: Engineering depth (Nov 27, 2026)

Projects now have RFI and submittal registers, milestones and design reviews, and tasks can wait on each other. Change a date and anything that waits on it is flagged right away. Tasks can be filtered, sorted and saved as named views you can link to. A workload page shows who has what due each week. There are four new built-in templates, and you can save any project as a template. Two new AI helpers draft an RFI from a highlighted question and check a submittal against a spec section.

### Shipped

**Database** (`supabase/migrations/20261130000000_engineering.sql`)

- **RFIs.** Numbered per project (RFI-001, ...). Status goes draft → open → answered → closed, and the database records when each step happened, so days open can't be faked. Ball in court is a member or a named outside party. Each RFI can point to the question it came from.
- **Submittals.** Numbered per project, with spec section, submitted by, reviewer, received, due and returned dates, and an action: pending, approved, approved as noted, revise and resubmit, or rejected. Only "revise and resubmit" or "rejected" can start the next revision. The old revision is then kept in `submittal_revisions`, and the new one starts as pending.
- **Milestones and design reviews.** A review can belong to a milestone. Its comments are tasks with a disposition: pending, incorporate, no change, rejected or deferred. A review closes only when every comment has a disposition and every comment marked "incorporate" is done. Comments stay out of the task views and workload until someone marks them "incorporate".
- **Dependencies.** `item_dependencies` links finish-to-start pairs in one project and refuses loops. `dependency_conflicts()` lists tasks that start before a task they wait on is due.
- **Saved views** (private or shared with the project) and **custom templates** (per workspace).
- **Links.** Tasks link to an RFI or a submittal, and files attach to them too.
- **`workload()`** counts open tasks per person: overdue, each week and no date.
- **Search and Ask** now include RFIs and submittals.
- **Plans.** Each plan check runs in the database:
  - RFIs, submittals and dependencies need the registers feature (trial, Team, Business).
  - Workload and custom templates need the workload feature (trial, Business).
  - Milestones, reviews and saved views are on every plan.

**App**

- **RFIs tab.** A list with status filters and days open. The side panel has the response, linked tasks, a "follow-up task" button and files. Open questions from your notes that have no RFI yet are listed at the top of the RFIs tab, each with a **Create RFI** button: one click makes the RFI and opens it. The same button is on each question under Decisions & Risks, where it then reads "Open RFI-00N".
- **Submittals tab.** A list and side panel showing the action, "Log revision N+1", revision history, linked tasks and files.
- **Logs.** Both registers export as CSV and PDF from `/w/<slug>/projects/<id>/registers/rfis` (or `submittals`) with `?format=csv|pdf`. The PDF is landscape and multi-page, made by a small built-in writer with no new package.
- **Milestones & Reviews tab.** Add, move and finish milestones. For a review, add comments, set each one's disposition, and close or reopen the review (Close stays greyed out until the review is ready).
- **Dependencies.** In the task panel, "Waits on" and "Needed by" let you add a link (loops are blocked) or remove one. A task that starts before what it waits on is due shows "⚠ Conflict" in the table, an amber dashed arrow on the timeline, and a banner above the views. The check runs in the browser, so moving a date flags the tasks that wait on it at once.
- **Timeline** draws milestones as diamonds and dependencies as arrows.
- **Filters and sorting** on Table, Board, Calendar and Timeline:
  - search, owner, status, priority, due date, section and hide done;
  - sort by any column, ascending or descending.
  - Filters live in the URL (`?status=open,stuck&sort=due`), so a link brings them back.
- **Saved views.** Under the "Views" menu you can save, open, share, copy a link to or delete a view.
- **Workload page** (`/w/<slug>/workload`, in the sidebar). People down the side; overdue, the next 4 to 12 weeks and no date across. Busy weeks are shaded.
- **Templates.** Four new built-ins: MEP design, structural design, site and civil, and new product introduction (NPI).
  - "Save as template" in the project menu stores a project's sections and tasks, with dates kept as offsets.
  - Your templates show first in New project, marked "Yours", and you can delete them.
- **AI helpers**:
  - **Draft RFI.** Highlight a question in a document's text and choose "Draft RFI from selection", or paste a passage in the New RFI form. The AI fills in subject, question, a suggested answer and references, and you edit before saving.
  - **Find deviations.** On a submittal with a PDF or Word file attached, paste the spec section. The AI lists each deviation (required, submitted, severity, page) and anything missing. Tick the ones you agree with and "Add confirmed items to review notes". Nothing is saved without you.
  - Both count as AI runs. Find deviations needs file AI (Team and Business).
- **Export** (workspace) adds rfis.csv, submittals.csv, milestones.csv, reviews.csv and dependencies.csv.
- **Demo seed.** Pump Station Retrofit now has 2 RFIs, 3 submittals (one on revision 1), 4 milestones, a design review with 4 comments, 5 dependencies (one in conflict) and a saved view. The generator question is left without an RFI so "Create RFI" shows.

**Tests**

- `tests/unit/engineering.test.ts`: filters (URL round trip, apply, sort), conflicts and loops, numbering, days open, overdue, log rows, the PDF writer (wrapping, pages, escaping), the workload grid, and every template checked against the plan schema.
- `tests/db/registers.test.ts`: numbering and status dates, who can edit, guests, plan gating, the submittal revision flow, review close-out, dependency loops and conflicts, saved view privacy, templates, and `workload()` against a hand count.
- `tests/e2e/engineering.spec.ts` covers the acceptance criteria:
  - an RFI from a question in two clicks, showing days open;
  - moving a predecessor's due date flags its successor;
  - a saved view reloads from its URL with the same filters;
  - the workload page matches a hand count.

### Skipped or deferred

- **No drag-to-reorder while sorted.** On Table and Board, a sort other than the default turns dragging off so the sorted order stays put.
- **Dependencies are finish-to-start only.** No lag days, start-to-start or auto-rescheduling of successors. Conflicts are flagged, not fixed.
- **Find deviations reads one attached file at a time**, up to 300,000 characters of text, or a scanned PDF up to 20 MB.
- **The RFI and submittal PDFs** use the built-in Helvetica font, so characters outside Western European text show as "?".

### Decisions for Luke

- Review comments are tasks with a disposition. Marking one "incorporate" turns it into real work in every task view and in the workload page.
- Days open counts from the day an RFI leaves draft, and stops when it's answered or closed.
- A saved view stores its query string. Shared views show for everyone on the project; private ones only for you.
- Custom templates sit with workload on Business (and the trial). Team gets registers but not workload, as in the spec's pricing table.

### Still needs Luke

- Nothing to set up. No new env vars or packages.

## Phase 4: Files and AI capture (Nov 27, 2026)

Projects can now hold files, and the AI reads PDFs, Word files, emails and meeting transcripts, not just pasted text. Every task it finds keeps the sentence it came from and the page, and opens the file at that page. Each project can have an email address to forward minutes to. Ask Forgeboard answers questions about your projects with sources. Managers can have a weekly AI report written and emailed every Monday, with a read-only link to share.

### Shipped

**Database** (`supabase/migrations/20261129000000_files_and_capture.sql`)

- **Documents.** `notes` is now `documents`, keeping every row. New columns: title, origin (pasted, uploaded or email), the page each PDF page starts at, sender, the file it came from, and when the AI last read it. Tasks' `note_id` is now `source_document_id`, and tasks gained `source_quote` and `source_page`. Search covers document titles.
- **Attachments.** Files on a task or document, kept in a private Storage bucket (`attachments`, 25 MB per file). Allowed types: PDF, Word, Excel, PNG, JPEG, DWG, DXF, text, email (.eml) and transcripts (.vtt, .srt). HTML, SVG and scripts are refused, so nothing uploaded can run in a browser.
  - The database picks each file's path (`workspace/project/id-name`). Storage accepts an upload only to a path someone started with a pending row they created, and only people who can edit the project can start one. Reading needs access to the project.
  - Storage quota: a trigger checks the plan's storage (1 / 5 / 50 / 250 GB) while holding a lock on the workspace, so two uploads at once can't both squeeze past it. Past the limit it's refused with "This file would go over your plan's 1 GB of storage (1019 MB used). Delete some files or upgrade." Deleting a file gives the space back.
  - At most 100 uploads per person per hour. Uploads never finished are removed after a day.
- **Project inbox.** `project_inboxes` gives a project a secret address, `p-<32 hex>@<inbox domain>`. People who can edit the project can see it and turn it on; the project's manager can change the address or allow outside senders. `receive_inbound_email()` (server only) files a message as a document if the sender is a workspace member who can see the project (or outside senders are allowed), the plan includes file AI and the workspace isn't read-only. At most 200 emails a day per project.
- **Weekly reports.** `report_settings` (on/off and who gets it) and `project_reports` (one per project per week). Managers write them on plans with the workload feature; anyone on the project can read them. Each report has a 64-hex share token that works for 30 days; `shared_report()` is the only thing a signed-out visitor can read.
- **Ask search.** `ask_search()` finds tasks, decisions, risks, comments and documents matching a question, runs as the caller so Row Level Security decides what it can see, and returns highlighted excerpts. It returns nothing on plans without file AI.

**App**

- **Files on tasks.** The task panel has a Files section: drag and drop or "Attach files", image previews, download and delete. Files upload straight from the browser to Storage (Vercel caps requests at 4.5 MB). `/api/files/<id>` checks access, then sends a 5-minute signed link; PDFs open at `#page=N`.
- **AI Capture** (AI Notes tab), rebuilt with three sources:
  - Paste text, as before.
  - From a file: PDF, Word, email, transcript or text. PDFs are read page by page. A scanned PDF (no text layer) is sent to the AI as a document so it can read the images, up to 100 pages and 20 MB.
  - Project inbox: turn it on, copy the address, see emails as they arrive and read one with AI.
  - Long documents are read in parts of about 24,000 characters (up to 12 parts, 4 at a time), split between pages, then merged: the same item found in two parts is kept once with the details from both.
  - Each item's page comes from where its quote is actually found in the file, not the AI's guess.
  - Review shows the page, the owner match ("→ Ada Lovelace" or "Not a member; kept as a name"), and "Similar to existing task" warnings. Likely duplicates start unticked.
- **Task source.** A task made by AI shows the quote it came from and "Open minutes.pdf, page 23", which opens the file at that page.
- **Documents list** on the AI Notes tab: every document with where it came from, page count, sender, a link to the file and its text.
- **Ask Forgeboard** (`/w/<slug>/ask`, in the sidebar). Answers only from what search found that you can see, cites every fact like [S1], and lists the sources with links. Citations that don't point at a real source are removed; an answer with none left becomes "I could not find that." No AI run is used when nothing matches.
- **Weekly report** on the project Overview, for managers: "Send every Monday", recipients, "Write this week's report now" (and email it), past reports with a share link and "Stop sharing". The shared page is `/r/<token>`, not indexed by search engines.
- **Inbound email webhook.** `POST /api/inbound-email` takes a raw email signed with HMAC-SHA256 (`INBOUND_EMAIL_SECRET`), refuses signatures older than 5 minutes and bodies over 4 MB. [docs/INBOUND_EMAIL.md](INBOUND_EMAIL.md) explains the contract and a free Cloudflare Email Worker setup.
- **Daily job** also sends weekly reports (on Mondays) and removes unfinished uploads.
- New env vars in `.env.example`: `INBOUND_EMAIL_SECRET`, `INBOUND_EMAIL_DOMAIN`.
- New packages: `unpdf` (PDF text page by page, needed for page numbers), `mammoth` (Word) and `postal-mime` (email).

**Tests**

- `tests/unit/capture.test.ts`: HTML and transcript cleaning, page joining, chunking, quote-to-page matching, duplicates, merging, and reading real PDF, email, VTT and text files. A generated 40-page PDF of minutes goes through the real reader and the extraction pipeline (with the AI call stubbed to report the wrong page): all 8 tasks and the decision land on their correct pages.
- `tests/unit/files.test.ts`: upload rules, inbound signatures (tampering, wrong secret, old timestamps), inbox address parsing, citation clean-up and week dates.
- `tests/db/files.test.ts`: upload paths, Storage access, the quota message, blocked types, guests and outsiders, the inbox (who can see it, who may send, outside senders), report permissions and expiring share links, and that Ask never returns a project the asker can't read.
- `tests/e2e/files.spec.ts`: a signed email shows up in the project inbox within a minute (unsigned is refused), and an upload past the quota shows the message in the task panel.

### Skipped or deferred

- **Email attachments aren't imported.** Their names are listed at the end of the document. Forward the PDF itself, or upload it.
- **No mail domain yet.** Nothing receives mail until a domain is pointed at the webhook (see below). Until then the inbox tab says so.
- **Previews** are images and PDFs in the browser. Word, Excel, DWG and DXF files download.
- **The merge pass is plain code, not a second AI call.** It's cheaper and predictable; an AI merge can come later if duplicates slip through.

### Deployed (Nov 27, 2026)

1. Saved a copy of every live table (`backups/pre-phase-4-...json`, not committed).
2. Ran the migration on the live database after checking its SHA-256 against the file CI tested. All 5 notes became documents, the 43 tasks that came from them still point at them, and the private `attachments` bucket exists. Then merged `phase-4` into `main`; Vercel deployed.
3. Checked on the live site: AI Capture shows its three tabs, the Documents list shows the old notes, and on Starter the file and Ask features show the upgrade message. `/api/inbound-email` answers 503 until it's set up, and file and Ask routes refuse signed-out calls.
4. CI on `phase-4`: lint, typecheck, 100 unit tests, 116 database tests and 32 browser tests pass. CI's test mailbox moved to port 54334, because the runner now has 54324 in use (that had also failed `main`'s last run).

### Still needs Luke

1. **Inbound email (optional).** Add a domain or subdomain to Cloudflare, turn on Email Routing, and follow [docs/INBOUND_EMAIL.md](INBOUND_EMAIL.md). Then set `INBOUND_EMAIL_SECRET` and `INBOUND_EMAIL_DOMAIN` in Vercel and redeploy.

### Decisions for Luke

- Inbound email is a signed webhook any provider can call, rather than tying Forgeboard to one mail service. Cloudflare's is free.
- Weekly reports go out from the daily job when it's Monday (UTC), because the Hobby plan allows one scheduled run a day. Each counts as one AI run.
- Report recipients are people in the workspace. Guests only if the project is shared with them.
- Share links last 30 days, and the manager can stop sharing any time.
- Limits: 100 uploads per person per hour, 200 emails per project per day, scanned PDFs up to 100 pages and 20 MB, documents up to 1,000,000 characters.
- The tab is still called "AI Notes" so existing links and habits keep working.

## Phase 3: Collaboration (Nov 27, 2026)

People working on the same project now see each other's changes live, can talk in comments with @mentions, get notified in the app and by email, and can see the history of every task. Search covers tasks, comments and meeting notes.

### Shipped

**Database** (`supabase/migrations/20261128000000_collaboration.sql`)

- `activity`: database triggers record every task created, changed or deleted, and every comment posted, edited or deleted. Each row says who did it, when, and for changes, each field's old and new value (name, description, status, priority, owner, start and due dates, section, type). Moving a task without changing anything else isn't recorded. Nobody can write history directly. People see the history of projects they can see, going back as far as the plan allows: 14 days on a trial, 90 on Starter, 365 on Team, all of it on Business and Enterprise.
- Comments can be edited by their author. Only the text can change, and editing sets `edited_at`. Mentions are stored as `@[Name](user-id)`, so renaming someone never breaks a mention.
- `notifications`, created by triggers:
  - Assigned: someone makes you a task's owner.
  - Mentioned: once per person per comment. Editing a comment only notifies people newly added to it.
  - Commented: someone comments on a task you own. You aren't told twice if you were also mentioned.
  - Status: someone else moves a task you own.
  - You're never notified about your own actions, and never about a project you can't see. A guest only hears about projects shared with them.
  - You see only your own notifications, and can only mark them read.
- `notification_prefs`, per person per workspace. Each type can be on or off in the app and by email. Defaults: everything on in the app; email on for assigned and mentioned, off for comments and status changes; daily digest on at 8 AM in your time zone.
- Email queue. Each notification that should email someone is marked pending. `claim_notification_emails()` hands each one out exactly once, even if two senders run at the same time, and a send that crashed is retried after 15 minutes.
- Daily jobs, callable only by the server:
  - `due_digest_candidates()`: each person's open tasks that are overdue or due today or tomorrow, in their time zone, at most one digest a day.
  - `trial_ending_candidates()`: trials ending within 3 days, warned once.
- Full-text search: `search` columns with GIN indexes on tasks (name, description, owner), comments (with mentions read as names) and notes. `search_workspace()` matches every word as a prefix ("pie" finds "pier"), runs as the caller so Row Level Security still applies, and returns highlighted snippets.
- Realtime: tasks, sections, subtasks, comments and notifications are published to Supabase Realtime. Row Level Security decides who receives each change.
- Deleting an account still works when it has history: its past actions stay, showing as "Former member".

**App**

- **Live projects.** A project page listens for changes to its tasks, sections, subtasks and comments. When anything changes it refreshes, usually in under a second, and an open task panel reloads. Avatars in the project header show who else is looking at it.
- **Task panel.**
  - A History section lists who changed what and when, for example "Ben Builder changed the due date from Dec 1 to Dec 5 · 3m ago".
  - Updates support Markdown: bold, italic, code, links and lists. It's rendered as React elements, never as raw HTML, and only http, https and mailto links are allowed.
  - Typing `@` suggests people from the workspace.
  - Authors can edit their updates, and edited ones show "(edited)".
- **Project feed.** The Overview tab shows the project's recent activity, linked to each task.
- **Notifications.** A bell in the top bar shows the unread count, which stays live, and the latest notifications, with "Mark all read". The new Inbox page (`/w/<slug>/inbox`, also in the sidebar) lists all notifications, can show unread only, marks single notifications or all of them read, and pages back through older ones.
- **Settings → Notifications.** For each type, choose in-app and email. Also choose the daily digest, its hour and your time zone.
- **Search.** The command palette (Ctrl/⌘ K) searches tasks, comments and meeting notes with the new full-text search. Matches are highlighted, and comment hits open their task. Projects are still matched by name.
- **Emails** (Resend):
  - One email per notification (assigned, mentioned, and, if turned on, comments and status changes), with the comment quoted and a link to the task.
  - The daily due-date digest.
  - The trial-ending warning, 3 days before.
  - The payment-failed email from Phase 2 is unchanged.
  - Notification emails go out right after the action that caused them. Anything missed goes out with the daily job.
- **Daily job.** `/api/cron/daily` sends queued emails, digests and trial warnings. It only runs when called with `Authorization: Bearer $CRON_SECRET`, and `vercel.json` schedules it every day at 13:00 UTC. New env var: `CRON_SECRET` (in `.env.example`).

**Tests**

- New `tests/db/collaboration.test.ts`:
  - History records who changed the due date, with the old and new dates, and skips moves.
  - Guests and outsiders see only the history they should.
  - Assignment notifies once.
  - A mention creates one notification and one queued email, and respects preferences. Guests aren't told about projects they can't see.
  - People read only their own notifications.
  - Queued emails are handed out once.
  - Only the author edits a comment.
  - Search finds a task by a word in a comment, and respects access.
- New `tests/e2e/collaboration.spec.ts`, with two people in two browsers on one project:
  - Each sees the other online.
  - A rename shows up in the other browser within 2 seconds.
  - The open task panel shows who moved the due date.
  - An @mention picked from the suggestions lights up the bell and the Inbox.
  - Search finds the task by a word only in the comment.
- Unit tests for mentions, the Markdown parser (including unsafe links and HTML), history wording and notification wording.

### Skipped or deferred

- **Email only reaches Luke for now.** Resend is set up but has no verified domain, so it can only send to the Resend account's own address.
- **Digest timing.** Vercel's Hobby plan runs scheduled jobs at most once a day, so everyone's digest goes out on that one daily run (13:00 UTC: 8 AM Eastern, 5 AM Pacific) instead of at the hour each person chose. On a paid Vercel plan, schedule `/api/cron/daily?hourly=1` every hour and the chosen hour is respected.
- **Typing indicators and live cursors** weren't in the spec and aren't built. Presence shows who is on the project.

### Deployed (Nov 27, 2026)

1. Saved a copy of every live table (`backups/pre-phase-3-...json`, not committed).
2. Ran the migration on the live database, after checking it byte for byte against the file CI tested. Then merged `phase-3` into `main` and pushed; Vercel deployed.
3. Checked on the live site: the new tables and functions respond; the bell, Inbox, notification settings and project activity feed load with no errors; and `/api/cron/daily` refuses calls without the secret.
4. CI on `phase-3`: lint, typecheck, 70 unit tests, 101 database tests and 30 browser tests (including the two-browser live test) all pass.

The bell gets new notifications through Realtime, and also re-checks its count when tasks on the page change, when the tab comes back into view, and every minute. The browser test only checks that the count appears, so it doesn't prove Realtime alone delivered it.

### Still needs Luke

1. ~~`CRON_SECRET` in Vercel~~ Done Nov 27 by Luke.
2. ~~`RESEND_API_KEY` in Vercel~~ Done Nov 27 by Luke.
3. **Email to everyone (optional).** Verify a domain you own in Resend (Domains), then set `EMAIL_FROM` in Vercel, for example `Forgeboard <notify@your-domain.com>`.

### Decisions for Luke

- Email defaults: assigned and mentioned email on; comments on your tasks and status changes are in the app only (they'd be noisy by email). Each person can change this.
- The daily job runs at 13:00 UTC, because the Hobby plan allows one run a day.
- History older than the plan's window is hidden, not deleted, so upgrading shows it again.
- Mentions can name anyone in the workspace. Someone who can't see the project isn't notified.
- Authors can edit their own comments. Admins can delete anyone's but can't edit them.

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
