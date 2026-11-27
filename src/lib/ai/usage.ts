import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HOURLY_AI_LIMIT } from "@/lib/plans";
import type { AiCallUsage } from "./client";

// Shared by every AI route. claim_ai_use() checks the workspace's monthly runs
// and the person's hourly cap and records the attempt in one atomic database
// call; finish() then records how it ended, with tokens and latency.
// This uses the service-role client: ai_usage can't be written by users, so a
// browser can never reset its own count.

export type AiFeature = "extract" | "plan" | "status_report" | "ask";

type Claim = { allowed: boolean; reason: string; usage_id: number | null; runs_left: number | null; runs_limit: number | null };

export function aiError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

export type AiClaim =
  | {
      ok: true;
      /** AI runs left this month after this one. */
      runsLeft: number;
      finish: (status: "succeeded" | "empty" | "failed", usage?: AiCallUsage) => Promise<unknown>;
    }
  | { ok: false; response: NextResponse };

export async function claimAiUse(workspace: { id: string; slug: string }, userId: string, feature: AiFeature): Promise<AiClaim> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, response: aiError(500, "AI isn't set up yet. Add ANTHROPIC_API_KEY to .env.local and restart the server.") };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, response: aiError(500, "Server is missing SUPABASE_SERVICE_ROLE_KEY.") };

  const { data, error } = await admin.rpc("claim_ai_use", {
    p_workspace: workspace.id,
    p_user: userId,
    p_feature: feature,
    p_hourly_limit: HOURLY_AI_LIMIT,
  });
  const claim = data?.[0] as Claim | undefined;

  if (error || !claim) {
    console.error("claim_ai_use failed:", error);
    return { ok: false, response: aiError(500, "Couldn't check your AI usage. Has the billing database migration been run?") };
  }
  if (!claim.allowed) {
    const billingUrl = `/w/${workspace.slug}/billing`;
    switch (claim.reason) {
      case "limit_reached":
        return {
          ok: false,
          response: aiError(402, `This workspace has used all ${claim.runs_limit?.toLocaleString()} AI runs for this month. Upgrade for more, or wait until the 1st.`, {
            code: "ai_limit",
            upgradeUrl: billingUrl,
          }),
        };
      case "read_only":
        return {
          ok: false,
          response: aiError(402, "This workspace is read-only until billing is sorted out, so AI is paused.", { code: "read_only", upgradeUrl: billingUrl }),
        };
      case "rate_limited":
        return {
          ok: false,
          response: aiError(429, `You've hit the limit of ${HOURLY_AI_LIMIT} AI runs per hour. Please try again a little later.`, { code: "rate_limited" }),
        };
      default:
        return { ok: false, response: aiError(403, "Only members of this workspace can use AI here.") };
    }
  }

  return {
    ok: true,
    runsLeft: claim.runs_left ?? 0,
    finish: async (status, usage) => {
      const { error: finishError } = await admin.rpc("finish_ai_use", {
        p_usage_id: claim.usage_id,
        p_status: status,
        p_model: usage?.model ?? null,
        p_input_tokens: usage?.inputTokens ?? 0,
        p_output_tokens: usage?.outputTokens ?? 0,
        p_latency_ms: usage?.latencyMs ?? null,
      });
      if (finishError) console.error("finish_ai_use failed:", finishError);
    },
  };
}

// Accept the browser's date only if it's within a day of the server's (time zones).
export function safeToday(clientDate?: string) {
  const serverToday = new Date().toISOString().slice(0, 10);
  if (!clientDate) return serverToday;
  const diffDays = Math.abs(Date.parse(clientDate) - Date.parse(serverToday)) / 86_400_000;
  return diffDays <= 1 ? clientDate : serverToday;
}
