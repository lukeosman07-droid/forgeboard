import { describe, expect, it } from "vitest";
import { FREE_TRIAL_EXTRACTIONS, PLAN_LABELS, hasPaidAccess, trialExtractionsLeft } from "@/lib/plans";

describe("hasPaidAccess", () => {
  it("is true for a paid plan with an active subscription", () => {
    expect(hasPaidAccess({ plan: "team", subscription_status: "active" })).toBe(true);
    expect(hasPaidAccess({ plan: "business", subscription_status: "active" })).toBe(true);
    expect(hasPaidAccess({ plan: "enterprise", subscription_status: "active" })).toBe(true);
  });

  it("is false on the free plan, whatever the status says", () => {
    expect(hasPaidAccess({ plan: "free", subscription_status: null })).toBe(false);
    expect(hasPaidAccess({ plan: "free", subscription_status: "active" })).toBe(false);
  });

  it("is false when a paid plan's subscription isn't active", () => {
    for (const status of ["past_due", "canceled", "incomplete", "unpaid", null]) {
      expect(hasPaidAccess({ plan: "team", subscription_status: status })).toBe(false);
    }
  });
});

describe("trialExtractionsLeft", () => {
  it("counts down from the trial allowance", () => {
    expect(trialExtractionsLeft({ ai_extractions_used: 0 })).toBe(FREE_TRIAL_EXTRACTIONS);
    expect(trialExtractionsLeft({ ai_extractions_used: 1 })).toBe(FREE_TRIAL_EXTRACTIONS - 1);
  });

  it("never goes below zero", () => {
    expect(trialExtractionsLeft({ ai_extractions_used: FREE_TRIAL_EXTRACTIONS })).toBe(0);
    expect(trialExtractionsLeft({ ai_extractions_used: FREE_TRIAL_EXTRACTIONS + 50 })).toBe(0);
  });
});

describe("PLAN_LABELS", () => {
  it("has a label for every plan", () => {
    expect(Object.keys(PLAN_LABELS).sort()).toEqual(["business", "enterprise", "free", "team"]);
  });
});
