import Link from "next/link";
import { PLAN_LABELS, daysUntil, type PlanState } from "@/lib/plans";

// The workspace's plan, shown in the app header. Links to the Billing page.
export default function PlanBadge({ slug, plan }: { slug: string; plan: PlanState }) {
  // Read-only or a failed payment is flagged so it gets noticed.
  const needsAttention = Boolean(plan.readOnly || plan.graceEndsAt);
  const label = plan.readOnly
    ? `${PLAN_LABELS[plan.plan]} · read-only`
    : plan.graceEndsAt
      ? `${PLAN_LABELS[plan.plan]} · payment issue`
      : plan.plan === "trial"
        ? `Trial · ${daysUntil(plan.trialEndsAt)} days left`
        : PLAN_LABELS[plan.plan];

  return (
    <Link
      href={`/w/${slug}/billing`}
      title="Your plan: open Billing"
      className={`rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition ${
        needsAttention
          ? "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
          : plan.plan !== "trial"
            ? "border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
            : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"
      }`}
    >
      {label}
    </Link>
  );
}
