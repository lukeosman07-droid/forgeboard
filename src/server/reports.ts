"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { StatusReport } from "@/lib/ai/assist-schema";
import { Id, firstIssue, type ActionResult } from "./schemas";
import { NO_ACCESS, refused, session } from "./session";

// Weekly AI reports: who gets them, and the past reports with their share links.
// The database lets only the project's manager (or an admin) change these, and
// only on plans with scheduled reports.

export type ReportSummary = {
  id: string;
  week_of: string;
  report: StatusReport & { generated_at?: string };
  share_token: string;
  share_expires_at: string;
  created_at: string;
};

export type ReportSettings = { enabled: boolean; recipientIds: string[] };

export async function getReports(projectId: string): Promise<{ settings: ReportSettings; reports: ReportSummary[] } | null> {
  if (!Id.safeParse(projectId).success) return null;
  const { supabase } = await session();
  const [settings, reports] = await Promise.all([
    supabase.from("report_settings").select("enabled, recipient_ids").eq("project_id", projectId).maybeSingle<{ enabled: boolean; recipient_ids: string[] }>(),
    supabase
      .from("project_reports")
      .select("id, week_of, report, share_token, share_expires_at, created_at")
      .eq("project_id", projectId)
      .order("week_of", { ascending: false })
      .limit(12),
  ]);
  return {
    settings: { enabled: settings.data?.enabled ?? false, recipientIds: settings.data?.recipient_ids ?? [] },
    reports: (reports.data ?? []) as ReportSummary[],
  };
}

const Settings = z.object({
  projectId: Id,
  enabled: z.boolean(),
  recipientIds: z.array(Id).max(50, "Pick up to 50 people."),
});

export async function saveReportSettings(projectId: string, settings: ReportSettings): Promise<ActionResult> {
  const parsed = Settings.safeParse({ projectId, ...settings });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { supabase } = await session();
  const values = { enabled: parsed.data.enabled, recipient_ids: [...new Set(parsed.data.recipientIds)], updated_at: new Date().toISOString() };
  // Update first; insert only if there's no row yet (an upsert would rewrite the key).
  const updated = await supabase.from("report_settings").update(values).eq("project_id", projectId).select("project_id");
  if (updated.error) return { error: "Only the project's manager or an admin can change the weekly report." };
  if (!updated.data?.length) {
    const inserted = await supabase.from("report_settings").insert({ project_id: projectId, ...values });
    if (inserted.error) {
      return { error: "Weekly reports are on the Business plan (and the free trial), set up by the project's manager or an admin." };
    }
  }
  refresh();
  return { ok: true };
}

/** Ends a report's share link now. */
export async function stopSharingReport(reportId: string): Promise<ActionResult> {
  if (!Id.safeParse(reportId).success) return { error: "Report not found." };
  const { supabase } = await session();
  const problem = refused(
    await supabase.from("project_reports").update({ share_expires_at: new Date().toISOString() }).eq("id", reportId).select("id"),
    "Couldn't stop sharing.",
  );
  if (problem) return { error: problem === NO_ACCESS ? "Only the project's manager or an admin can do that." : problem };
  refresh();
  return { ok: true };
}
