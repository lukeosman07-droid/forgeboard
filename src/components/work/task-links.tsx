"use client";

import { useState, useTransition } from "react";
import { useWorkspace } from "@/components/app/workspace-context";
import { isConflict, wouldCycle } from "@/lib/dependencies";
import { DISPOSITIONS, rfiNumber, submittalNumber, type Disposition } from "@/lib/registers";
import type { Task } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import { addDependency, removeDependency, setDisposition } from "@/server/engineering";
import { linkTask } from "@/server/registers";
import { useProjectExtras } from "./project-extras";
import { useTaskStore } from "./task-store";

// The Phase 5 part of the task panel: which tasks this one waits on (and
// which wait on it), its RFI or submittal, and, for a design review comment,
// its disposition. Shown only on a project page.

const select =
  "max-w-full rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 text-sm text-slate-200 focus:border-orange-500/60 focus:outline-none [color-scheme:dark]";

export default function TaskLinks({ task }: { task: Task }) {
  const extras = useProjectExtras();
  const { canEdit } = useWorkspace();
  const { tasks, openTask } = useTaskStore();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [adding, setAdding] = useState("");

  if (!extras || extras.projectId !== task.project_id) return null;
  const byId = new Map([...tasks, ...extras.reviewComments].map((t) => [t.id, t]));
  const before = extras.dependencies.filter((d) => d.successor_id === task.id);
  const after = extras.dependencies.filter((d) => d.predecessor_id === task.id);
  const candidates = tasks.filter(
    (t) => t.id !== task.id && !t.id.startsWith("temp-") && !before.some((d) => d.predecessor_id === t.id) && !wouldCycle(t.id, task.id, extras.dependencies),
  );
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(undefined);
      const result = await fn();
      if (result.error) setError(result.error);
    });
  const review = task.review_id ? extras.reviews.find((r) => r.id === task.review_id) : undefined;
  const editable = canEdit && extras.registers;

  return (
    <section aria-label="Links" className="space-y-4">
      {review && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Design review</h3>
          <p className="mt-1 text-sm text-slate-300">Comment from {review.name}</p>
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-400">
            Disposition
            <select
              className={select}
              disabled={!canEdit || pending || review.status === "closed"}
              value={task.disposition ?? "pending"}
              onChange={(e) => run(() => setDisposition(task.id, e.target.value as Disposition))}
            >
              {DISPOSITIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Waits on</h3>
        {!extras.registers && <p className="mt-1 text-sm text-slate-500">Task dependencies are on the Team and Business plans.</p>}
        <ul className="mt-1 space-y-1">
          {before.map((d) => {
            const other = byId.get(d.predecessor_id);
            if (!other) return null;
            const clash = isConflict(other, task);
            return (
              <li key={d.id} className="flex items-center gap-2 text-sm">
                <button type="button" onClick={() => openTask(other.id)} className="min-w-0 truncate text-left text-slate-200 hover:text-orange-300">
                  {other.title}
                </button>
                {other.due_date && <span className="shrink-0 text-xs text-slate-500">due {formatDate(other.due_date)}</span>}
                {clash && (
                  <span role="status" className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-300">
                    ⚠ Starts before this is due
                  </span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Stop waiting on ${other.title}`}
                    onClick={() => run(() => removeDependency(d.id))}
                    className="ml-auto shrink-0 text-xs text-slate-500 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {editable && candidates.length > 0 && (
          <div className="mt-2 flex gap-2">
            <select aria-label="Add a task this waits on" className={`${select} min-w-0 flex-1`} value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Add a task this waits on…</option>
              {candidates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!adding || pending}
              onClick={() => {
                const id = adding;
                setAdding("");
                run(() => addDependency(id, task.id));
              }}
              className="rounded-md bg-white/10 px-3 text-sm text-white hover:bg-white/15 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        )}
        {after.length > 0 && (
          <p className="mt-2 text-sm text-slate-400">
            Needed by:{" "}
            {after.map((d, i) => {
              const other = byId.get(d.successor_id);
              if (!other) return null;
              return (
                <span key={d.id}>
                  {i > 0 && ", "}
                  <button type="button" onClick={() => openTask(other.id)} className={`hover:text-orange-300 ${isConflict(task, other) ? "text-amber-300" : "text-slate-200"}`}>
                    {other.title}
                    {isConflict(task, other) && " ⚠"}
                  </button>
                </span>
              );
            })}
          </p>
        )}
      </div>

      {(extras.rfis.length > 0 || extras.submittals.length > 0 || task.rfi_id || task.submittal_id) && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm text-slate-400">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">RFI</span>
            <select
              className={`${select} w-full`}
              disabled={!editable || pending}
              value={task.rfi_id ?? ""}
              onChange={(e) => run(() => linkTask(task.id, "rfi", e.target.value || null))}
            >
              <option value="">None</option>
              {extras.rfis.map((r) => (
                <option key={r.id} value={r.id}>
                  {rfiNumber(r.number)} · {r.subject}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-400">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Submittal</span>
            <select
              className={`${select} w-full`}
              disabled={!editable || pending}
              value={task.submittal_id ?? ""}
              onChange={(e) => run(() => linkTask(task.id, "submittal", e.target.value || null))}
            >
              <option value="">None</option>
              {extras.submittals.map((s) => (
                <option key={s.id} value={s.id}>
                  {submittalNumber(s.number)} · {s.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
