import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/billing/portal (the "Manage billing" button)
// Opens the Stripe Customer Portal, where customers update their card or cancel.
export async function POST(request: NextRequest) {
  const go = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);

  const user = await getCurrentUser();
  if (!user) return go("/login?next=/dashboard/billing");

  const stripe = getStripe();
  const admin = createAdminClient();
  if (!stripe || !admin) return go("/dashboard/billing?notice=portal-unavailable");

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle<{ stripe_customer_id: string | null }>();
  if (!profile?.stripe_customer_id) return go("/dashboard/billing?notice=no-customer");

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${request.nextUrl.origin}/dashboard/billing`,
    });
    return NextResponse.redirect(session.url, 303);
  } catch (err) {
    // Most common cause in test mode: the Customer Portal hasn't been turned on yet.
    console.error("Billing portal: Stripe error", err);
    return go("/dashboard/billing?notice=portal-error");
  }
}
