import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getCurrentUser } from "@/lib/auth";
import { hasPaidAccess } from "@/lib/plans";
import { checkoutPath } from "@/lib/safe-next";
import { getStripe, isPaidPlan, priceIdFor } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

// GET /api/checkout?plan=team|business
// The pricing buttons are plain links here. Logged-out visitors go to sign-up first
// and come back; logged-in users are sent straight to a Stripe Checkout page.
export async function GET(request: NextRequest) {
  const plan = request.nextUrl.searchParams.get("plan");
  const go = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);

  if (!isPaidPlan(plan)) return go("/pricing");

  const user = await getCurrentUser();
  if (!user) return go(`/signup?next=${encodeURIComponent(checkoutPath(plan))}`);

  const stripe = getStripe();
  const priceId = priceIdFor(plan);
  const admin = createAdminClient();
  if (!stripe || !priceId || !admin) {
    console.error("Checkout isn't configured: set STRIPE_SECRET_KEY, STRIPE_PRICE_TEAM/BUSINESS and SUPABASE_SERVICE_ROLE_KEY.");
    return go("/pricing?checkout=unavailable");
  }

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, email, full_name, company_name, plan, subscription_status, stripe_customer_id, stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "id" | "email" | "full_name" | "company_name" | "plan" | "subscription_status" | "stripe_customer_id" | "stripe_subscription_id">>();
  if (error || !profile) {
    console.error("Checkout: couldn't load profile", error);
    return go("/pricing?checkout=error");
  }

  // Already subscribed: changing plans or canceling happens in the billing portal,
  // so nobody ends up paying for two subscriptions.
  if (hasPaidAccess(profile) && profile.stripe_subscription_id) {
    return go("/dashboard/billing?notice=already-subscribed");
  }

  try {
    const customerId = await findOrCreateCustomer(stripe, admin, profile, user.email);

    const origin = request.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id, plan },
      subscription_data: { metadata: { supabase_user_id: user.id, plan } },
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=canceled`,
    });

    if (!session.url) throw new Error("Stripe returned a session without a URL");
    return NextResponse.redirect(session.url, 303);
  } catch (err) {
    console.error("Checkout: Stripe error", err);
    return go("/pricing?checkout=error");
  }
}

type BillingProfile = Pick<Profile, "id" | "email" | "full_name" | "company_name" | "stripe_customer_id">;

// One Stripe customer per Forgeboard account, reused for every checkout and the portal.
async function findOrCreateCustomer(
  stripe: Stripe,
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  profile: BillingProfile,
  email: string | null,
): Promise<string> {
  if (profile.stripe_customer_id) {
    // Make sure it still exists in this Stripe account (e.g. after switching from test to live keys).
    try {
      const existing = await stripe.customers.retrieve(profile.stripe_customer_id);
      if (!existing.deleted) return existing.id;
    } catch (err) {
      if (!(err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing")) throw err;
    }
  }

  const customer = await stripe.customers.create({
    email: email ?? profile.email ?? undefined,
    name: profile.company_name || profile.full_name || undefined,
    metadata: { supabase_user_id: profile.id },
  });

  const { error } = await admin.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", profile.id);
  if (error) throw error;
  return customer.id;
}
