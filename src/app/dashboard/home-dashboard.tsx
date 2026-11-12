"use client";

import Link from "next/link";
import TaskListRow from "@/components/work/task-list-row";
import TaskStore, { useTaskStore } from "@/components/work/task-store";
import { StatusBar, statusCounts } from "@/components/work/ui";
import { useToday } from "@/lib/dates";
import type { Task } from "@/lib/types";
import { addDays, colorOf, isOverdue } from "@/lib/work";
import type { ProjectSummary } from "@/lib/workspace";

export default function HomeDashboard({ projects, tasks }: { projects: ProjectSummary[]; tasks: Task[] }) {
  return (
    <TaskStore tasks={tasks}>
      <Home projects={projects} />
    </TaskStore>
  );
}

function Home({ projects }: { projects: ProjectSummary[] }) {
  const today = useToday();
  const { tasks } = useTaskStore();
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const open = tasks.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => isOverdue(t, today));
  const dueToday = today ? open.filter((t) => t.due_date === today) : [];
  const weekAgo = today ? addDays(today, -7) : null;
  const doneThisWeek = weekAgo ? tasks.filter((t) => t.completed_at && t.completed_at.slice(0, 10) >= weekAgo).length : 0;

  // Overdue first, then soonest due; undated last.
  const upcoming = [...open]
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.position - b.position)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open tasks" value={open.length} />
        <Stat label="Due today" value={dueToday.length} tone={dueToday.length ? "warn" : undefined} />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "bad" : "good"} />
        <Stat label="Completed this week" value={doneThisWeek} tone="good" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Up next</h2>
            <Link href="/dashboard/my-work" className="text-sm text-orange-400 hover:text-orange-300">
              All my work →
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/60">
            {upcoming.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">You&apos;re all caught up. 🎉</p>
            ) : (
              <ul>
                {upcoming.map((t) => (
                  <TaskListRow key={t.id} task={t} project={projectById.get(t.project_id)} today={today} />
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold text-white">Projects</h2>
          <ul className="space-y-3">
            {projects.map((p) => {
              const projectTasks = tasks.filter((t) => t.project_id === p.id);
              const counts = statusCounts(projectTasks);
              const pct = projectTasks.length ? Math.round((counts.done / projectTasks.length) * 100) : 0;
              const late = projectTasks.filter((t) => isOverdue(t, today)).length;
              return (
                <li key={p.id}>
                  <Link
                    href={`/dashboard/projects/${p.id}`}
                    className="block rounded-xl border border-white/10 bg-slate-900/60 p-4 transition hover:border-white/25"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-bold text-slate-950 ${colorOf(p.color).dot}`}>
                        {p.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-white">{p.name}</span>
                      <span className="text-sm font-semibold tabular-nums text-slate-300">{pct}%</span>
                    </div>
                    <StatusBar counts={counts} className="mt-3" />
                    <p className="mt-2 text-xs text-slate-500">
                      {projectTasks.length} tasks · {counts.done} done
                      {late > 0 && <span className="text-red-400"> · {late} overdue</span>}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "bad" ? "text-red-400" : tone === "warn" ? "text-amber-300" : tone === "good" ? "text-emerald-300" : "text-white";
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
