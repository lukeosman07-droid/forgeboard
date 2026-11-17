"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportError } from "@/lib/monitoring/report";

// What people see when a page crashes. Used by every error.tsx file.
export default function ErrorScreen({
  error,
  retry,
  homeHref = "/",
  homeLabel = "Back to home",
}: {
  error: unknown;
  retry: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  // Server errors arrive with a short reference code instead of their message.
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center" role="alert">
      <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">Something went wrong</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">This page hit an error</h1>
      <p className="mt-3 max-w-md text-slate-400">
        Your work is saved. Try again, and if it keeps happening, let us know what you were doing.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-lg bg-orange-500 px-5 py-2.5 font-semibold text-slate-950 hover:bg-orange-400"
        >
          Try again
        </button>
        <Link href={homeHref} className="rounded-lg border border-white/15 px-5 py-2.5 font-semibold text-white hover:bg-white/5">
          {homeLabel}
        </Link>
      </div>
      {digest && <p className="mt-6 font-mono text-xs text-slate-600">Reference: {digest}</p>}
    </div>
  );
}
