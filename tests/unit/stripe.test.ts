import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscriptionSyncFor } from "@/lib/billing/stripe-sync";
import { isInterval, isPaidPlan, planForPriceId, priceIdFor } from "@/lib/stripe";

// Only the fields subscriptionSyncFor reads.
function subscription(status: string, priceId: string, customer: string | { id: string } = "cus_1", extra: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status,
    customer,
    cancel_at_period_end: false,
    cancel_at: null,
    items: { data: [{ price: { id: priceId }, current_period_end: 1_800_000_000 }] },
    ...extra,
  } as unknown as Stripe.Subscription;
}

const PRICES = {
  STRIPE_PRICE_STARTER_MONTHLY: "price_starter_m",
  STRIPE_PRICE_STARTER_ANNUAL: "price_starter_y",
  STRIPE_PRICE_TEAM_MONTHLY: "price_team_m",
  STRIPE_PRICE_TEAM_ANNUAL: "price_team_y",
  STRIPE_PRICE_BUSINESS_MONTHLY: "price_business_m",
  STRIPE_PRICE_BUSINESS_ANNUAL: "price_business_y",
  STRIPE_PRICE_TEAM: "price_team_legacy",
  STRIPE_PRICE_BUSINESS: "price_business_legacy",
};

beforeEach(() => {
  for (const [name, value] of Object.entries(PRICES)) vi.stubEnv(name, value);
});
afterEach(() => vi.unstubAllEnvs());

describe("isPaidPlan and isInterval", () => {
  it("accept only the plans sold online", () => {
    expect(isPaidPlan("starter")).toBe(true);
    expect(isPaidPlan("team")).toBe(true);
    expect(isPaidPlan("business")).toBe(true);
    expect(isPaidPlan("enterprise")).toBe(false);
    expect(isPaidPlan("trial")).toBe(false);
    expect(isPaidPlan(undefined)).toBe(false);
  });

  it("accept only month and year", () => {
    expect(isInterval("month")).toBe(true);
    expect(isInterval("year")).toBe(true);
    expect(isInterval("week")).toBe(false);
  });
});

describe("price and plan lookup", () => {
  it("maps each plan and interval to its price and back", () => {
    expect(priceIdFor("starter", "month")).toBe("price_starter_m");
    expect(priceIdFor("team", "year")).toBe("price_team_y");
    expect(priceIdFor("business", "month")).toBe("price_business_m");
    expect(planForPriceId("price_starter_y")).toEqual({ plan: "starter", interval: "year" });
    expect(planForPriceId("price_business_m")).toEqual({ plan: "business", interval: "month" });
  });

  it("still recognizes the pre-Phase 2 prices as monthly", () => {
    expect(planForPriceId("price_team_legacy")).toEqual({ plan: "team", interval: "month" });
    expect(planForPriceId("price_business_legacy")).toEqual({ plan: "business", interval: "month" });
  });

  it("returns nothing for a price that isn't ours or isn't set", () => {
    expect(planForPriceId("price_other")).toBeNull();
    expect(planForPriceId(null)).toBeNull();
    vi.stubEnv("STRIPE_PRICE_STARTER_MONTHLY", "");
    expect(priceIdFor("starter", "month")).toBeUndefined();
    expect(planForPriceId("")).toBeNull();
  });
});

describe("subscriptionSyncFor", () => {
  it("grants the plan and interval for an active subscription", () => {
    expect(subscriptionSyncFor(subscription("active", "price_team_y"))).toEqual({
      plan: "team",
      interval: "year",
      status: "active",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      periodEnd: new Date(1_800_000_000 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
    });
  });

  it("passes through past_due so the grace period can apply", () => {
    expect(subscriptionSyncFor(subscription("past_due", "price_starter_m"))).toMatchObject({ plan: "starter", status: "past_due" });
  });

  it("reports an ended subscription with no plan", () => {
    for (const status of ["canceled", "incomplete_expired"]) {
      expect(subscriptionSyncFor(subscription(status, "price_team_m"))).toMatchObject({ plan: null, status });
    }
  });

  it("ignores a first payment in progress and unknown prices", () => {
    expect(subscriptionSyncFor(subscription("incomplete", "price_team_m"))).toBeNull();
    expect(subscriptionSyncFor(subscription("active", "price_other"))).toBeNull();
  });

  it("notes a scheduled cancellation and reads an expanded customer", () => {
    const sync = subscriptionSyncFor(subscription("active", "price_team_m", { id: "cus_9" }, { cancel_at_period_end: true }));
    expect(sync).toMatchObject({ customerId: "cus_9", cancelAtPeriodEnd: true });
  });
});
