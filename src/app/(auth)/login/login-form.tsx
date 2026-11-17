"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login, type AuthFormState } from "../actions";
import { Field, FormAlert, NextField, SubmitButton, useFollowRedirect } from "../form-ui";

export default function LoginForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(login, {});
  const params = useSearchParams();
  const linkFailed = params.get("error") === "link";
  const deleted = params.get("notice") === "account-deleted";
  useFollowRedirect(state.redirectTo);

  return (
    <form action={action} className="space-y-5">
      <FormAlert
        error={
          state.error ??
          (linkFailed ? "That link is invalid, expired, or was opened in a different browser. Log in, or request a new one." : undefined)
        }
        message={deleted ? "Your account and all of its data have been deleted." : undefined}
      />
      <NextField />
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} />
      <div>
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <p className="mt-2 text-right text-sm">
          <Link href="/forgot-password" className="text-slate-400 hover:text-white">
            Forgot password?
          </Link>
        </p>
      </div>
      <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
    </form>
  );
}
