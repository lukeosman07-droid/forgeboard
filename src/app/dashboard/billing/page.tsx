import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { FREE_TRIAL_EXTRACTIONS, HOURLY_EXTRACTION_LIMIT, PLAN_LABELS, hasPaidAccess, trialExtractionsLeft } from "@/lib/plans";
import { checkoutPath } from "@/lib/safe-next";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Billing – Forgeboard" };

const NOTICES: Record<string, { tone: "info" | "error"; text: string }> = {
  "already-subscribed": {
    tone: "info",
    text: "You already have an active subscription. To switch plans or cancel, use Manage billing below.",
  },
  "portal-error": {
    tone: "error",
    text: "We couldn't open the billing portal. If you run this site: turn on the Customer Portal in your Stripe dashboard (Settings → Billing → Customer portal).",
  },
  "portal-unavailable": { tone: "error", text: "Billing isn't set up on this site yet." },
  "no-customer": { tone: "info", text: "There's no billing account yet. Pick a plan to get started." },
};

export default function BillingPage({ searchParams }: PageProps<"/dashboard/billing">) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Billing</h1>
        <p className="mt-1 text-slate-400">Your plan, payment method and invoices.</p>
      </div>
      <Suspense fallback={<div className="h-56 animate-pulse rounded-2xl border border-white/10 bg-slate-900/60" />}>
        <BillingContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BillingContent({ searchParams }: { searchParams: PageProps<"/dashboard/billing">["searchParams"] }) {
  const { notice: noticeKey } = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) redirect("/login?next=/dashboard/billing");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  if (!profile) redirect("/dashboard");

  const notice = typeof noticeKey === "string" ? NOTICES[noticeKey] : undefined;
  const paid = hasPaidAccess(profile);
  const renewal = await subscriptionDates(profile.stripe_subscription_id);

  return (
    <>
      {notice && (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.tone === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-300"
              : "border-white/15 bg-white/5 text-slate-200"
          }`}
        >
          {notice.text}
        </p>
      )}

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400">Current plan</p>
            <p className="mt-1 text-3xl font-bold text-white">{PLAN_LABELS[profile.plan]}</p>
          </div>
          <StatusPill profile={profile} />
        </div>

        <dl className="mt-6 grid gap-4 border-t border-white/10 pt-6 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-400">AI extractions</dt>
            <dd className="mt-1 text-white">
              {paid
                ? `Unlimited (up to ${HOURLY_EXTRACTION_LIMIT} per hour)`
                : `${trialExtractionsLeft(profile)} of ${FREE_TRIAL_EXTRACTIONS} trial extractions left`}
            </dd>
          </div>
          {renewal && (
            <div>
              <dt className="text-slate-400">{renewal.cancels ? "Access ends" : "Renews"}</dt>
              <dd className={`mt-1 ${renewal.cancels ? "text-amber-300" : "text-white"}`}>{renewal.date}</dd>
            </div>
          )}
        </dl>

        {profile.plan !== "free" && !paid && (
          <p className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Your last payment didn&apos;t go through, so paid features are paused. Update your card in Manage billing
            to turn them back on.
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {profile.stripe_customer_id ? (
            <form action="/api/billing/portal" method="post">
              <button
                type="submit"
                className="rounded-lg bg-orange-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-orange-400"
              >
                Manage billing
              </button>
            </form>
          ) : null}
          {!paid && (
            <Link
              href="/pricing"
              className={`rounded-lg px-5 py-2.5 font-semibold transition ${
                profile.stripe_customer_id
                  ? "border border-white/15 text-white hover:bg-white/5"
                  : "bg-orange-500 text-slate-950 hover:bg-orange-400"
              }`}
            >
              See plans
            </Link>
          )}
        </div>
        {profile.stripe_customer_id ? (
          <p className="mt-3 text-sm text-slate-500">
            Opens Stripe&apos;s secure portal to update your card, download invoices, or cancel.
          </p>
        ) : paid ? (
          <p className="mt-3 text-sm text-slate-500">
            This plan was set up by hand (for example, the demo account), so there&apos;s no card on file to manage.
          </p>
        ) : null}
      </section>

      {!paid && (
        <section className="grid gap-4 sm:grid-cols-2">
          <UpgradeCard name="Team" price="$299" users="Up to 15 users" href={checkoutPath("team")} />
          <UpgradeCard name="Business" price="$799" users="Up to 50 users" href={checkoutPath("business")} featured />
        </section>
      )}
    </>
  );
}

function StatusPill({ profile }: { profile: Profile }) {
  const status = profile.plan === "free" ? "trial" : (profile.subscription_status ?? "unknown");
  const good = status === "active" || status === "trial";
  const text: Record<string, string> = {
    trial: "Free trial",
    active: "Active",
    past_due: "Payment past due",
    unpaid: "Unpaid",
    incomplete: "Payment incomplete",
    paused: "Paused",
    canceled: "Canceled",
  };
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
        good ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"
      }`}
    >
      {text[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}

function UpgradeCard(props: { name: string; price: string; users: string; href: string; featured?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        props.featured ? "border-orange-500/60 bg-slate-900" : "border-white/10 bg-slate-900/60"
      }`}
    >
      <p className="font-semibold text-white">{props.name}</p>
      <p className="mt-2">
        <span className="text-3xl font-bold text-white">{props.price}</span>
        <span className="text-slate-400"> / month</span>
      </p>
      <p className="mt-1 text-sm text-slate-400">{props.users} · unlimited AI extractions</p>
      {/* Plain <a>: checkout must never be prefetched. */}
      <a
        href={props.href}
        className={`mt-5 block rounded-lg px-4 py-2.5 text-center font-semibold transition ${
          props.featured
            ? "bg-orange-500 text-slate-950 hover:bg-orange-400"
            : "border border-white/15 text-white hover:bg-white/5"
        }`}
      >
        Get {props.name}
      </a>
    </div>
  );
}

// Renewal or end date from Stripe. Shown as extra detail only; null if unavailable.
async function subscriptionDates(subscriptionId: string | null) {
  const stripe = getStripe();
  if (!stripe || !subscriptionId) return null;
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const end = sub.cancel_at ?? sub.items.data[0]?.current_period_end;
    if (!end) return null;
    return {
      cancels: Boolean(sub.cancel_at_period_end || sub.cancel_at),
      date: new Date(end * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    };
  } catch {
    return null;
  }
}
