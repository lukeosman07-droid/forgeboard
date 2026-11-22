import { describe, expect, it } from "vitest";
import {
  PLAN_LABELS,
  PLAN_LIMITS,
  PRICES,
  daysUntil,
  formatBytes,
  monthlyEquivalent,
  planBanner,
  planForSeats,
  planUnlocking,
  toPlanState,
  type PlanState,
  type WorkspaceLimitsRow,
} from "@/lib/plans";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-22T12:00:00Z");

function state(overrides: Partial<PlanState> = {}): PlanState {
  return {
    plan: "team",
    seats: 15,
    seatsUsed: 3,
    aiRuns: 1500,
    aiRunsUsed: 0,
    storageBytes: 50 * 1024 ** 3,
    storageBytesUsed: 0,
    features: { file_ai: true, registers: true, workload: false },
    readOnly: null,
    trialEndsAt: "2026-01-01T00:00:00Z",
    graceEndsAt: null,
    ...overrides,
  };
}

describe("PLAN_LIMITS", () => {
  it("matches the spec's seat counts", () => {
    expect(PLAN_LIMITS.trial.seats).toBe(5);
    expect(PLAN_LIMITS.starter.seats).toBe(5);
    expect(PLAN_LIMITS.team.seats).toBe(15);
    expect(PLAN_LIMITS.business.seats).toBe(50);
  });

  it("gives every higher plan at least what the one below has", () => {
    const order = ["starter", "team", "business", "enterprise"] as const;
    for (let i = 1; i < order.length; i++) {
      const lower = PLAN_LIMITS[order[i - 1]];
      const higher = PLAN_LIMITS[order[i]];
      expect(higher.seats).toBeGreaterThanOrEqual(lower.seats);
      expect(higher.aiRuns).toBeGreaterThanOrEqual(lower.aiRuns);
      expect(higher.storageBytes).toBeGreaterThanOrEqual(lower.storageBytes);
    }
  });

  it("keeps file AI and registers off Starter", () => {
    expect(PLAN_LIMITS.starter.file_ai).toBe(false);
    expect(PLAN_LIMITS.starter.registers).toBe(false);
    expect(PLAN_LIMITS.team.file_ai).toBe(true);
  });
});

describe("prices", () => {
  it("uses the spec's defaults", () => {
    expect(PRICES.starter).toEqual({ month: 79, year: 790 });
    expect(PRICES.team).toEqual({ month: 199, year: 1990 });
    expect(PRICES.business).toEqual({ month: 499, year: 4990 });
  });

  it("annual works out cheaper per month", () => {
    for (const plan of ["starter", "team", "business"] as const) {
      expect(monthlyEquivalent(plan)).toBeLessThan(PRICES[plan].month);
    }
  });
});

describe("planUnlocking and planForSeats", () => {
  it("names the cheapest plan with a feature", () => {
    expect(planUnlocking("file_ai")).toBe("team");
    expect(planUnlocking("registers")).toBe("team");
    expect(planUnlocking("workload")).toBe("business");
  });

  it("names the cheapest plan with room for a team", () => {
    expect(planForSeats(5)).toBe("starter");
    expect(planForSeats(6)).toBe("team");
    expect(planForSeats(50)).toBe("business");
    expect(planForSeats(51)).toBeNull();
  });
});

describe("daysUntil", () => {
  it("rounds up partial days and never goes negative", () => {
    expect(daysUntil(new Date(NOW + 2.5 * DAY).toISOString(), NOW)).toBe(3);
    expect(daysUntil(new Date(NOW - DAY).toISOString(), NOW)).toBe(0);
    expect(daysUntil(null, NOW)).toBe(0);
  });
});

describe("formatBytes", () => {
  it("uses readable units", () => {
    expect(formatBytes(0)).toMatch(/^0/);
    expect(formatBytes(1024 ** 3)).toBe("1 GB");
  });
});

describe("toPlanState", () => {
  it("converts the database row", () => {
    const row: WorkspaceLimitsRow = {
      plan: "starter",
      seats: 5,
      seats_used: 2,
      ai_runs: 300,
      ai_runs_used: 7,
      storage_bytes: 5 * 1024 ** 3,
      storage_bytes_used: 10,
      file_ai: false,
      registers: false,
      workload: false,
      activity_days: 90,
      read_only_reason: null,
      trial_ends_at: "2026-01-01T00:00:00Z",
      grace_ends_at: null,
    };
    expect(toPlanState(row)).toMatchObject({ plan: "starter", seatsUsed: 2, aiRunsUsed: 7, features: { file_ai: false }, readOnly: null });
  });
});

describe("planBanner", () => {
  it("shows nothing for a healthy paid workspace", () => {
    expect(planBanner(state(), NOW)).toBeNull();
  });

  it("puts read-only first", () => {
    expect(planBanner(state({ readOnly: "trial_ended", graceEndsAt: "2026-11-30T00:00:00Z" }), NOW)).toEqual({ kind: "read_only", reason: "trial_ended" });
  });

  it("warns about a failed payment during the grace period", () => {
    expect(planBanner(state({ graceEndsAt: "2026-11-29T00:00:00Z" }), NOW)).toMatchObject({ kind: "payment_failed" });
  });

  it("warns when more people use the workspace than the plan allows", () => {
    expect(planBanner(state({ plan: "starter", seats: 5, seatsUsed: 7 }), NOW)).toEqual({ kind: "over_seats", seats: 5, seatsUsed: 7 });
  });

  it("warns only in the last days of a trial", () => {
    const trial = (days: number) => state({ plan: "trial", trialEndsAt: new Date(NOW + days * DAY).toISOString() });
    expect(planBanner(trial(10), NOW)).toBeNull();
    expect(planBanner(trial(3), NOW)).toEqual({ kind: "trial_ending", daysLeft: 3 });
    expect(planBanner(trial(0.5), NOW)).toEqual({ kind: "trial_ending", daysLeft: 1 });
  });
});

describe("PLAN_LABELS", () => {
  it("has a label for every workspace plan", () => {
    expect(Object.keys(PLAN_LABELS).sort()).toEqual(["business", "enterprise", "starter", "team", "trial"]);
  });
});
