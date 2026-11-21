"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Icon, Popover } from "@/components/work/ui";
import { ROLE_LABELS } from "@/lib/people";
import type { WorkspaceSummary } from "@/lib/workspaces";
import { createWorkspace } from "@/server/members";
import { useWorkspace, workspacePath } from "./workspace-context";

const PLAN_LABELS: Record<WorkspaceSummary["plan"], string> = {
  trial: "Trial",
  starter: "Starter",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
};

// Top of the sidebar: the current workspace, the user's other workspaces, and
// "Create workspace".
export default function WorkspaceSwitcher({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  const current = useWorkspace();
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <Popover
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`Workspace: ${current.name}. Switch workspace`}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
          >
            <WorkspaceMark name={current.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">{current.name}</span>
              <span className="block truncate text-xs text-slate-500">
                {PLAN_LABELS[current.plan]} · {ROLE_LABELS[current.role]}
              </span>
            </span>
            <Icon name="chevron" className="h-4 w-4 shrink-0 rotate-90 text-slate-500" />
          </button>
        )}
      >
        {(close) => (
          <div className="w-64 p-1" role="menu">
            <p className="px-2 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Your workspaces</p>
            {workspaces.map((w) => (
              <Link
                key={w.id}
                href={workspacePath(w.slug)}
                role="menuitem"
                onClick={close}
                aria-current={w.id === current.id ? "true" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${
                  w.id === current.id ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <WorkspaceMark name={w.name} small />
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                <span className="text-xs text-slate-500">{ROLE_LABELS[w.role]}</span>
              </Link>
            ))}
            <div className="my-1 border-t border-white/10" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                dialogRef.current?.showModal();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
            >
              <span className="grid h-6 w-6 place-items-center rounded-md border border-dashed border-white/20">
                <Icon name="plus" className="h-3.5 w-3.5" />
              </span>
              Create workspace
            </button>
          </div>
        )}
      </Popover>

      <dialog
        ref={dialogRef}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-white/10 bg-slate-900 p-0 text-slate-200 shadow-2xl backdrop:bg-slate-950/70 backdrop:backdrop-blur-sm"
        onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
      >
        <CreateWorkspaceForm onCancel={() => dialogRef.current?.close()} />
      </dialog>
    </>
  );
}

function WorkspaceMark({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-md bg-orange-500 font-bold text-slate-950 ${small ? "h-6 w-6 text-xs" : "h-8 w-8 text-sm"}`}
    >
      {name.trim().slice(0, 1).toUpperCase() || "W"}
    </span>
  );
}

export function CreateWorkspaceForm({ onCancel }: { onCancel?: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        startTransition(async () => {
          // On success the action redirects into the new workspace.
          const result = await createWorkspace(name);
          if (result?.error) setError(result.error);
        });
      }}
      className="space-y-4 p-6"
    >
      <div>
        <h2 className="text-xl font-semibold text-white">Create a workspace</h2>
        <p className="mt-1 text-sm text-slate-400">A workspace is one firm or team. It has its own projects, members and plan.</p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      <label className="block">
        <span className="text-sm font-medium text-slate-200">Workspace name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          placeholder="e.g. Acme Engineering"
          className="mt-1.5 block w-full rounded-lg border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        />
      </label>
      <div className="flex justify-end gap-3">
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create workspace"}
        </button>
      </div>
    </form>
  );
}
