// Weekly AI reports from the daily cron. It uses the service-role client
// because no user is signed in to a cron job: the database's
// weekly_report_candidates() picks the projects (enabled, on a plan with
// scheduled reports, not read-only, not already done this week) and
// report_recipients() drops anyone who can no longer see the project.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteUrl } from "@/lib/account";
import { writeStatusReport } from "@/lib/ai/assist";
import type { StatusReport } from "@/lib/ai/assist-schema";
import type { AiCallUsage } from "@/lib/ai/client";
import { projectDataText, weekOf } from "@/lib/ai/project-data";
import { claimAiUse } from "@/lib/ai/usage";
import { sendWeeklyReportEmail } from "@/lib/email";
import type { Item, Project, Section } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type SavedReport = StatusReport & { generated_at: string };

/** Reads the project with whichever client it's given and asks the AI for the report. */
export async function generateWeeklyReport(
  db: SupabaseClient,
  projectId: string,
  today: string,
): Promise<{ ok: true; report: SavedReport; usage?: AiCallUsage } | { ok: false; error: string; status: number; usage?: AiCallUsage }> {
  const [project, sections, items] = await Promise.all([
    db.from("projects").select("*").eq("id", projectId).maybeSingle<Project>(),
    db.from("sections").select("*").eq("project_id", projectId).order("position"),
    db.from("items").select("*").eq("project_id", projectId).order("position"),
  ]);
  if (!project.data) return { ok: false, status: 404, error: "Project not found." };
  const all = (items.data ?? []) as Item[];
  if (!all.some((i) => i.type === "action_item")) return { ok: false, status: 400, error: "Add some tasks first; there's nothing to report on yet." };
  const result = await writeStatusReport(projectDataText(project.data, (sections.data ?? []) as Section[], all, today), today);
  if (!result.ok) return { ok: false, status: result.status, error: result.error, usage: result.usage };
  return { ok: true, report: { ...result.data, generated_at: new Date().toISOString() }, usage: result.usage };
}

export function shareLink(token: string) {
  return `${siteUrl()}/r/${token}`;
}

export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

type Candidate = {
  project_id: string;
  workspace_id: string;
  workspace_slug: string;
  project_name: string;
  owner_id: string | null;
  recipient_ids: string[];
};

/** Monday's job: one report per enabled project, emailed to its recipients. */
export async function sendWeeklyReports(now: Date, force = false): Promise<{ reports: number; emails: number }> {
  const sent = { reports: 0, emails: 0 };
  if (!force && now.getUTCDay() !== 1) return sent;
  const admin = createAdminClient();
  if (!admin) return sent;

  const week = weekOf(now);
  const today = now.toISOString().slice(0, 10);
  const { data, error } = await admin.rpc("weekly_report_candidates", { p_week: week });
  if (error) {
    console.error("weekly_report_candidates failed:", error.message);
    return sent;
  }
  for (const c of (data ?? []) as Candidate[]) {
    if (!c.owner_id) continue;
    // The run counts against the workspace's AI runs, in the manager's name.
    const claim = await claimAiUse({ id: c.workspace_id, slug: c.workspace_slug }, c.owner_id, "status_report");
    if (!claim.ok) continue;
    const result = await generateWeeklyReport(admin, c.project_id, today);
    await claim.finish(result.ok ? "succeeded" : "failed", result.usage);
    if (!result.ok) continue;

    const { data: saved, error: saveError } = await admin
      .from("project_reports")
      .insert({ project_id: c.project_id, week_of: week, report: result.report, created_by: c.owner_id })
      .select("share_token, share_expires_at")
      .single<{ share_token: string; share_expires_at: string }>();
    if (saveError || !saved) continue; // already made this week (a second run)
    sent.reports++;
    sent.emails += await emailReport(admin, c, week, result.report, saved);
  }
  return sent;
}

async function emailReport(
  admin: SupabaseClient,
  c: Pick<Candidate, "project_id" | "project_name" | "workspace_id" | "recipient_ids">,
  week: string,
  report: StatusReport,
  saved: { share_token: string; share_expires_at: string },
): Promise<number> {
  if (c.recipient_ids.length === 0) return 0;
  const [{ data: people }, { data: workspace }] = await Promise.all([
    admin.rpc("report_recipients", { p_project: c.project_id, p_ids: c.recipient_ids }),
    admin.from("workspaces").select("name").eq("id", c.workspace_id).maybeSingle<{ name: string }>(),
  ]);
  let emails = 0;
  for (const person of (people ?? []) as { email: string }[]) {
    const result = await sendWeeklyReportEmail(person.email, {
      projectName: c.project_name,
      workspaceName: workspace?.name ?? "your workspace",
      weekOf: formatDay(week),
      report,
      shareLink: shareLink(saved.share_token),
      expiresOn: formatDay(saved.share_expires_at),
    });
    if (result === "sent") emails++;
  }
  return emails;
}
