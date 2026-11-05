import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, profileUpdateFor } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/stripe/webhook
// Stripe calls this when a checkout finishes or a subscription changes. This is the
// ONLY place plans are granted or removed; the success page just reads the result.
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const admin = createAdminClient();
  if (!stripe || !secret || !admin) {
    console.error("Stripe webhook isn't configured: set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and SUPABASE_SERVICE_ROLE_KEY.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Verify the signature against the raw body so nobody can fake a "payment succeeded" call.
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch (err) {
    console.error("Stripe webhook: bad signature", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscription(stripe, admin, subId, session.client_reference_id);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(stripe, admin, event.data.object.id, null);
        break;
      }
      default:
        // Other events are ignored. They still get a 200 so Stripe doesn't retry them.
        break;
    }
  } catch (err) {
    // A 500 makes Stripe retry later, so a brief database hiccup doesn't lose a payment.
    console.error(`Stripe webhook: failed to handle ${event.type}`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Always re-reads the subscription from Stripe instead of trusting the event payload,
// so events arriving late or out of order still leave the profile correct.
async function syncSubscription(
  stripe: Stripe,
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  subscriptionId: string,
  userIdHint: string | null,
) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const update = profileUpdateFor(sub);
  if (!update) {
    console.warn(`Stripe webhook: subscription ${sub.id} uses a price that isn't STRIPE_PRICE_TEAM or STRIPE_PRICE_BUSINESS; ignored.`);
    return;
  }

  // Find the Forgeboard account: checkout passes the user id directly, and the
  // subscription carries it in metadata. Fall back to the saved customer id.
  const userId = userIdHint ?? sub.metadata?.supabase_user_id ?? null;
  const query = admin.from("profiles").select("id, stripe_subscription_id");
  const { data: profile, error } = await (userId
    ? query.eq("id", userId)
    : query.eq("stripe_customer_id", update.stripe_customer_id)
  ).maybeSingle<{ id: string; stripe_subscription_id: string | null }>();
  if (error) throw error;
  if (!profile) {
    console.warn(`Stripe webhook: no Forgeboard account found for subscription ${sub.id}; ignored.`);
    return;
  }

  // An old subscription ending must not wipe out a newer one on the same account.
  if (!update.stripe_subscription_id && profile.stripe_subscription_id && profile.stripe_subscription_id !== sub.id) {
    return;
  }

  const { error: updateError } = await admin.from("profiles").update(update).eq("id", profile.id);
  if (updateError) throw updateError;
  console.log(`Stripe webhook: ${profile.id} -> plan=${update.plan} status=${update.subscription_status}`);
}
