"use client";

import { useSearchParams } from "next/navigation";

const NOTICES: Record<string, { tone: "info" | "error"; text: string }> = {
  canceled: {
    tone: "info",
    text: "Checkout canceled. You weren't charged. Pick a plan whenever you're ready.",
  },
  unavailable: {
    tone: "error",
    text: "Payments aren't set up on this site yet. Please try again later.",
  },
  error: {
    tone: "error",
    text: "We couldn't start checkout. Please try again in a moment.",
  },
};

// Message shown when someone comes back from Stripe Checkout (/pricing?checkout=...).
export default function CheckoutNotice() {
  const notice = NOTICES[useSearchParams().get("checkout") ?? ""];
  if (!notice) return null;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
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
    </div>
  );
}
