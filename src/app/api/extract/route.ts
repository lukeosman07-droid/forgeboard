import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { extractFromNotes, isEmptyExtraction } from "@/lib/ai/extract";
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

  // Row Level Security means this only finds the project if the user owns it.
  const supabase = await createClient();
  const { data: project } = (await supabase?.from("projects").select("id").eq("id", projectId).maybeSingle()) ?? {};
  if (!project) return fail(404, "Project not found.");

  const claim = await claimAiUse(user.id);
  if (!claim.ok) return claim.response;

  const result = await extractFromNotes(text, safeToday(parsed.data.today));

  if (!result.ok) {
    await claim.finish("failed"); // errors don't use up a trial run
    return fail(result.status, result.error);
  }
  if (isEmptyExtraction(result.data)) {
    await claim.finish("empty");
    return fail(422, "The AI didn't find any action items, decisions, risks, or questions in that text. Try pasting fuller notes.", {
      code: "nothing_found",
    });
  }

  await claim.finish("succeeded");
  return NextResponse.json({ extraction: result.data, freeRemaining: claim.freeRemaining });
}
