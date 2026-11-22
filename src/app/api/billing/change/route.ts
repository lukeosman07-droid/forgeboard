import { NextResponse, type NextRequest } from "next/server";
import { syncSubscription } from "@/lib/billing/stripe-sync";
import { PLAN_LIMITS, isInterval, isPaidPlan } from "@/lib/plans";
import { getStripe, priceIdFor } from "@/lib/stripe";
import { hasLiveSubscription, loadOwnedWorkspace } from "@/server/billing";
import { Slug } from "@/server/schemas";

// POST /api/billing/change  form: workspace=<slug>, plan, interval
// Switches an existing subscription to another plan or interval, prorated.
// A plan with fewer seats than the people in the workspace is refused here, and
// the billing page lists who would need to go first.
export async function POST(request: NextRequest) {
  const go = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
  const form = await request.formData().catch(() => null);
  const slug = Slug.safeParse(form?.get("workspace"));
  const plan = form?.get("plan");
  const interval = form?.get("interval") ?? "month";
  if (!slug.success) return go("/dashboard");
  const billing = `/w/${slug.data}/billing`;
  if (!isPaidPlan(plan) || !isInterval(interval)) return go(billing);

  const owned = await loadOwnedWorkspace(slug.data);
  if (!owned.ok) return go(owned.reason === "signed_out" ? `/login?next=${billing}` : `${billing}?notice=owner-only`);
  const { workspace, admin } = owned;

  const stripe = getStripe();
  const priceId = priceIdFor(plan, interval);
  if (!stripe || !priceId) return go(`${billing}?notice=portal-unavailable`);
  if (!hasLiveSubscription(workspace)) return go(`${billing}?notice=no-subscription`);
  if (workspace.seatsUsed > PLAN_LIMITS[plan].seats) return go(`${billing}?notice=too-many-seats&plan=${plan}`);

  try {
    const sub = await stripe.subscriptions.retrieve(workspace.stripe_subscription_id!);
    const item = sub.items.data[0];
    if (!item) throw new Error(`Subscription ${sub.id} has no items`);
    if (item.price.id !== priceId) {
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: "create_prorations",
        // Switching back after "cancel at period end" keeps the subscription going.
        cancel_at_period_end: false,
        metadata: { ...sub.metadata, workspace_id: workspace.id, plan, interval },
      });
    }
    // The webhook will say the same thing a moment later; this makes the page right at once.
    await syncSubscription(stripe, admin, sub.id, workspace.id);
    return go(`${billing}?notice=plan-changed`);
  } catch (err) {
    console.error("Plan change: Stripe error", err);
    return go(`${billing}?notice=change-error`);
  }
}
