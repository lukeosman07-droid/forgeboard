import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractFromNotes, isEmptyExtraction } from "@/lib/ai/extract";
import { FREE_TRIAL_EXTRACTIONS, HOURLY_EXTRACTION_LIMIT, MAX_NOTES_CHARS } from "@/lib/plans";

// AI calls can take a while on long documents.
export const maxDuration = 120;

const BodySchema = z.object({
  projectId: z.uuid(),
  text: z.string(),
  // The browser's local date, so "by Friday" resolves in the user's time zone.
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(500, "AI isn't set up yet. Add ANTHROPIC_API_KEY to .env.local and restart the server.");
  }
  const admin = createAdminClient();
  if (!admin) return fail(500, "Server is missing SUPABASE_SERVICE_ROLE_KEY.");

  // Check limits and record the attempt in one atomic database call.
  const { data: claims, error: claimError } = await admin.rpc("claim_ai_extraction", {
    p_user_id: user.id,
    p_free_limit: FREE_TRIAL_EXTRACTIONS,
    p_hourly_limit: HOURLY_EXTRACTION_LIMIT,
  });
  const claim = claims?.[0] as
    | { allowed: boolean; reason: string; event_id: number | null; free_remaining: number | null }
    | undefined;

  if (claimError || !claim) {
    console.error("claim_ai_extraction failed:", claimError);
    return fail(500, "Couldn't check your AI usage. Has the second database migration been run?");
  }
  if (!claim.allowed) {
    if (claim.reason === "trial_exhausted") {
      return fail(402, `You've used all ${FREE_TRIAL_EXTRACTIONS} free AI extractions. Upgrade to keep turning notes into action items.`, {
        code: "trial_exhausted",
        upgradeUrl: "/pricing",
      });
    }
    if (claim.reason === "rate_limited") {
      return fail(429, `You've hit the limit of ${HOURLY_EXTRACTION_LIMIT} AI extractions per hour. Please try again a little later.`, {
        code: "rate_limited",
      });
    }
    return fail(403, "Your account isn't set up for AI extraction.");
  }

  const finish = (status: "succeeded" | "empty" | "failed") =>
    admin.rpc("finish_ai_extraction", { p_event_id: claim.event_id, p_status: status });

  const result = await extractFromNotes(text, safeToday(parsed.data.today));

  if (!result.ok) {
    await finish("failed"); // errors don't use up a trial extraction
    return fail(result.status, result.error);
  }
  if (isEmptyExtraction(result.data)) {
    await finish("empty");
    return fail(422, "The AI didn't find any action items, decisions, risks, or questions in that text. Try pasting fuller notes.", {
      code: "nothing_found",
    });
  }

  await finish("succeeded");
  return NextResponse.json({ extraction: result.data, freeRemaining: claim.free_remaining });
}

// Accept the browser's date only if it's within a day of the server's (time zones).
function safeToday(clientDate?: string) {
  const serverToday = new Date().toISOString().slice(0, 10);
  if (!clientDate) return serverToday;
  const diffDays = Math.abs(Date.parse(clientDate) - Date.parse(serverToday)) / 86_400_000;
  return diffDays <= 1 ? clientDate : serverToday;
}
