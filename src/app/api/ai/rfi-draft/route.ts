import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { draftRfi } from "@/lib/ai/registers";
import { aiError as fail, claimAiUse } from "@/lib/ai/usage";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const BodySchema = z.object({
  projectId: z.uuid(),
  passage: z.string().trim().min(10, "Highlight a sentence or two with the question in it.").max(8000, "Highlight less text (8,000 characters max)."),
});

// POST /api/ai/rfi-draft  { projectId, passage } -> { draft }
// Suggests an RFI subject and question. Nothing is saved until the person
// creates the RFI. Needs a plan with registers.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please log in again.");
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");

  const supabase = await createClient();
  if (!supabase) return fail(401, "Please log in again.");
  // Row Level Security: only someone who can see the project finds it.
  const { data: project } = await supabase
    .from("projects")
    .select("name, workspace_id, workspaces(id, slug)")
    .eq("id", parsed.data.projectId)
    .maybeSingle<{ name: string; workspace_id: string; workspaces: { id: string; slug: string } | null }>();
  if (!project?.workspaces) return fail(404, "Project not found.");
  const { data: limits } = await supabase.rpc("workspace_limits", { ws: project.workspace_id });
  if (!limits?.[0]?.registers) {
    return fail(402, "RFIs are on the Team and Business plans.", { code: "upgrade", upgradeUrl: `/w/${project.workspaces.slug}/billing` });
  }

  const claim = await claimAiUse(project.workspaces, user.id, "rfi_draft");
  if (!claim.ok) return claim.response;
  const result = await draftRfi(parsed.data.passage, project.name);
  if (!result.ok) {
    await claim.finish("failed", result.usage);
    return fail(result.status, result.error);
  }
  if (!result.data.subject || !result.data.question) {
    await claim.finish("empty", result.usage);
    return fail(422, "The AI couldn't find a question in that text. Highlight the part that asks something.");
  }
  await claim.finish("succeeded", result.usage);
  return NextResponse.json({ draft: result.data, runsLeft: claim.runsLeft });
}
