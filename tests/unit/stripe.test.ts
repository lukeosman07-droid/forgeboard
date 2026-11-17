import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPaidPlan, planForPriceId, priceIdFor, profileUpdateFor } from "@/lib/stripe";

// Only the fields profileUpdateFor reads.
function subscription(status: string, priceId: string, customer: string | { id: string } = "cus_1") {
  return {
    id: "sub_1",
    status,
    customer,
    items: { data: [{ price: { id: priceId } }] },
  } as unknown as Stripe.Subscription;
}

beforeEach(() => {
  vi.stubEnv("STRIPE_PRICE_TEAM", "price_team");
  vi.stubEnv("STRIPE_PRICE_BUSINESS", "price_business");
});
afterEach(() => vi.unstubAllEnvs());

describe("isPaidPlan", () => {
  it("accepts only the plans sold online", () => {
    expect(isPaidPlan("team")).toBe(true);
    expect(isPaidPlan("business")).toBe(true);
    expect(isPaidPlan("enterprise")).toBe(false);
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan(undefined)).toBe(false);
  });
});

describe("price and plan lookup", () => {
  it("maps each plan to its price and back", () => {
    expect(priceIdFor("team")).toBe("price_team");
    expect(priceIdFor("business")).toBe("price_business");
    expect(planForPriceId("price_team")).toBe("team");
    expect(planForPriceId("price_business")).toBe("business");
  });

  it("returns null for a price that isn't ours", () => {
    expect(planForPriceId("price_other")).toBeNull();
    expect(planForPriceId(null)).toBeNull();
    expect(planForPriceId(undefined)).toBeNull();
  });

  it("doesn't match an empty price when the env vars are missing", () => {
    vi.stubEnv("STRIPE_PRICE_TEAM", "");
    expect(planForPriceId("")).toBeNull();
  });
});

describe("profileUpdateFor", () => {
  it("grants the plan for an active subscription", () => {
    expect(profileUpdateFor(subscription("active", "price_business"))).toEqual({
      plan: "business",
      subscription_status: "active",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    });
  });

  it("keeps the plan name but passes through a past_due status", () => {
    expect(profileUpdateFor(subscription("past_due", "price_team"))).toMatchObject({
      plan: "team",
      subscription_status: "past_due",
    });
  });

  it("returns the account to free when the subscription has ended", () => {
    for (const status of ["canceled", "incomplete_expired"]) {
      expect(profileUpdateFor(subscription(status, "price_team"))).toEqual({
        plan: "free",
        subscription_status: "canceled",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: null,
      });
    }
  });

  it("ignores a subscription on a price it doesn't know", () => {
    expect(profileUpdateFor(subscription("active", "price_other"))).toBeNull();
  });

  it("reads the customer ID from an expanded customer object", () => {
    expect(profileUpdateFor(subscription("active", "price_team", { id: "cus_9" }))?.stripe_customer_id).toBe("cus_9");
  });
});
