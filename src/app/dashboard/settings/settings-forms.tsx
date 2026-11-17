"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { MIN_PASSWORD_LENGTH } from "@/lib/account";
import { changeEmail, changePassword, deleteAccount, updateProfile, type SettingsState } from "./actions";

const inputClass =
  "mt-1.5 block w-full rounded-lg border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30 disabled:opacity-60";

function Input({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input {...props} className={inputClass} />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function Save({
  children,
  pendingText,
  danger = false,
  disabled = false,
}: {
  children: React.ReactNode;
  pendingText: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
        danger ? "bg-red-500 text-white hover:bg-red-400" : "bg-orange-500 text-slate-950 hover:bg-orange-400"
      }`}
    >
      {pending ? pendingText : children}
    </button>
  );
}

function Result({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-300">
        {state.message}
      </p>
    );
  }
  return null;
}

export function ProfileForm({ fullName, companyName }: { fullName: string; companyName: string }) {
  const [state, action] = useActionState<SettingsState, FormData>(updateProfile, {});
  return (
    <form action={action} className="space-y-4">
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Full name" name="fullName" autoComplete="name" defaultValue={fullName} required maxLength={120} />
        <Input label="Company" name="companyName" autoComplete="organization" defaultValue={companyName} maxLength={120} />
      </div>
      <Save pendingText="Saving…">Save profile</Save>
    </form>
  );
}

export function EmailForm({ email, locked }: { email: string; locked: boolean }) {
  const [state, action] = useActionState<SettingsState, FormData>(changeEmail, {});
  return (
    <form action={action} className="space-y-4">
      <Result state={state} />
      <p className="text-sm text-slate-400">
        Current email: <span className="font-medium text-slate-200">{email}</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="New email" name="email" type="email" autoComplete="email" required disabled={locked} />
        <Input label="Current password" name="password" type="password" autoComplete="current-password" required disabled={locked} />
      </div>
      <Save pendingText="Sending…" disabled={locked}>
        Change email
      </Save>
    </form>
  );
}

export function PasswordForm({ locked }: { locked: boolean }) {
  const [state, action] = useActionState<SettingsState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-4">
      <Result state={state} />
      <Input label="Current password" name="current" type="password" autoComplete="current-password" required disabled={locked} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
          disabled={locked}
        />
        <Input
          label="Repeat new password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          disabled={locked}
        />
      </div>
      <Save pendingText="Changing…" disabled={locked}>
        Change password
      </Save>
    </form>
  );
}

export function DeleteAccountForm({ locked, hasSubscription }: { locked: boolean; hasSubscription: boolean }) {
  const [state, action] = useActionState<SettingsState, FormData>(deleteAccount, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={locked}
        className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Delete my account…
      </button>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Result state={state} />
      <p className="text-sm text-slate-300">
        This permanently deletes your account and every project, task, note and comment in it
        {hasSubscription ? ", and cancels your subscription right away" : ""}. It can&apos;t be undone.
      </p>
      <Input label="Enter your password to confirm" name="password" type="password" autoComplete="current-password" required />
      <div className="flex flex-wrap gap-3">
        <Save pendingText="Deleting…" danger>
          Permanently delete my account
        </Save>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
          Cancel
        </button>
      </div>
    </form>
  );
}
