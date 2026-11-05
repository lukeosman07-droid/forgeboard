import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthSwitchLink, CheckoutHint } from "../form-ui";
import SignupForm from "./signup-form";

export const metadata: Metadata = { title: "Sign up – Forgeboard" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-white">Create your account</h1>
      <p className="mt-1 text-slate-400">Start with a free trial: 3 AI extractions, no credit card.</p>
      {/* Suspense because these read the URL (?next=...) */}
      <Suspense>
        <CheckoutHint />
      </Suspense>
      <div className="mt-8">
        <Suspense>
          <SignupForm />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-sm text-slate-400">
        Already have an account?{" "}
        <Suspense fallback={<span className="font-medium text-orange-400">Log in</span>}>
          <AuthSwitchLink href="/login">Log in</AuthSwitchLink>
        </Suspense>
      </p>
    </>
  );
}
