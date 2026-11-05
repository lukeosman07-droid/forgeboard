import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Log in – Forgeboard" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-white">Welcome back</h1>
      <p className="mt-1 text-slate-400">Log in to your Forgeboard workspace.</p>
      <div className="mt-8">
        {/* Suspense because the form reads the URL (?error=...) */}
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-sm text-slate-400">
        New to Forgeboard?{" "}
        <Link href="/signup" className="font-medium text-orange-400 hover:text-orange-300">
          Create an account
        </Link>
      </p>
    </>
  );
}
