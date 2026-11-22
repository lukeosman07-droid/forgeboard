import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import PlanPicker from "@/components/plan-picker";
import { displayName } from "@/lib/people";
import {
  GRACE_DAYS,
  PLAN_LABELS,
  PLAN_LIMITS,
  daysUntil,
  formatBytes,
  isPaidPlan,
  type PlanState,
} from "@/lib/plans";
import { getStripe } from "@/lib/stripe";
import type { Workspace } from "@/lib/types";
import { getWorkspace } from "@/lib/workspaces";
import { hasLiveSubscription, loadOwnedWorkspace } from "@/server/billing";

export const metadata: Metadata = { title: "Billing – Forgeboard" };

const NOTICES: Record<string, { tone: "info" | "error" | "success"; text: string }> = {
  "already-subscribed": { tone: "info", text: "This workspace already has a subscription. Switch plans below instead." },
  "plan-changed": { tone: "success", text: "Plan changed. Stripe prorates the difference on your next invoice." },
  "checkout-canceled": { tone: "info", text: "Checkout canceled. You weren't charged." },
  "checkout-error": { tone: "error", text: "We couldn't start checkout. Please try again in a moment." },
  "change-error": { tone: "error", text: "We couldn't change the plan. Nothing was charged. Please try again." },
  "no-subscription": { tone: "info", text: "There's no subscription to change yet. Choose a plan below." },
  "owner-only": { tone: "info", text: "Only the workspace owner can change billing." },
  "portal-error": {
    tone: "error",
    text: "We couldn't open the billing portal. If you run this site: turn on the Customer Portal in your Stripe dashboard (Settings → Billing → Customer portal).",
  },
  "portal-unavailable": { tone: "error", text: "Billing isn't set up on this site yet." },
  "no-customer": { tone: "info", text: "There's no billing account yet. Choose a plan to get started." },
};

