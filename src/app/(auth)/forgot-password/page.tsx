import type { Metadata } from "next";
import Link from "next/link";
import ForgotPasswordForm from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password – Forgeboard" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-white">Forgot your password?</h1>
      <p className="mt-1 text-slate-400">Enter your email and we&apos;ll send you a link to choose a new one.</p>
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
      <p className="mt-6 text-center text-sm text-slate-400">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-orange-400 hover:text-orange-300">
          Back to log in
        </Link>
      </p>
    </>
  );
}
