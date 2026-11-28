"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWorkspace, useWorkspacePath } from "@/components/app/workspace-context";
import { Icon } from "@/components/work/ui";

// Small pieces shared by the RFI, submittal and review views.

export const input =
  "w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none [color-scheme:dark] disabled:opacity-60";
export const label = "mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500";
export const primary = "rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-50";
export const secondary = "rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50";

/** A right-side panel like the task panel. Escape or the backdrop closes it. */
export function SidePanel({ title, onClose, actions, children }: { title: React.ReactNode; onClose: () => void; actions?: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]" />
      <aside className="relative flex h-full w-full max-w-2xl flex-col border-l border-white/10 bg-slate-900 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div className="min-w-0 truncate text-sm font-medium text-slate-300">{title}</div>
          <div className="flex items-center gap-1">
            {actions}
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}

export function UpgradeCard({ what }: { what: string }) {
  const path = useWorkspacePath();
  const { isAdmin } = useWorkspace();
  return (
    <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 px-6 py-8 text-center">
      <p className="font-semibold text-white">{what} are on the Team and Business plans.</p>
      <p className="mt-1 text-sm text-slate-400">Numbered logs with ball-in-court, due dates, files, linked tasks, and CSV or PDF export.</p>
      {isAdmin ? (
        <Link href={path("/billing")} className={`${primary} mt-4 inline-block`}>
          See plans
        </Link>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Ask a workspace admin to upgrade.</p>
      )}
    </div>
  );
}

/** CSV and PDF downloads of a register log. */
export function ExportLinks({ projectId, kind, today }: { projectId: string; kind: "rfis" | "submittals"; today: string | null }) {
  const path = useWorkspacePath();
  const base = path(`/projects/${projectId}/registers/${kind}`);
  const day = today ? `&today=${today}` : "";
  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-slate-500">Export log:</span>
      <a href={`${base}?format=csv${day}`} className="rounded-md px-2 py-1 text-orange-400 hover:bg-white/5 hover:text-orange-300" download>
        CSV
      </a>
      <a href={`${base}?format=pdf${day}`} className="rounded-md px-2 py-1 text-orange-400 hover:bg-white/5 hover:text-orange-300" download>
        PDF
      </a>
    </div>
  );
}

/** A text field that saves when it loses focus (and only if it changed). */
export function BlurField({
  value,
  onSave,
  multiline = false,
  placeholder,
  ariaLabel,
  maxLength,
  disabled,
  rows = 5,
}: {
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  ariaLabel: string;
  maxLength?: number;
  disabled?: boolean;
  rows?: number;
}) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(value);
  }
  const commit = () => {
    if (text.trim() !== value.trim()) onSave(text.trim());
  };
  return multiline ? (
    <textarea
      aria-label={ariaLabel}
      value={text}
      rows={rows}
      maxLength={maxLength}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      className={`${input} resize-y`}
    />
  ) : (
    <input
      aria-label={ariaLabel}
      value={text}
      maxLength={maxLength}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={input}
    />
  );
}

export function ErrorNote({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {error}
    </p>
  );
}
