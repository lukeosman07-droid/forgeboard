"use client";

import { useActionState } from "react";
import { signup, type AuthFormState } from "../actions";
import { Field, FormAlert, SubmitButton } from "../form-ui";

export default function SignupForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(signup, {});

  return (
    <form action={action} className="space-y-5">
      <FormAlert error={state.error} message={state.message} />
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
        minLength={8}
        hint="At least 8 characters"
      />
      <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
    </form>
  );
}
