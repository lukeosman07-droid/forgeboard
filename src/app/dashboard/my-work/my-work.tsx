"use client";

import { useState } from "react";
import TaskListRow from "@/components/work/task-list-row";
import TaskStore, { useTaskStore } from "@/components/work/task-store";
import { Icon } from "@/components/work/ui";
import { useToday } from "@/lib/dates";
import type { Task } from "@/lib/types";
import { addDays, startOfWeek } from "@/lib/work";
import type { ProjectSummary } from "@/lib/workspace";

type Bucket = { id: string; label: string; tone: string; tasks: Task[] };

export default function MyWork({ projects, tasks }: { projects: ProjectSummary[]; tasks: Task[] }) {
  return (
    <TaskStore tasks={tasks}>
      <Buckets projects={projects} />
    </TaskStore>
  );
}

function Buckets({ projects }: { projects: ProjectSummary[] }) {
  const today = useToday();
  const { tasks } = useTaskStore();
  const [project, setProject] = useState("");
  const [showDone, setShowDone] = useState(false);
  const projectById = new Map(projects.map((p) => [p.id, p]));

  if (!today) return <div className="mt-6 h-96 animate-pulse rounded-xl bg-white/5" />;

  const scoped = tasks.filter((t) => !project || t.project_id === project);
  const open = scoped.filter((t) => t.status !== "done");
  const endOfWeek = addDays(startOfWeek(today), 6);
  const endOfNextWeek = addDays(endOfWeek, 7);
  const byDue = (a: Task, b: Task) => (a.due_date ?? "").localeCompare(b.due_date ?? "") || a.position - b.position;

  const buckets: Bucket[] = [
    { id: "overdue", label: "Overdue", tone: "text-red-400", tasks: open.filter((t) => t.due_date && t.due_date < today) },
    { id: "today", label: "Today", tone: "text-orange-400", tasks: open.filter((t) => t.due_date === today) },
    { id: "week", label: "Later this week", tone: "text-sky-400", tasks: open.filter((t) => t.due_date && t.due_date > today && t.due_date <= endOfWeek) },
    { id: "next", label: "Next week", tone: "text-violet-400", tasks: open.filter((t) => t.due_date && t.due_date > endOfWeek && t.due_date <= endOfNextWeek) },
    { id: "later", label: "Later", tone: "text-teal-400", tasks: open.filter((t) => t.due_date && t.due_date > endOfNextWeek) },
    { id: "none", label: "No due date", tone: "text-slate-400", tasks: open.filter((t) => !t.due_date) },
  ];
  const done = scoped
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, 20);

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filter by project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-900/60 px-2.5 py-1.5 text-sm text-slate-200 focus:border-orange-500/60 focus:outline-none [color-scheme:dark]"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">{open.length} open</span>
      </div>

      {open.length === 0 && (
        <p className="rounded-xl border border-dashed border-white/15 px-6 py-10 text-center text-slate-400">
          Nothing open. You&apos;re all caught up. 🎉
        </p>
      )}

      {buckets.map((b) =>
        b.tasks.length === 0 ? null : (
          <section key={b.id}>
            <h2 className={`mb-2 flex items-center gap-2 text-sm font-semibold ${b.tone}`}>
              {b.label} <span className="font-normal text-slate-500">{b.tasks.length}</span>
            </h2>
            <ul className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/60">
              {[...b.tasks].sort(byDue).map((t) => (
                <TaskListRow key={t.id} task={t} project={projectById.get(t.project_id)} today={today} />
              ))}
            </ul>
          </section>
        ),
      )}

      {done.length > 0 && (
        <section>
          <button type="button" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone} className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
            <Icon name="chevron" className={`h-4 w-4 transition ${showDone ? "rotate-90" : ""}`} />
            Recently completed <span className="font-normal text-slate-500">{done.length}</span>
          </button>
          {showDone && (
            <ul className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/60">
              {done.map((t) => (
                <TaskListRow key={t.id} task={t} project={projectById.get(t.project_id)} today={today} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
