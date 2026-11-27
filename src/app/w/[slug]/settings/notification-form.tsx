"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import type { NotificationPrefs } from "@/lib/types";
import { saveNotificationPrefs } from "@/server/notifications";

// Which notifications someone gets, in the app and by email, for this
// workspace, plus the daily due-date digest and their time zone.

const ROWS: { key: "assigned" | "mentioned" | "commented" | "status"; label: string; hint: string }[] = [
  { key: "assigned", label: "Assigned to me", hint: "Someone makes you the owner of a task." },
  { key: "mentioned", label: "Mentioned", hint: "Someone @mentions you in an update." },
  { key: "commented", label: "Comments on my tasks", hint: "Updates on tasks you own." },
  { key: "status", label: "Status changes", hint: "Someone else moves a task you own." },
];

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: new Date(Date.UTC(2026, 0, 1, h)).toLocaleTimeString("en-US", { hour: "numeric", timeZone: "UTC" }),
}));

export default function NotificationForm({
  slug,
  initial,
  timeZone,
  emailOn,
}: {
  slug: string;
  initial: NotificationPrefs;
  timeZone: string | null;
  /** False until the site has an email provider set up. */
  emailOn: boolean;
}) {
  const [prefs, setPrefs] = useState(initial);
  const browserZone = useSyncExternalStore(
    () => () => {},
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
  const [zone, setZone] = useState<string | null>(timeZone);
  const shownZone = zone ?? browserZone ?? "UTC";
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok?: boolean; error?: string }>({});

  const set = <K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    setResult({});
  };

  const save = () =>
    startTransition(async () => {
      setResult(await saveNotificationPrefs(slug, prefs, zone ?? browserZone));
    });

  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [shownZone];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-5"
    >
      {result.error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {result.error}
        </p>
      )}
      {result.ok && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Notification settings saved.
        </p>
      )}
      {!emailOn && (
        <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-400">
          Email isn&apos;t set up on this site yet, so for now notifications show only in the app.
        </p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
            <th className="pb-2 font-semibold">Notify me when</th>
            <th className="w-20 pb-2 text-center font-semibold">In app</th>
            <th className="w-20 pb-2 text-center font-semibold">Email</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {ROWS.map((row) => (
            <tr key={row.key}>
              <td className="py-2.5 pr-3">
                <span className="block font-medium text-slate-200">{row.label}</span>
                <span className="block text-xs text-slate-500">{row.hint}</span>
              </td>
              <td className="text-center">
                <input
                  type="checkbox"
                  aria-label={`${row.label}: in app`}
                  checked={prefs[`in_app_${row.key}`]}
                  onChange={(e) => set(`in_app_${row.key}`, e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-orange-500"
                />
              </td>
              <td className="text-center">
                <input
                  type="checkbox"
                  aria-label={`${row.label}: email`}
                  checked={prefs[`email_${row.key}`]}
                  onChange={(e) => set(`email_${row.key}`, e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-orange-500"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-3 rounded-xl border border-white/10 p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={prefs.email_digest}
            onChange={(e) => set("email_digest", e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-orange-500"
          />
          <span>
            <span className="block text-sm font-medium text-slate-200">Daily due-date digest</span>
            <span className="block text-xs text-slate-500">One email on days you have tasks overdue or due today or tomorrow.</span>
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-slate-400">Send it after</span>
            <select
              value={prefs.digest_hour}
              disabled={!prefs.email_digest}
              onChange={(e) => set("digest_hour", Number(e.target.value))}
              className="mt-1 block w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-white [color-scheme:dark] disabled:opacity-50"
            >
              {HOURS.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-400">Your time zone</span>
            <select
              value={shownZone}
              onChange={(e) => {
                setZone(e.target.value);
                setResult({});
              }}
              className="mt-1 block w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-white [color-scheme:dark]"
            >
              {(zones.includes(shownZone) ? zones : [shownZone, ...zones]).map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save notification settings"}
      </button>
    </form>
  );
}
