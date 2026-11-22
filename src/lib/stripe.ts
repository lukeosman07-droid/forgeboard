import "server-only";
import Stripe from "stripe";
import type { BillingInterval, PaidPlan } from "./plans";

export { isInterval, isPaidPlan } from "./plans";

let client: Stripe | null = null;

// Server-only Stripe client. Returns null until STRIPE_SECRET_KEY is set, so the
// rest of the app keeps working (and builds) without Stripe configured.
// Created lazily so a missing key never breaks `npm run build`.
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key);
  return client;
}

// One monthly and one annual price per plan, e.g. STRIPE_PRICE_TEAM_ANNUAL.
const PRICE_ENV: Record<PaidPlan, Record<BillingInterval, string>> = {
  starter: { month: "STRIPE_PRICE_STARTER_MONTHLY", year: "STRIPE_PRICE_STARTER_ANNUAL" },
  team: { month: "STRIPE_PRICE_TEAM_MONTHLY", year: "STRIPE_PRICE_TEAM_ANNUAL" },
  business: { month: "STRIPE_PRICE_BUSINESS_MONTHLY", year: "STRIPE_PRICE_BUSINESS_ANNUAL" },
};

// Prices from before Phase 2 ($299 Team, $799 Business, monthly). Nothing new is
// sold at these; they are recognized so existing subscriptions keep their plan.
const LEGACY_PRICE_ENV: { env: string; plan: PaidPlan }[] = [
  { env: "STRIPE_PRICE_TEAM", plan: "team" },
  { env: "STRIPE_PRICE_BUSINESS", plan: "business" },
];

/** The Stripe price ID to charge for a plan, or undefined when it isn't configured. */
export function priceIdFor(plan: PaidPlan, interval: BillingInterval): string | undefined {
  return process.env[PRICE_ENV[plan][interval]] || undefined;
}

/** Reverse lookup: which plan and interval a Stripe price ID is (null if it's not one of ours). */
export function planForPriceId(priceId: string | undefined | null): { plan: PaidPlan; interval: BillingInterval } | null {
  if (!priceId) return null;
  for (const [plan, byInterval] of Object.entries(PRICE_ENV) as [PaidPlan, Record<BillingInterval, string>][]) {
    for (const [interval, env] of Object.entries(byInterval) as [BillingInterval, string][]) {
      if (process.env[env] && process.env[env] === priceId) return { plan, interval };
    }
  }
  const legacy = LEGACY_PRICE_ENV.find(({ env }) => process.env[env] && process.env[env] === priceId);
  return legacy ? { plan: legacy.plan, interval: "month" } : null;
}
