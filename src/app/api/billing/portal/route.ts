import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { loadOwnedWorkspace } from "@/server/billing";
import { Slug } from "@/server/schemas";

// POST /api/billing/portal (the "Manage billing" button), form field: workspace=<slug>
// Opens the Stripe Customer Portal, where the owner updates the card, downloads
// invoices, or cancels.
export async function POST(request: NextRequest) {
  const go = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
  const form = await request.formData().catch(() => null);
  const slug = Slug.safeParse(form?.get("workspace"));
  if (!slug.success) return go("/dashboard");

  const owned = await loadOwnedWorkspace(slug.data);
  if (!owned.ok) {
    if (owned.reason === "signed_out") return go(`/login?next=/w/${slug.data}/billing`);
    if (owned.reason === "not_owner") return go(`/w/${slug.data}/billing?notice=owner-only`);
    if (owned.reason === "unconfigured") return go(`/w/${slug.data}/billing?notice=portal-unavailable`);
    return go("/dashboard");
  }
  const billing = `/w/${owned.workspace.slug}/billing`;

  const stripe = getStripe();
  if (!stripe) return go(`${billing}?notice=portal-unavailable`);
  if (!owned.workspace.stripe_customer_id) return go(`${billing}?notice=no-customer`);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: owned.workspace.stripe_customer_id,
      return_url: `${request.nextUrl.origin}${billing}`,
    });
    return NextResponse.redirect(session.url, 303);
  } catch (err) {
    // Most common cause in test mode: the Customer Portal hasn't been turned on yet.
    console.error("Billing portal: Stripe error", err);
    return go(`${billing}?notice=portal-error`);
  }
}
