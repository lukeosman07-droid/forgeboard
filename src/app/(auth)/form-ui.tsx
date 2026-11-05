"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { safeNext } from "@/lib/safe-next";

// Small shared pieces for the login and signup forms.

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  defaultValue,
  required = true,
  minLength,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  required?: boolean;
  minLength?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        minLength={minLength}
        className="mt-1.5 block w-full rounded-lg border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function SubmitButton({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-orange-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-orange-400 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function FormAlert({ error, message }: { error?: string; message?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
        {error}
      </p>
    );
  }
  if (message) {
    return (
      <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-300">
        {message}
      </p>
    );
  }
  return null;
}

// --- Continuing somewhere after login/sign-up (?next=...) ---

/** The ?next= path from the URL, if it's a safe same-site path. */
export function useNextPath() {
  return safeNext(useSearchParams().get("next"));
}

/** Hidden field that sends ?next= along with the form. */
export function NextField() {
  const next = useNextPath();
  return next ? <input type="hidden" name="next" value={next} /> : null;
}

/** After a successful login/sign-up with ?next=, do a full page load there (it may be an API route). */
export function useFollowRedirect(redirectTo: string | undefined) {
  useEffect(() => {
    if (redirectTo) window.location.assign(redirectTo);
  }, [redirectTo]);
}

/** "Log in" / "Create an account" link that keeps ?next= so checkout isn't lost. */
export function AuthSwitchLink({ href, children }: { href: string; children: React.ReactNode }) {
  const next = useNextPath();
  return (
    <Link
      href={next ? `${href}?next=${encodeURIComponent(next)}` : href}
      className="font-medium text-orange-400 hover:text-orange-300"
    >
      {children}
    </Link>
  );
}

/** Small note above the form when the visitor is on their way to buy a plan. */
export function CheckoutHint() {
  const next = useNextPath();
  const plan = next?.match(/^\/api\/checkout\?plan=(team|business)$/)?.[1];
  if (!plan) return null;
  return (
    <p className="mt-4 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-200">
      Next step: secure checkout for the {plan === "team" ? "Team" : "Business"} plan.
    </p>
  );
}
