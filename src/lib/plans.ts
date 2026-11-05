import type { Plan, Profile } from "./types";

// Plan rules shared by the server (enforcement) and the UI (messages).

/** Total AI extractions a free (trial) account gets. */
export const FREE_TRIAL_EXTRACTIONS = 3;

/** Max AI extractions per rolling hour for any account (protects AI costs). */
export const HOURLY_EXTRACTION_LIMIT = 30;

/** Longest notes text we send to the AI, in characters. */
export const MAX_NOTES_CHARS = 30_000;

export const PLAN_LABELS: Record<Plan, string> = {
  free: "Free trial",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
};

/** Paid plans only count while their subscription is active. */
export function hasPaidAccess(profile: Pick<Profile, "plan" | "subscription_status">) {
  return profile.plan !== "free" && profile.subscription_status === "active";
}

export function trialExtractionsLeft(profile: Pick<Profile, "ai_extractions_used">) {
  return Math.max(0, FREE_TRIAL_EXTRACTIONS - profile.ai_extractions_used);
}
