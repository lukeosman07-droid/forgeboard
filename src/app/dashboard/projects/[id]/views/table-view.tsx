"use client";

import { useState, useTransition } from "react";
import { createSection, deleteSection, renameSection } from "@/app/dashboard/actions";
import { useTaskStore } from "@/components/work/task-store";
import {
  Avatar,
  DateField,
  Icon,
  MenuItem,
  Popover,
  PriorityPicker,
  ProgressBar,
  StatusBar,
  StatusPicker,
  statusCounts,
} from "@/components/work/ui";
import { useToday } from "@/lib/dates";
import type { Project, Section, Task } from "@/lib/types";
import { byPosition, isOverdue, positionBetween } from "@/lib/work";

// Spreadsheet-style view: tasks grouped by section, every cell editable in place.

export const GROUP_COLORS = [
  { bar: "bg-sky-500", text: "text-sky-400", border: "border-t-sky-500" },
  { bar: "bg-violet-500", text: "text-violet-400", border: "border-t-violet-500" },
  { bar: "bg-emerald-500", text: "text-emerald-400", border: "border-t-emerald-500" },
  { bar: "bg-pink-500", text: "text-pink-400", border: "border-t-pink-500" },
  { bar: "bg-amber-500", text: "text-amber-400", border: "border-t-amber-500" },
  { bar: "bg-teal-500", text: "text-teal-400", border: "border-t-teal-500" },
];

const COLS = "grid-cols-[minmax(18rem,1fr)_10rem_9rem_7.5rem_6.5rem_6.5rem_6.5rem]";

type Group = { id: string | null; name: string; color: (typeof GROUP_COLORS)[number]; tasks: Task[] };

export function groupBySection(sections: Section[], tasks: Task[]): Group[] {
  const known = new Set(sections.map((s) => s.id));
  const groups: Group[] = sections.map((s, i) => ({
    id: s.id,
    name: s.name,
    color: GROUP_COLORS[i % GROUP_COLORS.length],
    tasks: tasks.filter((t) => t.section_id === s.id).sort(byPosition),
  }));
  const loose = tasks.filter((t) => !t.section_id || !known.has(t.section_id)).sort(byPosition);
  if (loose.length || sections.length === 0) {
    groups.push({ id: null, name: sections.length ? "No section" : "Tasks", color: { bar: "bg-slate-500", text: "text-slate-400", border: "border-t-slate-500" }, tasks: loose });
  }
  return groups;
}

export default function TableView({
  project,
  sections,
  tasks,
  filtering,
}: {
  project: Project;
  sections: Section[];
  tasks: Task[];
  filtering: boolean;
}) {
  const today = useToday();
  const { update } = useTaskStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const groups = groupBySection(sections, tasks);

  const dropBefore = (group: Group, beforeId: string | null) => {
    if (!dragId || dragId === beforeId) return;
    const others = group.tasks.filter((t) => t.id !== dragId);
    const index = beforeId ? others.findIndex((t) => t.id === beforeId) : others.length;
    const position = positionBetween(others[index - 1]?.position, others[index]?.position);
    update(dragId, { section_id: group.id, position });
    setDragId(null);
  };

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <GroupTable
          key={group.id ?? "none"}
          project={project}
          group={group}
          today={today}
          filtering={filtering}
          dragging={dragId !== null}
          onDragStart={setDragId}
          onDropBefore={(beforeId) => dropBefore(group, beforeId)}
        />
      ))}
      <AddSection projectId={project.id} />
    </div>
  );
}

