import type { WorkspacePlan } from "./types";

// Plans, prices and limits: the one source of truth for the app. The database
// mirrors PLAN_LIMITS in plan_limits() (supabase/migrations/20261121000000_billing.sql)
// and enforces it, so change both together. Prices must match Stripe.

/** Plans bought online. Enterprise is sold by email; "trial" is the unpaid state. */
export type PaidPlan = "starter" | "team" | "business";
export type BillingInterval = "month" | "year";
/** Features a plan can lack. Each one is gated in the database as well. */
export type Feature = "file_ai" | "registers" | "workload";
/** Why a workspace is read-only (workspace_read_only_reason in the database). */
export type ReadOnlyReason = "trial_ended" | "subscription_ended" | "payment_failed";

export const PAID_PLANS: PaidPlan[] = ["starter", "team", "business"];
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 7;

/** Max AI runs per person per rolling hour on any plan (protects AI costs). */
export const HOURLY_AI_LIMIT = 30;

/** Longest notes text we send to the AI, in characters. */
export const MAX_NOTES_CHARS = 30_000;

const GB = 1024 ** 3;

export type PlanLimits = {
  seats: number;
  aiRuns: number;
  storageBytes: number;
  file_ai: boolean;
  registers: boolean;
  workload: boolean;
  /** Days of activity history kept visible. null: unlimited. */
  activityDays: number | null;
};

export const PLAN_LIMITS: Record<WorkspacePlan, PlanLimits> = {
  trial: { seats: 5, aiRuns: 50, storageBytes: 1 * GB, file_ai: true, registers: true, workload: true, activityDays: 14 },
  starter: { seats: 5, aiRuns: 300, storageBytes: 5 * GB, file_ai: false, registers: false, workload: false, activityDays: 90 },
  team: { seats: 15, aiRuns: 1500, storageBytes: 50 * GB, file_ai: true, registers: true, workload: false, activityDays: 365 },
  business: { seats: 50, aiRuns: 5000, storageBytes: 250 * GB, file_ai: true, registers: true, workload: true, activityDays: null },
  enterprise: { seats: 1000, aiRuns: 50_000, storageBytes: 1024 * GB, file_ai: true, registers: true, workload: true, activityDays: null },
};

/** US dollars. Annual is two months free: 10 times the monthly price, billed once a year. */
export const PRICES: Record<PaidPlan, Record<BillingInterval, number>> = {
  starter: { month: 79, year: 790 },
  team: { month: 199, year: 1990 },
  business: { month: 499, year: 4990 },
};

export const PLAN_LABELS: Record<WorkspacePlan, string> = {
  trial: "Free trial",
  starter: "Starter",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
};

export const FEATURE_LABELS: Record<Feature, string> = {
  file_ai: "File and email AI, project inbox and Ask Forgeboard",
  registers: "RFI and submittal registers, and task dependencies",
  workload: "Workload, custom templates and scheduled reports",
};

export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "starter" || value === "team" || value === "business";
}

export function isInterval(value: unknown): value is BillingInterval {
  return value === "month" || value === "year";
}

/** The cheapest plan that includes a feature, for "Upgrade to Team" prompts. */
export function planUnlocking(feature: Feature): PaidPlan {
  return PAID_PLANS.find((plan) => PLAN_LIMITS[plan][feature]) ?? "business";
}

/** The cheapest plan with room for this many seats, or null if none (Enterprise). */
export function planForSeats(seats: number): PaidPlan | null {
  return PAID_PLANS.find((plan) => PLAN_LIMITS[plan].seats >= seats) ?? null;
}

/** "$199" or "$1,990". */
export function formatPrice(dollars: number) {
  return `$${dollars.toLocaleString("en-US")}`;
}

/** What an annual plan costs per month, rounded down, for "$165/mo billed yearly". */
export function monthlyEquivalent(plan: PaidPlan) {
  return Math.floor(PRICES[plan].year / 12);
}

/** "1 GB", "250 GB", "1.5 MB". */
export function formatBytes(bytes: number) {
  if (bytes >= GB) return `${+(bytes / GB).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${+(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Whole days until a moment, never negative. Day 14 of 14 shows 1. */
export function daysUntil(iso: string | null, now = Date.now()) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000));
}

/** A row from the database's workspace_limits() function. */
export type WorkspaceLimitsRow = {
  plan: WorkspacePlan;
  seats: number;
  seats_used: number;
  ai_runs: number;
  ai_runs_used: number;
  storage_bytes: number;
  storage_bytes_used: number;
  file_ai: boolean;
  registers: boolean;
  workload: boolean;
  activity_days: number | null;
  read_only_reason: ReadOnlyReason | null;
  trial_ends_at: string;
  grace_ends_at: string | null;
};

/** What the UI needs to show the plan's state: banners, meters and prompts. */
export type PlanState = {
  plan: WorkspacePlan;
  seats: number;
  seatsUsed: number;
  aiRuns: number;
  aiRunsUsed: number;
  storageBytes: number;
  storageBytesUsed: number;
  features: Record<Feature, boolean>;
  readOnly: ReadOnlyReason | null;
  trialEndsAt: string;
  graceEndsAt: string | null;
};

export function toPlanState(row: WorkspaceLimitsRow): PlanState {
  return {
    plan: row.plan,
    seats: row.seats,
    seatsUsed: row.seats_used,
    aiRuns: row.ai_runs,
    aiRunsUsed: row.ai_runs_used,
    storageBytes: Number(row.storage_bytes),
    storageBytesUsed: Number(row.storage_bytes_used),
    features: { file_ai: row.file_ai, registers: row.registers, workload: row.workload },
    readOnly: row.read_only_reason,
    trialEndsAt: row.trial_ends_at,
    graceEndsAt: row.grace_ends_at,
  };
}

/** Which banner, if any, the workspace should show. Most urgent first. */
export type PlanBanner =
  | { kind: "read_only"; reason: ReadOnlyReason }
  | { kind: "payment_failed"; graceEndsAt: string }
  | { kind: "over_seats"; seats: number; seatsUsed: number }
  | { kind: "trial_ending"; daysLeft: number };

/** Trial banners start this many days before the end. */
export const TRIAL_WARNING_DAYS = 3;

export function planBanner(state: PlanState, now = Date.now()): PlanBanner | null {
  if (state.readOnly) return { kind: "read_only", reason: state.readOnly };
  if (state.graceEndsAt) return { kind: "payment_failed", graceEndsAt: state.graceEndsAt };
  if (state.seatsUsed > state.seats) return { kind: "over_seats", seats: state.seats, seatsUsed: state.seatsUsed };
  if (state.plan === "trial") {
    const daysLeft = daysUntil(state.trialEndsAt, now);
    if (daysLeft <= TRIAL_WARNING_DAYS) return { kind: "trial_ending", daysLeft };
  }
  return null;
}
