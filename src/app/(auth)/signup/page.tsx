import type { Metadata } from "next";
import Link from "next/link";
import SignupForm from "./signup-form";

export const metadata: Metadata = { title: "Sign up – Forgeboard" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-white">Create your account</h1>
      <p className="mt-1 text-slate-400">Start with a free trial: 3 AI extractions, no credit card.</p>
      <div className="mt-8">
        <SignupForm />
      </div>
      <p className="mt-6 text-center text-sm text-slate-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-orange-400 hover:text-orange-300">
          Log in
        </Link>
      </p>
    </>
  );
}
