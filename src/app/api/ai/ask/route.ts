import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { NOT_FOUND, askContext, resolveCitations, type AskPassage } from "@/lib/ask";
import { askForgeboard } from "@/lib/ai/ask";
import { aiError as fail, claimAiUse } from "@/lib/ai/usage";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const BodySchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60),
  question: z.string().trim().min(3, "Ask a question.").max(500, "Keep the question under 500 characters."),
});

// POST /api/ai/ask  { slug, question } -> { answer, sources }
// Retrieval runs as the asker (ask_search under Row Level Security), so the AI
// only ever sees what they can read, and may only cite those passages.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please log in again.");
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");

  const supabase = await createClient();
  if (!supabase) return fail(401, "Please log in again.");
  const { data: workspace } = await supabase.from("workspaces").select("id, slug").eq("slug", parsed.data.slug).maybeSingle<{ id: string; slug: string }>();
  if (!workspace) return fail(404, "Workspace not found.");
  const { data: limits } = await supabase.rpc("workspace_limits", { ws: workspace.id });
  if (!limits?.[0]?.file_ai) {
    return fail(402, "Ask Forgeboard is on the Team and Business plans.", { code: "plan", upgradeUrl: `/w/${workspace.slug}/billing` });
  }

  const { data: rows, error } = await supabase.rpc("ask_search", { ws: workspace.id, q: parsed.data.question, p_limit: 12 });
  if (error) {
    console.error("ask_search failed:", error);
    return fail(500, "Couldn't search the workspace. Please try again.");
  }
  const passages = (rows ?? []) as AskPassage[];
  // Nothing relevant: say so without spending an AI run.
  if (passages.length === 0) return NextResponse.json({ answer: NOT_FOUND, sources: [] });

  const claim = await claimAiUse(workspace, user.id, "ask");
  if (!claim.ok) return claim.response;
  const result = await askForgeboard(parsed.data.question, askContext(passages));
  if (!result.ok) {
    await claim.finish("failed", result.usage);
    return fail(result.status, result.error);
  }
  const resolved = result.data.found ? resolveCitations(result.data.answer, passages) : { answer: NOT_FOUND, sources: [] };
  await claim.finish(resolved.sources.length ? "succeeded" : "empty", result.usage);
  return NextResponse.json({ ...resolved, runsLeft: claim.runsLeft });
}
