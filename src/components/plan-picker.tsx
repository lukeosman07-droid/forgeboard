"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import {
  PAID_PLANS,
  PLAN_LABELS,
  PLAN_LIMITS,
  PRICES,
  formatBytes,
  formatPrice,
  monthlyEquivalent,
  type BillingInterval,
  type PaidPlan,
} from "@/lib/plans";
import { checkoutPath } from "@/lib/safe-next";

// The plan cards with a monthly/annual switch. Used on the public pricing page
// (buttons start checkout, via sign-up when logged out) and on a workspace's
// Billing page (buttons start checkout or switch the current subscription).
// Plain <a> and <form> elements: checkout must never be prefetched.

const BLURBS: Record<PaidPlan, string> = {
  starter: "For a small firm getting organized.",
  team: "For a growing firm running many projects.",
  business: "For larger firms that plan across teams.",
};

const HIGHLIGHTS: Record<PaidPlan, string[]> = {
  starter: ["Tasks, decisions and risks", "Table, board, calendar and timeline", "Meeting notes to tasks", "Email support"],
  team: ["Everything in Starter", "RFI and submittal registers", "Task dependencies", "Read minutes from files and email"],
  business: ["Everything in Team", "Workload across projects", "Custom templates", "Scheduled reports, priority support"],
};

export type BillingContext = {
  slug: string;
  /** The workspace already pays: buttons switch plans instead of starting checkout. */
  hasSubscription: boolean;
  currentPlan: string;
  currentInterval: BillingInterval | null;
  seatsUsed: number;
};

export default function PlanPicker({ billing, initialInterval = "month" }: { billing?: BillingContext; initialInterval?: BillingInterval }) {
  const [interval, setInterval] = useState<BillingInterval>(billing?.currentInterval ?? initialInterval);

  return (
    <div>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-white/15 bg-slate-900/60 p-1 text-sm">
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={interval === value}
              onClick={() => setInterval(value)}
              className={`rounded-full px-4 py-1.5 font-medium transition ${
                interval === value ? "bg-orange-500 text-slate-950" : "text-slate-300 hover:text-white"
              }`}
            >
              {value === "month" ? "Monthly" : "Annual · 2 months free"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {PAID_PLANS.map((plan) => (
          <PlanCard key={plan} plan={plan} interval={interval} billing={billing} featured={plan === "team"} />
        ))}
      </div>
    </div>
  );
}

function PlanCard({ plan, interval, billing, featured }: { plan: PaidPlan; interval: BillingInterval; billing?: BillingContext; featured: boolean }) {
  const limits = PLAN_LIMITS[plan];
  const isCurrent = billing?.hasSubscription && billing.currentPlan === plan && billing.currentInterval === interval;
  const tooSmall = billing ? billing.seatsUsed > limits.seats : false;
  const buttonClass = `mt-8 block w-full rounded-lg px-4 py-3 text-center font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
    featured ? "bg-orange-500 text-slate-950 hover:bg-orange-400" : "border border-white/15 text-white hover:bg-white/5"
  }`;

  let action: React.ReactNode;
  if (isCurrent) {
    action = (
      <button type="button" disabled className={buttonClass}>
        Current plan
      </button>
    );
  } else if (tooSmall) {
    action = (
      <>
        <button type="button" disabled className={buttonClass}>
          {PLAN_LABELS[plan]} has {limits.seats} seats
        </button>
        <p className="mt-2 text-center text-xs text-slate-400">
          {billing!.seatsUsed} people use seats now. Remove some to switch to this plan.
        </p>
      </>
    );
  } else if (billing?.hasSubscription) {
    action = (
      <form action="/api/billing/change" method="post">
        <input type="hidden" name="workspace" value={billing.slug} />
        <input type="hidden" name="plan" value={plan} />
        <input type="hidden" name="interval" value={interval} />
        <button type="submit" className={buttonClass}>
          Switch to {PLAN_LABELS[plan]}
          {billing.currentPlan === plan ? (interval === "year" ? " annual" : " monthly") : ""}
        </button>
      </form>
    );
  } else if (billing) {
    action = (
      <a href={checkoutPath(plan, interval, billing.slug)} className={buttonClass}>
        Choose {PLAN_LABELS[plan]}
      </a>
    );
  } else {
    // Public page: the trial needs no card. Buying straight away goes through
    // sign-up first when logged out, then to Stripe.
    action = (
      <>
        <a href="/signup" className={buttonClass}>
          Start free trial
        </a>
        <a href={checkoutPath(plan, interval)} className="mt-3 block text-center text-sm text-slate-400 underline hover:text-white">
          or subscribe now
        </a>
      </>
    );
  }

  return (
    <div
      className={`relative flex flex-col rounded-xl border p-8 ${
        featured ? "border-orange-500/50 bg-slate-900" : "border-white/10 bg-slate-900/60"
      }`}
    >
      {featured && (
        <span className="absolute -top-3 left-8 rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-slate-950">Recommended</span>
      )}
      <h3 className="text-xl font-semibold text-white">{PLAN_LABELS[plan]}</h3>
      <p className="mt-1 text-slate-400">{BLURBS[plan]}</p>
      <p className="mt-6 flex items-baseline gap-2">
        <span className="text-5xl font-bold tracking-tight text-white">
          {formatPrice(interval === "month" ? PRICES[plan].month : monthlyEquivalent(plan))}
        </span>
        <span className="text-slate-400">/ month</span>
      </p>
      <p className="mt-1 text-sm text-slate-500">
        {interval === "month" ? "Per firm, billed monthly" : `${formatPrice(PRICES[plan].year)} billed yearly, per firm`}
      </p>
      <ul className="mt-8 flex-1 space-y-3">
        {[`Up to ${limits.seats} people (guests free)`, `${formatBytes(limits.storageBytes)} of files`, ...HIGHLIGHTS[plan], `${limits.aiRuns.toLocaleString()} AI runs a month`].map(
          (f) => (
            <li key={f} className="flex items-center gap-3 text-slate-300">
              <Icon name="check" className="h-5 w-5 shrink-0 text-orange-400" />
              {f}
            </li>
          ),
        )}
      </ul>
      {action}
    </div>
  );
}