export default function BillingPage({ params, searchParams }: PageProps<"/w/[slug]/billing">) {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Billing</h1>
        <p className="mt-1 text-slate-400">The workspace&apos;s plan, usage and invoices.</p>
      </div>
      <Suspense fallback={<div className="h-56 animate-pulse rounded-2xl border border-white/10 bg-slate-900/60" />}>
        <BillingContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BillingContent({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const access = await getWorkspace(slug);
  if (!access) notFound();
  const { workspace, plan, role } = access;
  const isOwner = role === "owner";

  // Stripe IDs and invoices are the owner's business only.
  const owned = isOwner ? await loadOwnedWorkspace(slug) : null;
  const billing = owned?.ok ? owned.workspace : null;
  const live = billing ? hasLiveSubscription(billing) : false;
  const invoices = billing?.stripe_customer_id ? await recentInvoices(billing.stripe_customer_id) : [];

  const noticeKey = typeof query.notice === "string" ? query.notice : "";
  const notice = NOTICES[noticeKey];
  const tooManyFor = noticeKey === "too-many-seats" && isPaidPlan(query.plan) ? query.plan : null;

  return (
    <>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {tooManyFor && (
        <Notice tone="error">
          {PLAN_LABELS[tooManyFor]} has {PLAN_LIMITS[tooManyFor].seats} seats, but {plan.seatsUsed} people use seats here. Remove{" "}
          {plan.seatsUsed - PLAN_LIMITS[tooManyFor].seats} of them (or make them guests) on the{" "}
          <Link href={`/w/${slug}/members`} className="font-semibold underline">
            Members page
          </Link>
          , then try again:
          <ul className="mt-2 list-disc pl-5">
            {access.people
              .filter((p) => p.role === "admin" || p.role === "member")
              .map((p) => (
                <li key={p.user_id}>
                  {displayName(p)} ({p.role})
                </li>
              ))}
          </ul>
        </Notice>
      )}

      <CurrentPlan workspace={workspace} plan={plan} live={live} />

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Usage">
        <Meter label="Seats used" used={plan.seatsUsed} limit={plan.seats} format={(n) => String(n)} note="Guests are free" />
        <Meter label="AI runs this month" used={plan.aiRunsUsed} limit={plan.aiRuns} format={(n) => n.toLocaleString()} note="Resets on the 1st" />
        <Meter label="File storage" used={plan.storageBytesUsed} limit={plan.storageBytes} format={formatBytes} />
      </section>

      {isOwner ? (
        <>
          {billing?.stripe_customer_id && (
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Payment method and cancellation</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Update the card or billing address, download invoices, or cancel in Stripe&apos;s secure portal.
                </p>
              </div>
              <form action="/api/billing/portal" method="post">
                <input type="hidden" name="workspace" value={slug} />
                <button type="submit" className="rounded-lg bg-orange-500 px-5 py-2.5 font-semibold text-slate-950 hover:bg-orange-400">
                  Manage billing
                </button>
              </form>
            </section>
          )}

          {workspace.plan !== "enterprise" && (
            <section>
              <h2 className="mb-6 text-xl font-semibold text-white">{live ? "Change plan" : "Choose a plan"}</h2>
              <PlanPicker
                billing={{
                  slug,
                  hasSubscription: live,
                  currentPlan: workspace.plan,
                  currentInterval: workspace.billing_interval,
                  seatsUsed: plan.seatsUsed,
                }}
              />
            </section>
          )}

          {invoices.length > 0 && <Invoices invoices={invoices} />}
        </>
      ) : (
        <p className="rounded-xl border border-white/10 bg-slate-900/60 px-5 py-4 text-sm text-slate-400">
          Only the workspace owner can change the plan or payment details.
        </p>
      )}
    </>
  );
}

function CurrentPlan({ workspace, plan, live }: { workspace: Workspace; plan: PlanState; live: boolean }) {
  const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  let status: { text: string; good: boolean };
  let detail: string | null = null;

  if (plan.readOnly) {
    status = { text: "Read-only", good: false };
    detail =
      plan.readOnly === "payment_failed"
        ? "A payment failed and the grace period is over. Update the payment method to unlock the workspace."
        : "Nothing can be created or edited until someone subscribes. Everything is still visible and exportable.";
  } else if (plan.graceEndsAt) {
    status = { text: "Payment failed", good: false };
    detail = `Everything keeps working until ${date(plan.graceEndsAt)} (${GRACE_DAYS} days from the failed payment). Update the card to avoid read-only mode.`;
  } else if (plan.plan === "trial") {
    const left = daysUntil(plan.trialEndsAt);
    status = { text: "Free trial", good: true };
    detail = `${left} ${left === 1 ? "day" : "days"} left (ends ${date(plan.trialEndsAt)}). Every feature is on during the trial.`;
  } else {
    status = { text: "Active", good: true };
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">Current plan</p>
          <p className="mt-1 text-3xl font-bold text-white">
            {PLAN_LABELS[workspace.plan]}
            {workspace.billing_interval && live && (
              <span className="ml-2 text-base font-normal text-slate-400">{workspace.billing_interval === "year" ? "annual" : "monthly"}</span>
            )}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            status.good ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          {status.text}
        </span>
      </div>
      {detail && <p className="mt-4 text-sm text-slate-300">{detail}</p>}
      {live && workspace.current_period_end && (
        <p className={`mt-4 text-sm ${workspace.cancel_at_period_end ? "text-amber-300" : "text-slate-300"}`}>
          {workspace.cancel_at_period_end
            ? `Canceled: the plan ends on ${date(workspace.current_period_end)}, then the workspace becomes read-only.`
            : `Next invoice on ${date(workspace.current_period_end)}.`}
        </p>
      )}
    </section>
  );
}

function Meter({ label, used, limit, format, note }: { label: string; used: number; limit: number; format: (n: number) => string; note?: string }) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = used > limit;
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">
        {format(used)} <span className="text-sm font-normal text-slate-400">of {format(limit)}</span>
      </p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"
        role="meter"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
      >
        <div className={`h-full rounded-full ${over || percent >= 90 ? "bg-red-400" : "bg-orange-500"}`} style={{ width: `${percent}%` }} />
      </div>
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

function Notice({ tone, children }: { tone: "info" | "error" | "success"; children: React.ReactNode }) {
  const style = {
    info: "border-white/15 bg-white/5 text-slate-200",
    error: "border-red-500/30 bg-red-500/10 text-red-300",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  }[tone];
  return (
    <div role="status" className={`rounded-lg border px-4 py-3 text-sm ${style}`}>
      {children}
    </div>
  );
}

type InvoiceRow = { id: string; date: string; amount: string; status: string; url: string | null };

function Invoices({ invoices }: { invoices: InvoiceRow[] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/60">
      <h2 className="border-b border-white/10 px-6 py-4 text-lg font-semibold text-white">Invoices</h2>
      <ul className="divide-y divide-white/5">
        {invoices.map((invoice) => (
          <li key={invoice.id} className="flex flex-wrap items-center gap-4 px-6 py-3 text-sm">
            <span className="w-36 text-slate-300">{invoice.date}</span>
            <span className="w-24 font-medium text-white">{invoice.amount}</span>
            <span className="flex-1 capitalize text-slate-400">{invoice.status}</span>
            {invoice.url && (
              <a href={invoice.url} target="_blank" rel="noreferrer" className="font-medium text-orange-400 hover:text-orange-300">
                View
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// The last 12 invoices from Stripe. Extra detail only: empty if Stripe is unreachable.
async function recentInvoices(customerId: string): Promise<InvoiceRow[]> {
  const stripe = getStripe();
  if (!stripe) return [];
  try {
    const list = await stripe.invoices.list({ customer: customerId, limit: 12 });
    return list.data.map((invoice) => ({
      id: invoice.id ?? String(invoice.created),
      date: new Date(invoice.created * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      amount: (invoice.total / 100).toLocaleString("en-US", { style: "currency", currency: invoice.currency.toUpperCase() }),
      status: invoice.status ?? "unknown",
      url: invoice.hosted_invoice_url ?? null,
    }));
  } catch {
    return [];
  }
}
