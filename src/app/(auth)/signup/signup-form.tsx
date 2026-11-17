"use client";

import { useActionState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/account";
import { signup, type AuthFormState } from "../actions";
import { Field, FormAlert, NextField, SubmitButton, useFollowRedirect } from "../form-ui";

export default function SignupForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(signup, {});
  useFollowRedirect(state.redirectTo);

  return (
    <form action={action} className="space-y-5">
      <FormAlert error={state.error} message={state.message} />
      <NextField />
      <Field label="Full name" name="fullName" autoComplete="name" defaultValue={state.values?.fullName} />
      <Field
        label="Company"
        name="companyName"
        autoComplete="organization"
        defaultValue={state.values?.companyName}
        required={false}
        hint="Optional"
      />
      <Field label="Work email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
      />
      <SubmitButton pendingText={state.redirectTo ? "Continuing…" : "Creating account…"}>Create account</SubmitButton>
    </form>
  );
}
