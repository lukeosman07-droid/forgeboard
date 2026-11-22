import { NextResponse, type NextRequest } from "next/server";
import { checkoutPath } from "@/lib/safe-next";
import { PLAN_LIMITS, isInterval, isPaidPlan } from "@/lib/plans";
import { getStripe, priceIdFor } from "@/lib/stripe";
import { findOrCreateCustomer, hasLiveSubscription, loadOwnedWorkspace } from "@/server/billing";
import { Slug } from "@/server/schemas";

// GET /api/checkout?plan=starter|team|business&interval=month|year&workspace=<slug>
// The pricing buttons are plain links here. Logged-out visitors go to sign-up
// first and come back; the owner of a workspace goes to Stripe Checkout, and
// the subscription belongs to that workspace.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const plan = params.get("plan");
  const interval = params.get("interval") ?? "month";
  const slugParam = params.get("workspace");
  const go = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);

  if (!isPaidPlan(plan) || !isInterval(interval)) return go("/pricing");
  const slug = slugParam && Slug.safeParse(slugParam).success ? slugParam : null;

  const owned = await loadOwnedWorkspace(slug);
  if (!owned.ok) {
    if (owned.reason === "signed_out") return go(`/signup?next=${encodeURIComponent(checkoutPath(plan, interval))}`);
    if (owned.reason === "not_found") return go("/pricing?checkout=error");
    if (owned.reason === "not_owner") return go(`/w/${owned.slug}/billing?notice=owner-only`);
    return go("/pricing?checkout=unavailable");
  }
  const { workspace, admin, user } = owned;
  const billing = `/w/${workspace.slug}/billing`;

  const stripe = getStripe();
  const priceId = priceIdFor(plan, interval);
  if (!stripe || !priceId) {
    console.error(`Checkout isn't configured: set STRIPE_SECRET_KEY and the ${plan} ${interval} price ID.`);
    return go("/pricing?checkout=unavailable");
  }

  // Already subscribed: switching plans happens on the billing page, so nobody
  // ends up paying for two subscriptions.
  if (hasLiveSubscription(workspace)) return go(`${billing}?notice=already-subscribed`);

  // A plan smaller than the team isn't sold; the billing page lists who to remove.
  if (workspace.seatsUsed > PLAN_LIMITS[plan].seats) return go(`${billing}?notice=too-many-seats&plan=${plan}`);

  try {
    const customerId = await findOrCreateCustomer(stripe, admin, workspace, user.email);
    const metadata = { workspace_id: workspace.id, plan, interval, started_by: user.id };
    const origin = request.nextUrl.origin;
    const automaticTax = process.env.STRIPE_AUTOMATIC_TAX === "true";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: workspace.id,
      metadata,
      subscription_data: { metadata },
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "required",
      // Stripe Tax: turn on in the Stripe dashboard first, then set STRIPE_AUTOMATIC_TAX=true.
      ...(automaticTax ? { automatic_tax: { enabled: true }, customer_update: { address: "auto", name: "auto" } } : {}),
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${billing}?notice=checkout-canceled`,
    });

    if (!session.url) throw new Error("Stripe returned a session without a URL");
    return NextResponse.redirect(session.url, 303);
  } catch (err) {
    console.error("Checkout: Stripe error", err);
    return go(`${billing}?notice=checkout-error`);
  }
}
