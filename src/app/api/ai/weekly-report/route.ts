import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { weekOf } from "@/lib/ai/project-data";
import { aiError as fail, claimAiUse } from "@/lib/ai/usage";
import { sendWeeklyReportEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";
import { formatDay, generateWeeklyReport, shareLink } from "@/server/weekly-reports";

export const maxDuration = 120;

const BodySchema = z.object({ projectId: z.uuid(), email: z.boolean().optional() });

// POST /api/ai/weekly-report  { projectId, email? }
// "Write this week's report now", for the project's manager. Runs as them, so
// the database decides whether they may (manager or admin, plan with reports).
// With email, it also goes to the chosen recipients who can see the project.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please log in again.");
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Invalid request.");
  const supabase = await createClient();
  if (!supabase) return fail(401, "Please log in again.");

  const { projectId } = parsed.data;
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, workspaces(id, slug, name)")
    .eq("id", projectId)
    .maybeSingle<{ id: string; name: string; workspaces: { id: string; slug: string; name: string } }>();
  if (!project) return fail(404, "Project not found.");
  const { data: allowed } = await supabase.rpc("can_manage_project", { p: projectId });
  const { data: limits } = await supabase.rpc("workspace_limits", { ws: project.workspaces.id });
  if (!allowed) return fail(403, "Only the project's manager or an admin can write the weekly report.");
  if (!limits?.[0]?.workload) {
    return fail(402, "Scheduled reports are on the Business plan.", { code: "plan", upgradeUrl: `/w/${project.workspaces.slug}/billing` });
  }

  const claim = await claimAiUse(project.workspaces, user.id, "status_report");
  if (!claim.ok) return claim.response;
  const now = new Date();
  const result = await generateWeeklyReport(supabase, projectId, now.toISOString().slice(0, 10));
  await claim.finish(result.ok ? "succeeded" : "failed", result.usage);
  if (!result.ok) return fail(result.status, result.error);

  const week = weekOf(now);
  let saved = await supabase
    .from("project_reports")
    .insert({ project_id: projectId, week_of: week, report: result.report })
    .select("share_token, share_expires_at")
    .single<{ share_token: string; share_expires_at: string }>();
  if (saved.error?.code === "23505") {
    // This week's report already exists: replace it and keep its link.
    saved = await supabase
      .from("project_reports")
      .update({ report: result.report })
      .eq("project_id", projectId)
      .eq("week_of", week)
      .select("share_token, share_expires_at")
      .single<{ share_token: string; share_expires_at: string }>();
  }
  if (saved.error || !saved.data) return fail(500, "Couldn't save the report.");

  let emailed = 0;
  if (parsed.data.email) {
    const [{ data: settings }, { data: people }, { data: shared }] = await Promise.all([
      supabase.from("report_settings").select("recipient_ids").eq("project_id", projectId).maybeSingle<{ recipient_ids: string[] }>(),
      supabase.rpc("workspace_people", { ws: project.workspaces.id }),
      supabase.from("project_members").select("user_id").eq("project_id", projectId),
    ]);
    const sharedWith = new Set((shared ?? []).map((m: { user_id: string }) => m.user_id));
    const wanted = new Set(settings?.recipient_ids ?? []);
    // A guest gets it only if the project is shared with them.
    const recipients = ((people ?? []) as Person[]).filter((p) => wanted.has(p.user_id) && p.email && (p.role !== "guest" || sharedWith.has(p.user_id)));
    for (const person of recipients) {
      const sent = await sendWeeklyReportEmail(person.email!, {
        projectName: project.name,
        workspaceName: project.workspaces.name,
        weekOf: formatDay(week),
        report: result.report,
        shareLink: shareLink(saved.data.share_token),
        expiresOn: formatDay(saved.data.share_expires_at),
      });
      if (sent === "sent") emailed++;
    }
  }
  return NextResponse.json({ ok: true, emailed, runsLeft: claim.runsLeft });
}