function GroupTable({
  project,
  group,
  today,
  filtering,
  dragging,
  onDragStart,
  onDropBefore,
}: {
  project: Project;
  group: Group;
  today: string | null;
  filtering: boolean;
  dragging: boolean;
  onDragStart: (id: string | null) => void;
  onDropBefore: (beforeId: string | null) => void;
}) {
  const { add } = useTaskStore();
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState("");
  const done = group.tasks.filter((t) => t.status === "done").length;

  return (
    <section>
      <GroupHeader group={group} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} doneCount={done} />

      {!collapsed && (
        <div className="mt-2 overflow-x-auto rounded-xl border border-white/10">
          <div className="min-w-[900px]">
            <div className={`grid ${COLS} border-b border-white/10 bg-slate-900/80 text-xs font-medium text-slate-400`}>
              <div className="flex items-center gap-2 py-2 pl-5">Task</div>
              <div className="py-2 text-center">Owner</div>
              <div className="py-2 text-center">Status</div>
              <div className="py-2 text-center">Priority</div>
              <div className="py-2 text-center">Start</div>
              <div className="py-2 text-center">Due</div>
              <div className="py-2 text-center">Subtasks</div>
            </div>

            {group.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                color={group.color.bar}
                today={today}
                dragging={dragging}
                onDragStart={() => onDragStart(task.id)}
                onDragEnd={() => onDragStart(null)}
                onDrop={() => onDropBefore(task.id)}
              />
            ))}

            {group.tasks.length === 0 && (
              <p className="border-b border-white/5 px-5 py-4 text-sm text-slate-500">
                {filtering ? "No tasks match your filters here." : "No tasks yet. Add one below."}
              </p>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                add(project.id, { title: draft.trim(), section_id: group.id });
                setDraft("");
              }}
              onDragOver={(e) => dragging && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onDropBefore(null);
              }}
              className={`grid ${COLS} bg-slate-900/30`}
            >
              <div className="relative flex items-center">
                <span className={`absolute inset-y-0 left-0 w-1.5 ${group.color.bar} opacity-40`} />
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="+ Add task"
                  aria-label={`Add task to ${group.name}`}
                  maxLength={500}
                  className="w-full bg-transparent py-2.5 pl-5 pr-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                />
              </div>
              <div className="col-span-6" />
            </form>

            <div className={`grid ${COLS} border-t border-white/10 bg-slate-900/60`}>
              <div className="px-5 py-2 text-xs text-slate-500">
                {group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}
              </div>
              <div />
              <div className="flex items-center px-2">
                <StatusBar counts={statusCounts(group.tasks)} className="w-full" />
              </div>
              <div className="col-span-4" />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function GroupHeader({
  group,
  collapsed,
  onToggle,
  doneCount,
}: {
  group: Group;
  collapsed: boolean;
  onToggle: () => void;
  doneCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setEditing(false);
    const n = name.trim();
    if (!group.id || !n || n === group.name) return setName(group.name);
    startTransition(async () => {
      await renameSection(group.id!, n);
    });
  };

  return (
    <div className={`flex items-center gap-2 ${pending ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.name}`}
        className={`rounded p-1 ${group.color.text} hover:bg-white/5`}
      >
        <Icon name="chevron" className={`h-4 w-4 transition ${collapsed ? "" : "rotate-90"}`} />
      </button>
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setName(group.name);
              setEditing(false);
            }
          }}
          aria-label="Section name"
          maxLength={120}
          className={`rounded-md border border-orange-500/60 bg-slate-950 px-2 py-0.5 text-lg font-semibold ${group.color.text} focus:outline-none`}
        />
      ) : (
        <h2
          onDoubleClick={() => group.id && setEditing(true)}
          className={`text-lg font-semibold ${group.color.text}`}
          title={group.id ? "Double-click to rename" : undefined}
        >
          {group.name}
        </h2>
      )}
      <span className="text-sm text-slate-500">
        {doneCount}/{group.tasks.length} done
      </span>
      {group.id && (
        <Popover
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} aria-label={`${group.name} options`} className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-white">
              <Icon name="dots" />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                onClick={() => {
                  close();
                  setEditing(true);
                }}
              >
                Rename section
              </MenuItem>
              <MenuItem
                danger
                onClick={() => {
                  close();
                  if (!confirm(`Delete the "${group.name}" section? Its tasks will stay in the project under "No section".`)) return;
                  startTransition(async () => {
                    await deleteSection(group.id!);
                  });
                }}
              >
                Delete section
              </MenuItem>
            </>
          )}
        </Popover>
      )}
    </div>
  );
}

