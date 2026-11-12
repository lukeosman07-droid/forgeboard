import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeStatusReport } from "@/lib/ai/assist";
import { aiError as fail, claimAiUse, safeToday } from "@/lib/ai/usage";
import { createClient } from "@/lib/supabase/server";
import { STATUS_BY_ID } from "@/lib/work";
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

  const sectionName = new Map(((sections.data ?? []) as Section[]).map((s) => [s.id, s.name]));
  const lines = [
    `Project: ${project.data.name}`,
    project.data.description ? `Description: ${project.data.description}` : "",
    "",
    "Tasks:",
    ...tasks.map((t) =>
      [
        `- ${t.title}`,
        `status: ${STATUS_BY_ID[t.status]?.label ?? t.status}`,
        t.section_id && sectionName.get(t.section_id) ? `section: ${sectionName.get(t.section_id)}` : "",
        t.assignee ? `owner: ${t.assignee}` : "owner: unassigned",
        t.due_date ? `due: ${t.due_date}${t.status !== "done" && t.due_date < today ? " (OVERDUE)" : ""}` : "",
        t.priority ? `priority: ${t.priority}` : "",
        t.completed_at ? `completed: ${t.completed_at.slice(0, 10)}` : "",
      ]
        .filter(Boolean)
        .join(" | "),
    ),
    "",
    "Open risks and questions:",
    ...allItems
      .filter((i) => (i.type === "risk" || i.type === "question") && i.status !== "done")
      .map((i) => `- (${i.type}) ${i.title}`),
  ]
    .join("\n")
    .slice(0, 40_000);

  const claim = await claimAiUse(user.id);
  if (!claim.ok) return claim.response;

  const result = await writeStatusReport(lines, today);
  if (!result.ok) {
    await claim.finish("failed");
    return fail(result.status, result.error);
  }
  await claim.finish("succeeded");
  return NextResponse.json({ report: result.data, freeRemaining: claim.freeRemaining });
}
