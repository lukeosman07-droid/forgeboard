import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeStatusReport } from "@/lib/ai/assist";
import { projectDataText } from "@/lib/ai/project-data";
import { aiError as fail, claimAiUse, safeToday } from "@/lib/ai/usage";
import { createClient } from "@/lib/supabase/server";
import type { Item, Project, Section } from "@/lib/types";

export const maxDuration = 120;

const BodySchema = z.object({
  projectId: z.uuid(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// POST /api/ai/status  { projectId, today? } -> { report }
// Reads the project's tasks on the server (never trusts task data from the browser).
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please log in again.");

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Invalid request.");
  const { projectId } = parsed.data;
  const today = safeToday(parsed.data.today);

  const supabase = await createClient();
  if (!supabase) return fail(401, "Please log in again.");
  const [project, sections, items] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle<Project>(),
    supabase.from("sections").select("*").eq("project_id", projectId).order("position"),
    supabase.from("items").select("*").eq("project_id", projectId).order("position"),
  ]);
  if (!project.data) return fail(404, "Project not found.");

  const allItems = (items.data ?? []) as Item[];
  const tasks = allItems.filter((i) => i.type === "action_item");
  if (tasks.length === 0) return fail(400, "Add some tasks first; there's nothing to report on yet.");

  const lines = projectDataText(project.data, (sections.data ?? []) as Section[], allItems, today);

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, slug")
    .eq("id", project.data.workspace_id)
    .maybeSingle<{ id: string; slug: string }>();
  if (!workspace) return fail(404, "Project not found.");

  const claim = await claimAiUse(workspace, user.id, "status_report");
  if (!claim.ok) return claim.response;

  const result = await writeStatusReport(lines, today);
  if (!result.ok) {
    await claim.finish("failed", result.usage);
    return fail(result.status, result.error);
  }
  await claim.finish("succeeded", result.usage);
  return NextResponse.json({ report: result.data, runsLeft: claim.runsLeft });
}
