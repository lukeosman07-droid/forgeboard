"use client";

import { useActionState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/account";
import { resetPassword, type AuthFormState } from "../actions";
import { Field, FormAlert, SubmitButton } from "../form-ui";

export default function ResetPasswordForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(resetPassword, {});

  return (
    <form action={action} className="space-y-5">
      <FormAlert error={state.error} />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
      />
      <Field label="Repeat new password" name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
      <SubmitButton pendingText="Saving…">Save new password</SubmitButton>
    </form>
  );
}
