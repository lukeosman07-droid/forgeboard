import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthSwitchLink, CheckoutHint } from "../form-ui";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Log in – Forgeboard" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-white">Welcome back</h1>
      <p className="mt-1 text-slate-400">Log in to your Forgeboard workspace.</p>
      {/* Suspense because these read the URL (?error=..., ?next=...) */}
      <Suspense>
        <CheckoutHint />
      </Suspense>
      <div className="mt-8">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-sm text-slate-400">
        New to Forgeboard?{" "}
        <Suspense fallback={<span className="font-medium text-orange-400">Create an account</span>}>
          <AuthSwitchLink href="/signup">Create an account</AuthSwitchLink>
        </Suspense>
      </p>
    </>
  );
}
