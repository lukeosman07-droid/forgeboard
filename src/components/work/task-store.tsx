"use client";

import { createContext, use, useCallback, useOptimistic, useState, useTransition } from "react";
import { createTask, deleteItem, updateTask, type TaskPatch } from "@/app/dashboard/actions";
import type { Task } from "@/lib/types";
import TaskDrawer from "./task-drawer";

// Holds a page's tasks and applies edits instantly (optimistic UI), then saves.
// The server action refreshes the page, which replaces the optimistic copy with
// the saved data. Also owns the task detail panel.

type Op =
  | { kind: "update"; id: string; patch: Partial<Task> }
  | { kind: "add"; task: Task }
  | { kind: "delete"; id: string };

function reduce(tasks: Task[], op: Op): Task[] {
  switch (op.kind) {
    case "update":
      return tasks.map((t) => (t.id === op.id ? { ...t, ...op.patch } : t));
    case "add":
      return [...tasks, op.task];
    case "delete":
      return tasks.filter((t) => t.id !== op.id);
  }
}

type Store = {
  tasks: Task[];
  update: (id: string, patch: TaskPatch) => void;
  add: (projectId: string, input: TaskPatch & { title: string }) => void;
  remove: (id: string) => void;
  openTask: (id: string) => void;
  error?: string;
  clearError: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function useTaskStore() {
  const store = use(StoreContext);
  if (!store) throw new Error("useTaskStore must be used inside <TaskStore>");
  return store;
}

export default function TaskStore({
  tasks: serverTasks,
  initialOpenId = null,
  children,
}: {
  tasks: Task[];
  initialOpenId?: string | null;
  children: React.ReactNode;
}) {
  const [tasks, apply] = useOptimistic(serverTasks, reduce);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [openId, setOpenId] = useState<string | null>(initialOpenId);

  const update = useCallback(
    (id: string, patch: TaskPatch) =>
      startTransition(async () => {
        const local: Partial<Task> = { ...(patch as Partial<Task>) };
        if (patch.status) local.completed_at = patch.status === "done" ? new Date().toISOString() : null;
        apply({ kind: "update", id, patch: local });
        const result = await updateTask(id, patch);
        if (result.error) setError(result.error);
      }),
    [apply],
  );

  const add = useCallback(
    (projectId: string, input: TaskPatch & { title: string }) =>
      startTransition(async () => {
        const now = new Date().toISOString();
        apply({
          kind: "add",
          task: {
            id: `temp-${now}`,
            project_id: projectId,
            owner_id: "",
            note_id: null,
            section_id: input.section_id ?? null,
            type: "action_item",
            title: input.title,
            details: input.details ?? null,
            assignee: input.assignee ?? null,
            start_date: input.start_date ?? null,
            due_date: input.due_date ?? null,
            priority: input.priority ?? null,
            status: input.status ?? "open",
            position: input.position ?? Number.MAX_SAFE_INTEGER,
            completed_at: null,
            created_at: now,
            subtask_total: 0,
            subtask_done: 0,
            comment_count: 0,
          },
        });
        const result = await createTask(projectId, input);
        if (result.error) setError(result.error);
      }),
    [apply],
  );

  const remove = useCallback(
    (id: string) =>
      startTransition(async () => {
        apply({ kind: "delete", id });
        setOpenId((current) => (current === id ? null : current));
        const result = await deleteItem(id);
        if (result.error) setError(result.error);
      }),
    [apply],
  );

  const openTask = useCallback((id: string) => {
    if (!id.startsWith("temp-")) setOpenId(id);
  }, []);

  const openTaskData = openId ? tasks.find((t) => t.id === openId) : undefined;

  return (
    <StoreContext value={{ tasks, update, add, remove, openTask, error, clearError: () => setError(undefined) }}>
      {error && (
        <div role="alert" className="fixed bottom-4 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-red-500/30 bg-slate-900 px-4 py-3 text-sm text-red-300 shadow-2xl">
          {error}
          <button type="button" onClick={() => setError(undefined)} className="text-slate-400 hover:text-white" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {children}
      {openId && (
        <TaskDrawer
          key={openId}
          taskId={openId}
          task={openTaskData}
          onClose={() => setOpenId(null)}
          onUpdate={(patch) => update(openId, patch)}
          onDelete={() => remove(openId)}
        />
      )}
    </StoreContext>
  );
}
