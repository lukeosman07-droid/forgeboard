import "server-only";
import { siteUrl } from "@/lib/account";
import { emailIsConfigured, sendDueDigestEmail, sendNotificationEmail, sendTrialEndingEmail } from "@/lib/email";
import { toPlainText } from "@/lib/markdown";
import { notificationHeadline, taskPath } from "@/lib/notifications";
import type { NotificationType } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";

// Sends the emails the database has queued. Database triggers decide who gets
// what (and check preferences); this only claims queued rows and sends them.
// claim_notification_emails hands each row out once, so two runs at the same
// time never send the same email twice.

type Claimed = {
  id: number;
  type: NotificationType;
  data: { status?: string } | null;
  email: string | null;
  workspace_name: string;
  workspace_slug: string;
  project_id: string | null;
  project_name: string | null;
  item_id: string | null;
  item_title: string | null;
  comment_body: string | null;
  actor_name: string | null;
};

const QUOTE_LIMIT = 600;

/** Sends queued notification emails. Returns how many were sent. */
export async function deliverNotificationEmails(limit = 50): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const { data, error } = await admin.rpc("claim_notification_emails", { p_limit: limit });
  if (error) {
    console.error("Claiming notification emails failed:", error.message);
    return 0;
  }
  const rows = (data ?? []) as Claimed[];
  if (rows.length === 0) return 0;

  const base = siteUrl();
  const done: Record<"sent" | "failed" | "skipped", number[]> = { sent: [], failed: [], skipped: [] };
  for (const row of rows) {
    if (!emailIsConfigured() || !row.email || !row.item_id || !row.project_id) {
      done.skipped.push(row.id);
      continue;
    }
    const headline = notificationHeadline(row.type, row.actor_name, row.data ?? {});
    let quote = row.comment_body && row.type !== "assigned" && row.type !== "status" ? toPlainText(row.comment_body) : undefined;
    if (quote && quote.length > QUOTE_LIMIT) quote = `${quote.slice(0, QUOTE_LIMIT)}…`;
    const result = await sendNotificationEmail(row.email, `${headline}: ${row.item_title ?? "a task"}`, {
      headline,
      taskTitle: row.item_title ?? "A task",
      projectName: row.project_name ?? "",
      workspaceName: row.workspace_name,
      quote,
      link: `${base}${taskPath(row.workspace_slug, row.project_id, row.item_id)}`,
      settingsLink: `${base}/w/${row.workspace_slug}/settings#notifications`,
    });
    done[result === "sent" ? "sent" : result === "failed" ? "failed" : "skipped"].push(row.id);
  }

  for (const state of ["sent", "failed", "skipped"] as const) {
    if (done[state].length === 0) continue;
    const { error: finishError } = await admin.rpc("finish_notification_emails", { p_ids: done[state], p_state: state });
    if (finishError) console.error("Finishing notification emails failed:", finishError.message);
  }
  return done.sent.length;
}

/** Runs deliverNotificationEmails and never throws: for after() in actions. */
export async function deliverQuietly() {
  try {
    await deliverNotificationEmails();
  } catch (err) {
    console.error("Notification email delivery failed:", err);
  }
}

type DigestCandidate = {
  user_id: string;
  email: string;
  full_name: string | null;
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  local_date: string;
  tasks: { id: string; title: string; due_date: string; project_id: string; project_name: string; overdue: boolean }[];
};

function formatDay(isoDate: string) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Sends today's due-date digests. Returns how many were sent. With anyHour
 * (a job that runs only once a day) everyone due today gets theirs now;
 * otherwise each person waits for their chosen local hour.
 */
export async function sendDueDigests(now = new Date(), anyHour = false): Promise<number> {
  const admin = createAdminClient();
  if (!admin || !emailIsConfigured()) return 0;
  const { data, error } = await admin.rpc("due_digest_candidates", { p_now: now.toISOString(), p_any_hour: anyHour });
  if (error) {
    console.error("Loading digests failed:", error.message);
    return 0;
  }
  const base = siteUrl();
  let sent = 0;
  for (const c of (data ?? []) as DigestCandidate[]) {
    const result = await sendDueDigestEmail(c.email, {
      name: c.full_name ?? "",
      workspaceName: c.workspace_name,
      tasks: c.tasks.map((t) => ({
        title: t.title,
        projectName: t.project_name,
        due: formatDay(t.due_date),
        overdue: t.overdue,
        link: `${base}${taskPath(c.workspace_slug, t.project_id, t.id)}`,
      })),
      link: `${base}/w/${c.workspace_slug}/my-work`,
      settingsLink: `${base}/w/${c.workspace_slug}/settings#notifications`,
    });
    if (result !== "sent") continue;
    sent++;
    const { error: markError } = await admin.rpc("mark_digest_sent", { p_user: c.user_id, p_workspace: c.workspace_id, p_date: c.local_date });
    if (markError) console.error("Marking digest sent failed:", markError.message);
  }
  return sent;
}

type TrialCandidate = { workspace_id: string; workspace_name: string; workspace_slug: string; trial_ends_at: string; email: string };

/** Warns owners whose trial ends within 3 days. Returns how many were sent. */
export async function sendTrialWarnings(now = new Date()): Promise<number> {
  const admin = createAdminClient();
  if (!admin || !emailIsConfigured()) return 0;
  const { data, error } = await admin.rpc("trial_ending_candidates", { p_now: now.toISOString() });
  if (error) {
    console.error("Loading trial warnings failed:", error.message);
    return 0;
  }
  const base = siteUrl();
  let sent = 0;
  for (const c of (data ?? []) as TrialCandidate[]) {
    const endsOn = new Date(c.trial_ends_at).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
    const result = await sendTrialEndingEmail(c.email, { workspaceName: c.workspace_name, endsOn, link: `${base}/w/${c.workspace_slug}/billing` });
    if (result !== "sent") continue;
    sent++;
    const { error: markError } = await admin
      .from("workspaces")
      .update({ trial_warning_sent_at: now.toISOString() })
      .eq("id", c.workspace_id);
    if (markError) console.error("Marking trial warning failed:", markError.message);
  }
  return sent;
}
