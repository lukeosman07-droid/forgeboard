import "server-only";
import Stripe from "stripe";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { WorkspacePlan } from "@/lib/types";
import { defaultWorkspaceSlug } from "@/lib/workspaces";

// Shared by the billing routes (checkout, portal, plan change) and workspace
// deletion. Only a workspace's owner may start or change billing.
// The Stripe IDs are read with the service-role client because members can't
// select those columns; the owner check happens first, with the user's client.

export type BillingWorkspace = {
  id: string;
  name: string;
  slug: string;
  plan: WorkspacePlan;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  seatsUsed: number;
};

export type OwnedWorkspace =
  | { ok: true; user: CurrentUser; workspace: BillingWorkspace; admin: NonNullable<ReturnType<typeof createAdminClient>> }
  | { ok: false; reason: "signed_out" | "not_found" | "not_owner" | "unconfigured"; slug?: string };

/** The workspace at `slug` (or the user's default one), if the signed-in user owns it. */
export async function loadOwnedWorkspace(slug: string | null): Promise<OwnedWorkspace> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return { ok: false, reason: "signed_out" };

  const wanted = slug ?? (await defaultWorkspaceSlug());
  if (!wanted) return { ok: false, reason: "not_found" };

  // Row Level Security: only members find the workspace.
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name, slug, plan, subscription_status")
    .eq("slug", wanted)
    .maybeSingle<Pick<BillingWorkspace, "id" | "name" | "slug" | "plan" | "subscription_status">>();
  if (!ws) return { ok: false, reason: "not_found" };

  const [{ data: role }, { data: seatsUsed }] = await Promise.all([
    supabase.rpc("workspace_role", { ws: ws.id }),
    supabase.rpc("workspace_seats_used", { ws: ws.id }),
  ]);
  if (role !== "owner") return { ok: false, reason: "not_owner", slug: ws.slug };

  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "unconfigured", slug: ws.slug };
  const { data: ids, error } = await admin
    .from("workspaces")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("id", ws.id)
    .single<{ stripe_customer_id: string | null; stripe_subscription_id: string | null }>();
  if (error) throw error;

  return { ok: true, user, admin, workspace: { ...ws, ...ids, seatsUsed: Number(seatsUsed ?? 0) } };
}

/** True while a Stripe subscription is live (paid, or retrying a failed payment). */
export function hasLiveSubscription(ws: Pick<BillingWorkspace, "stripe_subscription_id" | "subscription_status">) {
  return Boolean(ws.stripe_subscription_id) && !["canceled", "incomplete_expired"].includes(ws.subscription_status ?? "");
}

/** One Stripe customer per workspace, reused for every checkout and the portal. */
export async function findOrCreateCustomer(
  stripe: Stripe,
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  workspace: BillingWorkspace,
  email: string | null,
): Promise<string> {
  if (workspace.stripe_customer_id) {
    // Make sure it still exists in this Stripe account (e.g. after switching from test to live keys).
    try {
      const existing = await stripe.customers.retrieve(workspace.stripe_customer_id);
      if (!existing.deleted) return existing.id;
    } catch (err) {
      if (!(err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing")) throw err;
    }
  }

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    name: workspace.name,
    metadata: { workspace_id: workspace.id },
  });

  const { error } = await admin.from("workspaces").update({ stripe_customer_id: customer.id }).eq("id", workspace.id);
  if (error) throw error;
  return customer.id;
}

/** Cancels a workspace's subscription now (for deletion). "Already gone" counts as done. */
export async function cancelSubscriptionNow(stripe: Stripe, subscriptionId: string) {
  try {
    await stripe.subscriptions.cancel(subscriptionId);
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? err.code : null;
    if (code !== "resource_missing") throw err;
  }
}