function TaskRow({
  task,
  color,
  today,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  task: Task;
  color: string;
  today: string | null;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const { update, openTask } = useTaskStore();
  const [over, setOver] = useState(false);
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
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop();
      }}
      className={`group grid ${COLS} border-b border-white/5 bg-slate-950/40 text-sm transition hover:bg-white/[0.03] ${
        over ? "shadow-[inset_0_2px_0_0] shadow-orange-500" : ""
      } ${temp ? "opacity-60" : ""}`}
    >
      <div className="relative flex min-w-0 items-center gap-2 py-2 pl-5 pr-3">
        <span className={`absolute inset-y-0 left-0 w-1.5 ${color}`} />
        <input
          type="checkbox"
          checked={done}
          onChange={() => update(task.id, { status: done ? "open" : "done" })}
          aria-label={`Mark "${task.title}" ${done ? "not done" : "done"}`}
          className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
        />
        <button
          type="button"
          onClick={() => openTask(task.id)}
          className={`min-w-0 truncate text-left hover:text-orange-300 ${done ? "text-slate-500 line-through" : "text-slate-100"}`}
        >
          {task.title}
        </button>
        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-slate-500">
          {task.comment_count > 0 && (
            <span className="flex items-center gap-0.5" title={`${task.comment_count} updates`}>
              <Icon name="comment" className="h-3.5 w-3.5" />
              {task.comment_count}
            </span>
          )}
          <button
            type="button"
            onClick={() => openTask(task.id)}
            className="rounded px-1.5 py-0.5 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100 focus:opacity-100"
          >
            Open
          </button>
        </span>
      </div>

      <div className="flex items-center justify-center border-l border-white/5">
        <OwnerCell value={task.assignee} onSave={(assignee) => update(task.id, { assignee })} />
      </div>
      <div className="border-l border-white/5">
        <StatusPicker full status={task.status} onChange={(status) => update(task.id, { status })} />
      </div>
      <div className="border-l border-white/5">
        <PriorityPicker full priority={task.priority} onChange={(priority) => update(task.id, { priority })} />
      </div>
      <DateField
        label="Start date"
        value={task.start_date}
        today={today}
        onChange={(start_date) => update(task.id, { start_date })}
        className="border-l border-white/5 hover:bg-white/5"
      />
      <DateField
        label="Due date"
        value={task.due_date}
        today={today}
        overdue={isOverdue(task, today)}
        onChange={(due_date) => update(task.id, { due_date })}
        className="border-l border-white/5 hover:bg-white/5"
      />
      <div className="flex items-center justify-center gap-2 border-l border-white/5 px-3">
        {task.subtask_total > 0 ? (
          <>
            <ProgressBar done={task.subtask_done} total={task.subtask_total} className="flex-1" />
            <span className="text-xs tabular-nums text-slate-400">
              {task.subtask_done}/{task.subtask_total}
            </span>
          </>
        ) : (
          <span className="text-xs text-slate-600">–</span>
        )}
      </div>
    </div>
  );
}

function OwnerCell({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const [text, setText] = useState(value ?? "");
  return (
    <Popover
      className="h-full w-full"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={(e) => {
            setText(value ?? "");
            toggle(e);
          }}
          aria-label={`Owner: ${value ?? "unassigned"}. Change owner`}
          className="flex h-full w-full items-center justify-center gap-2 px-2 hover:bg-white/5"
        >
          <Avatar name={value} />
          {value && <span className="truncate text-xs text-slate-300">{value}</span>}
        </button>
      )}
    >
      {(close) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(text.trim() || null);
            close();
          }}
          className="flex w-60 flex-col gap-2 p-1"
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Name"
            aria-label="Owner name"
            maxLength={200}
            className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none"
          />
          <div className="flex justify-between">
            {value ? (
              <button
                type="button"
                onClick={() => {
                  onSave(null);
                  close();
                }}
                className="text-xs text-slate-400 hover:text-red-300"
              >
                Unassign
              </button>
            ) : (
              <span />
            )}
            <button type="submit" className="rounded-md bg-orange-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-orange-400">
              Save
            </button>
          </div>
        </form>
      )}
    </Popover>
  );
}

function AddSection({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-dashed border-white/15 px-4 py-2 text-sm text-slate-300 hover:border-white/30 hover:text-white"
      >
        <Icon name="plus" /> Add section
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await createSection(projectId, name);
          if (result.error) return setError(result.error);
          setName("");
          setOpen(false);
        });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Section name, e.g. Design"
        aria-label="New section name"
        maxLength={120}
        className="w-64 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none"
      />
      <button type="submit" disabled={pending} className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-60">
        {pending ? "Adding…" : "Add section"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 text-sm text-slate-400 hover:text-white">
        Cancel
      </button>
      {error && <p className="w-full text-sm text-red-300">{error}</p>}
    </form>
  );
}
