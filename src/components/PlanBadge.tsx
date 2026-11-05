import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { PLAN_LABELS, hasPaidAccess } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

// The signed-in user's plan, shown in the app header. Links to the Billing page.
export default async function PlanBadge() {
  const user = await getCurrentUser();
  const supabase = user ? await createClient() : null;
  if (!user || !supabase) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, subscription_status")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "plan" | "subscription_status">>();
  if (!profile) return null;

  const paid = hasPaidAccess(profile);
  // A paid plan whose payment failed (past_due, unpaid...) is flagged so it gets noticed.
  const needsAttention = profile.plan !== "free" && !paid;
  const label = needsAttention ? `${PLAN_LABELS[profile.plan]} · payment issue` : PLAN_LABELS[profile.plan];

  return (
    <Link
      href="/dashboard/billing"
      title="Your plan: open Billing"
      className={`rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition ${
        needsAttention
          ? "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
          : paid
            ? "border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
            : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"
      }`}
    >
      {label}
    </Link>
  );
}
