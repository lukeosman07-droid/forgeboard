import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { BillingInterval, PaidPlan } from "@/lib/plans";
import { planForPriceId } from "@/lib/stripe";

// Applies Stripe's view of a subscription to a workspace. Used by the webhook
// (the only place plans are granted or removed) and right after an in-app plan
// change. Writes go through the service-role client because members may not
// touch billing columns; the SQL functions they call hold the rules.

/** The parts of the Stripe client this module uses, so tests can pass a fake. */
export type StripeApi = { subscriptions: { retrieve(id: string): Promise<Stripe.Subscription> } };

// "canceled" and "incomplete_expired" are final: the workspace loses the plan.
const ENDED_STATUSES: Stripe.Subscription.Status[] = ["canceled", "incomplete_expired"];

export type SubscriptionSync = {
  /** null when the subscription has ended. */
  plan: PaidPlan | null;
  status: string;
  customerId: string;
  subscriptionId: string;
  interval: BillingInterval | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

/**
 * What the workspace should record for a subscription, or null to leave it
 * alone: a first payment still in progress ("incomplete"), or a price that
 * isn't one of ours.
 */
export function subscriptionSyncFor(sub: Stripe.Subscription): SubscriptionSync | null {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const base = { status: sub.status, customerId, subscriptionId: sub.id };

  if (ENDED_STATUSES.includes(sub.status)) {
    return { ...base, plan: null, interval: null, periodEnd: null, cancelAtPeriodEnd: false };
  }
  if (sub.status === "incomplete") return null;

  const item = sub.items.data[0];
  const match = planForPriceId(item?.price.id);
  if (!match) return null;

  const end = item?.current_period_end;
  return {
    ...base,
    plan: match.plan,
    interval: match.interval,
    periodEnd: end ? new Date(end * 1000).toISOString() : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Which workspace a subscription belongs to: the ID checkout stored on it, else
 * the workspace that already holds this subscription or customer. (Subscriptions
 * bought before Phase 2 only carry a user ID; their customer ID was copied onto
 * the workspace when workspaces were introduced.)
 */
async function findWorkspace(admin: SupabaseClient, hint: string | null | undefined, subscriptionId: string, customerId: string) {
  const lookups: [string, string][] = [];
  if (hint && UUID.test(hint)) lookups.push(["id", hint]);
  lookups.push(["stripe_subscription_id", subscriptionId], ["stripe_customer_id", customerId]);

  for (const [column, value] of lookups) {
    const { data, error } = await admin.from("workspaces").select("id").eq(column, value).maybeSingle<{ id: string }>();
    if (error) throw error;
    if (data) return data.id;
  }
  return null;
}

/** Re-reads the subscription from Stripe and saves it on its workspace. Returns the workspace ID. */
export async function syncSubscription(
  stripe: StripeApi,
  admin: SupabaseClient,
  subscriptionId: string,
  workspaceHint: string | null,
): Promise<string | null> {
  // Always re-read instead of trusting an event payload, so events arriving
  // late or out of order still leave the workspace correct.
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const update = subscriptionSyncFor(sub);
  if (!update) {
    console.warn(`Stripe: subscription ${sub.id} (${sub.status}) isn't on one of our prices yet; left as is.`);
    return null;
  }

  const workspaceId = await findWorkspace(admin, workspaceHint ?? sub.metadata?.workspace_id, sub.id, update.customerId);
  if (!workspaceId) {
    console.warn(`Stripe: no workspace found for subscription ${sub.id}; ignored.`);
    return null;
  }

  const { error } = await admin.rpc("sync_workspace_subscription", {
    p_workspace: workspaceId,
    p_customer: update.customerId,
    p_subscription: update.subscriptionId,
    p_plan: update.plan,
    p_status: update.status,
    p_interval: update.interval,
    p_period_end: update.periodEnd,
    p_cancel_at_period_end: update.cancelAtPeriodEnd,
  });
  if (error) throw error;
  console.log(`Stripe: workspace ${workspaceId} -> plan=${update.plan ?? "ended"} status=${update.status}`);
  return workspaceId;
}

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : (value?.id ?? null));

export type EventOutcome = "processed" | "duplicate" | "ignored";

/**
 * Handles one verified Stripe event. Each event ID is recorded in stripe_events
 * once it has been handled, and a repeat is skipped, so Stripe retrying or
 * replaying an event changes nothing. The handlers are also safe to run twice
 * (they re-read state, and the grace period counts from the first failure), so
 * two copies arriving at the same moment are harmless too.
 */
export async function handleStripeEvent(
  event: Stripe.Event,
  deps: { stripe: StripeApi; admin: SupabaseClient; onPaymentFailed?: (workspaceId: string) => Promise<void> },
): Promise<EventOutcome> {
  const { stripe, admin } = deps;

  const { data: seen, error: seenError } = await admin.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seenError) throw seenError;
  if (seen) return "duplicate";

  let workspaceId: string | null = null;
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const subscriptionId = idOf(session.subscription);
      if (session.mode !== "subscription" || !subscriptionId) return "ignored";
      workspaceId = await syncSubscription(stripe, admin, subscriptionId, session.metadata?.workspace_id ?? session.client_reference_id);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      workspaceId = await syncSubscription(stripe, admin, sub.id, sub.metadata?.workspace_id ?? null);
      break;
    }
    case "invoice.payment_failed": {
      const customerId = idOf(event.data.object.customer);
      if (!customerId) return "ignored";
      // The grace period runs from when Stripe saw the failure, not from when we
      // processed it, so a late or repeated delivery doesn't move it.
      const { data, error } = await admin.rpc("record_payment_failed", {
        p_customer: customerId,
        p_failed_at: new Date(event.created * 1000).toISOString(),
      });
      if (error) throw error;
      workspaceId = (data as string | null) ?? null;
      break;
    }
    case "invoice.paid": {
      const customerId = idOf(event.data.object.customer);
      if (!customerId) return "ignored";
      const { data, error } = await admin.rpc("record_payment_succeeded", { p_customer: customerId });
      if (error) throw error;
      workspaceId = (data as string | null) ?? null;
      break;
    }
    default:
      return "ignored";
  }

  const { error } = await admin
    .from("stripe_events")
    .upsert({ id: event.id, type: event.type, workspace_id: workspaceId }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;

  if (event.type === "invoice.payment_failed" && workspaceId && deps.onPaymentFailed) {
    // Best effort: a failed email must not make Stripe retry (the event is recorded).
    await deps.onPaymentFailed(workspaceId).catch((err) => console.error("Payment-failed email:", err));
  }
  return "processed";
}
