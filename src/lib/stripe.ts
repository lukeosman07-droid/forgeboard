import "server-only";
import Stripe from "stripe";
import type { Plan } from "./types";

// Plans you can buy online. Enterprise is sold by email.
export type PaidPlan = "team" | "business";

export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "team" || value === "business";
}

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

/** The Stripe price ID for a plan, from STRIPE_PRICE_TEAM / STRIPE_PRICE_BUSINESS. */
export function priceIdFor(plan: PaidPlan): string | undefined {
  return plan === "team" ? process.env.STRIPE_PRICE_TEAM : process.env.STRIPE_PRICE_BUSINESS;
}

/** Reverse lookup: which plan a Stripe price ID belongs to (null if it's not one of ours). */
export function planForPriceId(priceId: string | undefined | null): PaidPlan | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_TEAM) return "team";
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return "business";
  return null;
}

// Subscription states where the customer still has (or may soon regain) the plan.
// "canceled" and "incomplete_expired" are final: the account goes back to free.
const ENDED_STATUSES: Stripe.Subscription.Status[] = ["canceled", "incomplete_expired"];

export type ProfileBillingUpdate = {
  plan: Plan;
  subscription_status: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
};

/**
 * What the profile should look like for a given subscription. Paid access in the
 * app requires subscription_status "active" (see hasPaidAccess in plans.ts), so a
 * past_due subscription keeps its plan name but loses access until it's paid.
 */
export function profileUpdateFor(sub: Stripe.Subscription): ProfileBillingUpdate | null {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  if (ENDED_STATUSES.includes(sub.status)) {
    return { plan: "free", subscription_status: "canceled", stripe_customer_id: customerId, stripe_subscription_id: null };
  }

  const plan = planForPriceId(sub.items.data[0]?.price.id);
  if (!plan) return null; // A price we don't know about: leave the profile alone.

  return { plan, subscription_status: sub.status, stripe_customer_id: customerId, stripe_subscription_id: sub.id };
}
