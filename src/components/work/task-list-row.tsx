"use client";

import { useTaskStore } from "./task-store";
import { DateField, PriorityFlag, StatusPicker } from "./ui";
import type { Task } from "@/lib/types";
import { colorOf, isOverdue } from "@/lib/work";

// One task in a cross-project list (Home, My work): checkbox, name, project, status, due date.
export default function TaskListRow({
  task,
  project,
  today,
}: {
  task: Task;
  project?: { name: string; color: string };
  today: string | null;
}) {
  const { update, openTask } = useTaskStore();
  const done = task.status === "done";

  return (
    <li className="group flex items-center gap-3 border-b border-white/5 px-4 py-2.5 last:border-b-0 hover:bg-white/[0.03]">
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
        className={`min-w-0 flex-1 truncate text-left text-sm hover:text-orange-300 ${done ? "text-slate-500 line-through" : "text-slate-100"}`}
      >
        {task.title}
      </button>
      <span className="hidden sm:block">
        <PriorityFlag priority={task.priority} />
      </span>
      {project && (
        <span className={`hidden max-w-40 items-center gap-1.5 truncate rounded-md px-2 py-0.5 text-xs md:flex ${colorOf(project.color).soft} ${colorOf(project.color).text}`}>
          <span className={`h-2 w-2 shrink-0 rounded-sm ${colorOf(project.color).dot}`} />
          <span className="truncate">{project.name}</span>
        </span>
      )}
      <span className="w-28 shrink-0">
        <StatusPicker status={task.status} onChange={(status) => update(task.id, { status })} />
      </span>
      <DateField
        label="Due date"
        value={task.due_date}
        today={today}
        overdue={isOverdue(task, today)}
        onChange={(due_date) => update(task.id, { due_date })}
        className="w-20 shrink-0 rounded-md py-1 hover:bg-white/5"
      />
    </li>
  );
}
