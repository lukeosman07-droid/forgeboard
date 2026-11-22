import Link from "next/link";
import { planBanner, type PlanState, type ReadOnlyReason } from "@/lib/plans";
import type { Role } from "@/lib/types";

// The strip across the top of every workspace page when billing needs
// attention: trial ending, trial ended, payment failed, or too many people for
// the plan. Only the owner can fix billing, so everyone else is told to ask them.

const READ_ONLY_TEXT: Record<ReadOnlyReason, string> = {
  trial_ended: "Your free trial has ended, so this workspace is read-only.",
  subscription_ended: "The subscription has ended, so this workspace is read-only.",
  payment_failed: "A payment failed and the grace period is over, so this workspace is read-only.",
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });

export default function PlanBanner({ plan, role, slug }: { plan: PlanState; role: Role; slug: string }) {
  const banner = planBanner(plan);
  if (!banner) return null;
  const isOwner = role === "owner";
  const billing = `/w/${slug}/billing`;

  let tone: "red" | "amber" = "amber";
  let text: string;
  let action: string | null = null;

  switch (banner.kind) {
    case "read_only":
      tone = "red";
      text = `${READ_ONLY_TEXT[banner.reason]} Everything is still here to view and export.`;
      action = isOwner ? (banner.reason === "payment_failed" ? "Update payment" : "Choose a plan") : null;
      break;
    case "payment_failed":
      tone = "red";
      text = `A payment failed. Everything keeps working until ${formatDate(banner.graceEndsAt)}, then the workspace becomes read-only.`;
      action = isOwner ? "Update payment" : null;
      break;
    case "over_seats":
      text = `${banner.seatsUsed} people use seats but the plan has ${banner.seats}. Everyone keeps access, but new invites are paused.`;
      action = isOwner ? "Upgrade" : null;
      break;
    case "trial_ending":
      text =
        banner.daysLeft <= 0
          ? "Your free trial ends today."
          : `Your free trial ends in ${banner.daysLeft} ${banner.daysLeft === 1 ? "day" : "days"}. After that the workspace becomes read-only until someone subscribes.`;
      action = isOwner ? "Choose a plan" : null;
      break;
  }

  return (
    <div
      role="status"
      aria-label="Billing notice"
      className={`mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-sm ${
        tone === "red" ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-amber-500/30 bg-amber-500/10 text-amber-100"
      }`}
    >
      <p className="min-w-0 flex-1">
        {text}
        {!isOwner && " Ask the workspace owner to sort out billing."}
      </p>
      {action && (
        <Link
          href={billing}
          className={`rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap ${
            tone === "red" ? "bg-red-400 text-slate-950 hover:bg-red-300" : "bg-orange-500 text-slate-950 hover:bg-orange-400"
          }`}
        >
          {action}
        </Link>
      )}
    </div>
  );
}
