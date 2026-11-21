"use client";

import { useState } from "react";
import { useTaskStore } from "@/components/work/task-store";
import { Avatar, Icon, PriorityFlag } from "@/components/work/ui";
import { formatDate, useToday } from "@/lib/dates";
import type { ItemStatus, Project, Section, Task } from "@/lib/types";
import { STATUSES, byPosition, isOverdue, positionBetween, relativeDue } from "@/lib/work";
import { groupBySection } from "./table-view";

// Kanban board. Drag cards between columns to change status (or section).

type GroupBy = "status" | "section";
type Column = { key: string; label: string; accent: string; tasks: Task[]; patch: { status?: ItemStatus; section_id?: string | null } };

export default function BoardView({ project, sections, tasks }: { project: Project; sections: Section[]; tasks: Task[] }) {
  const today = useToday();
  const { update, add } = useTaskStore();
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [dragId, setDragId] = useState<string | null>(null);
  const sectionNames = new Map(sections.map((s) => [s.id, s.name]));

  const columns: Column[] =
    groupBy === "status"
      ? STATUSES.map((s) => ({
          key: s.id,
          label: s.label,
          accent: s.column,
          tasks: tasks.filter((t) => t.status === s.id).sort(byPosition),
          patch: { status: s.id },
        }))
      : groupBySection(sections, tasks).map((g) => ({
          key: g.id ?? "none",
          label: g.name,
          accent: g.color.border,
          tasks: g.tasks,
          patch: { section_id: g.id },
        }));

  const drop = (column: Column, beforeId: string | null) => {
    if (!dragId || dragId === beforeId) return setDragId(null);
    const others = column.tasks.filter((t) => t.id !== dragId);
    const index = beforeId ? others.findIndex((t) => t.id === beforeId) : others.length;
    update(dragId, { ...column.patch, position: positionBetween(others[index - 1]?.position, others[index]?.position) });
    setDragId(null);
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
        Group by
        {(["status", "section"] as const).map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={groupBy === g}
            onClick={() => setGroupBy(g)}
            className={`rounded-md px-2.5 py-1 capitalize ${groupBy === g ? "bg-white/10 text-white" : "hover:text-white"}`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
        <div className="flex min-w-max items-start gap-4">
          {columns.map((column) => (
            <BoardColumn
              key={column.key}
              column={column}
              dragging={dragId !== null}
              onDrop={(beforeId) => drop(column, beforeId)}
              onAdd={(title) =>
                add(project.id, {
                  title,
                  section_id: column.patch.section_id !== undefined ? column.patch.section_id : (sections[0]?.id ?? null),
                  status: column.patch.status,
                })
              }
            >
              {column.tasks.map((task) => (
                <Card
                  key={task.id}
                  task={task}
                  today={today}
                  sectionName={groupBy === "status" && task.section_id ? sectionNames.get(task.section_id) : undefined}
                  dragging={dragId !== null}
                  onDragStart={() => setDragId(task.id)}
                  onDragEnd={() => setDragId(null)}
                  onDrop={() => drop(column, task.id)}
                />
              ))}
            </BoardColumn>
          ))}
        </div>
      </div>
    </div>
  );
}

function BoardColumn({
  column,
  dragging,
  onDrop,
  onAdd,
  children,
}: {
  column: Column;
  dragging: boolean;
  onDrop: (beforeId: string | null) => void;
  onAdd: (title: string) => void;
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        if (!dragging) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop(null);
      }}
      className={`flex w-72 shrink-0 flex-col rounded-xl border-t-4 ${column.accent} bg-slate-900/60 transition ${over ? "ring-2 ring-orange-500/40" : ""}`}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <h3 className="text-sm font-semibold text-white">{column.label}</h3>
        <span className="rounded-full bg-white/5 px-2 text-xs text-slate-400">{column.tasks.length}</span>
      </div>
      <div className="flex min-h-16 flex-col gap-2 px-2 pb-2">{children}</div>
      <div className="px-2 pb-2">
        {adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) onAdd(draft.trim());
              setDraft("");
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => !draft.trim() && setAdding(false)}
              onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
              placeholder="Task name, then Enter"
              aria-label={`New task in ${column.label}`}
              maxLength={500}
              className="w-full rounded-lg border border-orange-500/50 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <Icon name="plus" /> Add task
          </button>
        )}
      </div>
    </div>
  );
}

function Card({
  task,
  today,
  sectionName,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  task: Task;
  today: string | null;
  sectionName?: string;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const { openTask, update } = useTaskStore();
  const [over, setOver] = useState(false);
  const overdue = isOverdue(task, today);
  const done = task.status === "done";
  const temp = task.id.startsWith("temp-");

  return (
    <div
      draggable={!temp}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!dragging) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        onDrop();
      }}
      className={`group cursor-grab rounded-lg border bg-slate-950 p-3 shadow-sm transition active:cursor-grabbing ${
        over ? "border-orange-500/70" : "border-white/10 hover:border-white/25"
      } ${temp ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={done}
          onChange={() => update(task.id, { status: done ? "open" : "done" })}
          aria-label={`Mark "${task.title}" ${done ? "not done" : "done"}`}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
        />
        <button
          type="button"
          onClick={() => openTask(task.id)}
          className={`text-left text-sm font-medium leading-snug hover:text-orange-300 ${done ? "text-slate-500 line-through" : "text-slate-100"}`}
        >
          {task.title}
        </button>
      </div>
      {sectionName && <p className="mt-1.5 pl-6 text-xs text-slate-500">{sectionName}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-6">
        <Avatar name={task.assignee} />
        {task.due_date && (
          <span className={`text-xs ${overdue ? "font-semibold text-red-400" : "text-slate-400"}`}>
            {relativeDue(task.due_date, today, formatDate)}
          </span>
        )}
        <PriorityFlag priority={task.priority} />
        <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          {task.subtask_total > 0 && (
            <span className="flex items-center gap-0.5" title="Subtasks done">
              <Icon name="subtask" className="h-3.5 w-3.5" />
              {task.subtask_done}/{task.subtask_total}
            </span>
          )}
          {task.comment_count > 0 && (
            <span className="flex items-center gap-0.5" title="Updates">
              <Icon name="comment" className="h-3.5 w-3.5" />
              {task.comment_count}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
