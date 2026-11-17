import type { Metadata } from "next";
import Link from "next/link";
import ResetPasswordForm from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password – Forgeboard" };

// Reached from the link in the password reset email, which signs the user in first.
export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-white">Choose a new password</h1>
      <p className="mt-1 text-slate-400">You&apos;ll be signed out on your other devices.</p>
      <div className="mt-8">
        <ResetPasswordForm />
      </div>
      <p className="mt-6 text-center text-sm text-slate-400">
        Link not working?{" "}
        <Link href="/forgot-password" className="font-medium text-orange-400 hover:text-orange-300">
          Send a new one
        </Link>
      </p>
    </>
  );
}
