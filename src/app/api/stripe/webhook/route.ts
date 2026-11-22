import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { siteUrl } from "@/lib/account";
import { handleStripeEvent } from "@/lib/billing/stripe-sync";
import { sendPaymentFailedEmail } from "@/lib/email";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/stripe/webhook
// Stripe calls this when a checkout finishes, a subscription changes, or an
// invoice is paid or fails. This is the ONLY place plans are granted or removed.
// It uses the service-role client because billing columns can't be written by
// users at all; the signature check below is what makes the call trustworthy.
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
    const outcome = await handleStripeEvent(event, {
      stripe,
      admin,
      onPaymentFailed: async (workspaceId) => {
        const { data: workspace } = await admin
          .from("workspaces")
          .select("name, slug, grace_ends_at")
          .eq("id", workspaceId)
          .maybeSingle<{ name: string; slug: string; grace_ends_at: string | null }>();
        const { data: owner } = await admin
          .from("workspace_members")
          .select("user_id")
          .eq("workspace_id", workspaceId)
          .eq("role", "owner")
          .maybeSingle<{ user_id: string }>();
        const { data: profile } = owner
          ? await admin.from("profiles").select("email").eq("id", owner.user_id).maybeSingle<{ email: string | null }>()
          : { data: null };
        const to = profile?.email;
        if (!workspace || !to) return;
        await sendPaymentFailedEmail(to, {
          workspaceName: workspace.name,
          graceEndsOn: workspace.grace_ends_at
            ? new Date(workspace.grace_ends_at).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })
            : "the end of the grace period",
          link: `${siteUrl()}/w/${workspace.slug}/billing`,
        });
      },
    });
    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    // A 500 makes Stripe retry later, so a brief database hiccup doesn't lose a payment.
    // The event isn't recorded as handled until it succeeds.
    console.error(`Stripe webhook: failed to handle ${event.type}`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
