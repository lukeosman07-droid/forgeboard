import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FREE_TRIAL_EXTRACTIONS, HOURLY_EXTRACTION_LIMIT } from "@/lib/plans";

// Shared by every AI route: checks the plan limits and records the attempt in
// one atomic database call, then lets the route report how it ended.

type Claim = { allowed: boolean; reason: string; event_id: number | null; free_remaining: number | null };

export function aiError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function claimAiUse(userId: string): Promise<
  | { ok: true; freeRemaining: number | null; finish: (status: "succeeded" | "empty" | "failed") => Promise<unknown> }
  | { ok: false; response: NextResponse }
> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, response: aiError(500, "AI isn't set up yet. Add ANTHROPIC_API_KEY to .env.local and restart the server.") };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, response: aiError(500, "Server is missing SUPABASE_SERVICE_ROLE_KEY.") };

  const { data, error } = await admin.rpc("claim_ai_extraction", {
    p_user_id: userId,
    p_free_limit: FREE_TRIAL_EXTRACTIONS,
    p_hourly_limit: HOURLY_EXTRACTION_LIMIT,
  });
  const claim = data?.[0] as Claim | undefined;

  if (error || !claim) {
    console.error("claim_ai_extraction failed:", error);
    return { ok: false, response: aiError(500, "Couldn't check your AI usage. Has the second database migration been run?") };
  }
  if (!claim.allowed) {
    if (claim.reason === "trial_exhausted") {
      return {
        ok: false,
        response: aiError(402, `You've used all ${FREE_TRIAL_EXTRACTIONS} free AI runs. Upgrade for unlimited AI.`, {
          code: "trial_exhausted",
          upgradeUrl: "/pricing",
        }),
      };
    }
    if (claim.reason === "rate_limited") {
      return {
        ok: false,
        response: aiError(429, `You've hit the limit of ${HOURLY_EXTRACTION_LIMIT} AI runs per hour. Please try again a little later.`, {
          code: "rate_limited",
        }),
      };
    }
    return { ok: false, response: aiError(403, "Your account isn't set up for AI features.") };
  }

  return {
    ok: true,
    freeRemaining: claim.free_remaining,
    finish: async (status) => admin.rpc("finish_ai_extraction", { p_event_id: claim.event_id, p_status: status }),
  };
}

// Accept the browser's date only if it's within a day of the server's (time zones).
export function safeToday(clientDate?: string) {
  const serverToday = new Date().toISOString().slice(0, 10);
  if (!clientDate) return serverToday;
  const diffDays = Math.abs(Date.parse(clientDate) - Date.parse(serverToday)) / 86_400_000;
  return diffDays <= 1 ? clientDate : serverToday;
}
