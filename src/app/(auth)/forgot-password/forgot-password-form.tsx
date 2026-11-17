"use client";

import { useActionState } from "react";
import { requestPasswordReset, type AuthFormState } from "../actions";
import { Field, FormAlert, SubmitButton } from "../form-ui";

export default function ForgotPasswordForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(requestPasswordReset, {});

  return (
    <form action={action} className="space-y-5">
      <FormAlert error={state.error} message={state.message} />
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} />
      <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
