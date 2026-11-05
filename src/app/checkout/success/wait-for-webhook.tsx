"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const CHECK_EVERY_MS = 2000;
const GIVE_UP_AFTER = 15; // checks (about 30 seconds)

// Stripe tells our server about the payment a moment after checkout (the webhook).
// Until then, re-check every 2 seconds.
export default function WaitForWebhook() {
  const router = useRouter();
  const [checks, setChecks] = useState(0);
  const gaveUp = checks >= GIVE_UP_AFTER;

  useEffect(() => {
    if (gaveUp) return;
    const timer = setTimeout(() => {
      router.refresh();
      setChecks((n) => n + 1);
    }, CHECK_EVERY_MS);
    return () => clearTimeout(timer);
  }, [checks, gaveUp, router]);

  if (!gaveUp) {
    return (
      <p className="mt-3 text-slate-400">
        This usually takes a few seconds. This page updates on its own.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3 text-slate-300">
      <p>
        Your payment went through, but your plan hasn&apos;t switched over yet. It will update automatically
        as soon as Stripe confirms it. You won&apos;t be charged twice.
      </p>
      <p className="text-sm text-slate-500">
        Running locally? Make sure <code className="text-slate-300">stripe listen</code> is running so webhooks
        reach your computer.
      </p>
      <button
        type="button"
        onClick={() => setChecks(0)}
        className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5"
      >
        Check again
      </button>{" "}
      <Link href="/dashboard" className="text-sm text-orange-400 hover:text-orange-300">
        Go to dashboard →
      </Link>
    </div>
  );
}
