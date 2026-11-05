"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login, type AuthFormState } from "../actions";
import { Field, FormAlert, NextField, SubmitButton, useFollowRedirect } from "../form-ui";

export default function LoginForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(login, {});
  const linkFailed = useSearchParams().get("error") === "link";
  useFollowRedirect(state.redirectTo);

  return (
    <form action={action} className="space-y-5">
      <FormAlert
        error={state.error ?? (linkFailed ? "That sign-in link is invalid or has expired. Please log in." : undefined)}
      />
      <NextField />
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" />
      <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
    </form>
  );
}
