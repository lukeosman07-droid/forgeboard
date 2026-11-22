import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { PLAN_LABELS, PLAN_LIMITS } from "@/lib/plans";
import { getStripe, isPaidPlan } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/types";
import { workspaceUrl } from "@/lib/workspaces";
import WaitForWebhook from "./wait-for-webhook";

export const metadata: Metadata = { title: "Welcome aboard – Forgeboard" };

export default function CheckoutSuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  return (
    <Suspense fallback={<Card title="Confirming your payment…" />}>
      <SuccessContent searchParams={searchParams} />
    </Suspense>
  );
}

// Shows the result of checkout. It never grants the plan itself: the Stripe webhook
// does that. If the webhook hasn't arrived yet, the page waits and refreshes.
async function SuccessContent({ searchParams }: { searchParams: PageProps<"/checkout/success">["searchParams"] }) {
  const { session_id } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const stripe = getStripe();
  const sessionId = typeof session_id === "string" ? session_id : null;
  if (!stripe || !sessionId) redirect(await workspaceUrl("/billing"));

  // Which workspace and plan was bought? Read from Stripe. Row Level Security
  // then only finds the workspace if this user is a member of it.
  const session = await stripe.checkout.sessions.retrieve(sessionId).catch(() => null);
  const workspaceId = session?.client_reference_id;
  if (!session || !workspaceId) redirect(await workspaceUrl("/billing"));
  const plan = isPaidPlan(session.metadata?.plan) ? session.metadata.plan : null;

  const supabase = await createClient();
  const { data: workspace } = await supabase!
    .from("workspaces")
    .select("slug, name, plan, subscription_status")
    .eq("id", workspaceId)
    .maybeSingle<Pick<Workspace, "slug" | "name" | "plan" | "subscription_status">>();
  if (!workspace) redirect(await workspaceUrl("/billing"));

  const label = plan ? PLAN_LABELS[plan] : "new";
  const active =
    ["active", "trialing", "past_due"].includes(workspace.subscription_status ?? "") && (!plan || workspace.plan === plan);

  if (!active) {
    return (
      <Card title={`Payment received. Activating your ${label} plan…`}>
        <WaitForWebhook />
      </Card>
    );
  }

  return (
    <Card title={`${workspace.name} is on the ${PLAN_LABELS[workspace.plan]} plan!`} celebrate>
      <p className="mt-3 text-slate-300">
        Thanks for subscribing. Your whole team now has {PLAN_LIMITS[workspace.plan].seats} seats and{" "}
        {PLAN_LIMITS[workspace.plan].aiRuns.toLocaleString()} AI runs a month. A receipt is on its way to your email.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href={`/w/${workspace.slug}`}
          className="rounded-lg bg-orange-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-orange-400"
        >
          Go to your projects
        </Link>
        <Link
          href={`/w/${workspace.slug}/billing`}
          className="rounded-lg border border-white/15 px-5 py-2.5 font-semibold text-white transition hover:bg-white/5"
        >
          View billing
        </Link>
      </div>
    </Card>
  );
}

function Card({ title, celebrate, children }: { title: string; celebrate?: boolean; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-slate-900/60 p-10 text-center">
      <div className="text-4xl" aria-hidden>
        {celebrate ? "🎉" : "⏳"}
      </div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">{title}</h1>
      {children}
    </div>
  );
}
