import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isEmptyExtraction } from "@/lib/ai/clean";
import { extractFromNotes } from "@/lib/ai/extract";
import { aiError as fail, claimAiUse, safeToday } from "@/lib/ai/usage";
import { MAX_NOTES_CHARS } from "@/lib/plans";

// AI calls can take a while on long documents.
export const maxDuration = 120;

const BodySchema = z.object({
  projectId: z.uuid(),
  text: z.string(),
  // The browser's local date, so "by Friday" resolves in the user's time zone.
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// POST /api/extract  { projectId, text, today? }
// All checks happen here on the server; nothing from the browser is trusted.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please log in again.");

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Invalid request.");
  const { projectId } = parsed.data;
  const text = parsed.data.text.trim();

  if (text.length < 20) return fail(400, "Paste some notes first (at least a sentence or two).");
  if (text.length > MAX_NOTES_CHARS) {
    return fail(413, `That's ${text.length.toLocaleString()} characters. The limit is ${MAX_NOTES_CHARS.toLocaleString()}; split it into smaller parts.`);
  }

  // Row Level Security means this only finds the project if the user can see it.
  const supabase = await createClient();
  const { data: project } =
    (await supabase
      ?.from("projects")
      .select("id, workspaces(id, slug)")
      .eq("id", projectId)
      .maybeSingle<{ id: string; workspaces: { id: string; slug: string } }>()) ?? {};
  if (!project) return fail(404, "Project not found.");

  const claim = await claimAiUse(project.workspaces, user.id, "extract");
  if (!claim.ok) return claim.response;

  const result = await extractFromNotes(text, safeToday(parsed.data.today));

  if (!result.ok) {
    await claim.finish("failed", result.usage); // errors don't use up a run
    return fail(result.status, result.error);
  }
  if (isEmptyExtraction(result.data)) {
    await claim.finish("empty", result.usage);
    return fail(422, "The AI didn't find any action items, decisions, risks, or questions in that text. Try pasting fuller notes.", {
      code: "nothing_found",
    });
  }

  await claim.finish("succeeded", result.usage);
  return NextResponse.json({ extraction: result.data, runsLeft: claim.runsLeft });
}
