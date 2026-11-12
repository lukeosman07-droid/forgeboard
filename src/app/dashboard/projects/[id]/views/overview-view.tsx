"use client";

import Link from "next/link";
import { useState } from "react";
import type { StatusReport } from "@/lib/ai/assist";
import { useTaskStore } from "@/components/work/task-store";
import { Avatar, Icon, StatusPill, statusCounts } from "@/components/work/ui";
import { formatDate, localToday, useToday } from "@/lib/dates";
import type { Item, Project, Task } from "@/lib/types";
import { STATUSES, addDays, isOverdue, relativeDue } from "@/lib/work";
import type { Usage, ViewId } from "../project-workspace";

// Project dashboard: progress, status mix, workload, deadlines, and an AI status report.
export default function OverviewView({
  project,
  tasks,
  logItems,
  usage,
  onOpenView,
}: {
  project: Project;
  tasks: Task[];
  logItems: Item[];
  usage: Usage;
  onOpenView: (view: ViewId) => void;
}) {
  const today = useToday();
  const { openTask } = useTaskStore();
  const counts = statusCounts(tasks);
  const total = tasks.length;
  const pct = total ? Math.round((counts.done / total) * 100) : 0;
  const overdue = tasks.filter((t) => isOverdue(t, today));
  const weekAgo = today ? addDays(today, -7) : null;
  const doneThisWeek = weekAgo ? tasks.filter((t) => t.completed_at && t.completed_at.slice(0, 10) >= weekAgo).length : 0;
  const upcoming = today
    ? tasks
        .filter((t) => t.status !== "done" && t.due_date && t.due_date >= today && t.due_date <= addDays(today, 14))
        .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
        .slice(0, 6)
    : [];
  const openRisks = logItems.filter((i) => (i.type === "risk" || i.type === "question") && i.status !== "done");

  const workload = new Map<string, { open: number; done: number }>();
  for (const t of tasks) {
    const key = t.assignee || "Unassigned";
    const w = workload.get(key) ?? { open: 0, done: 0 };
    if (t.status === "done") w.done++;
    else w.open++;
    workload.set(key, w);
  }
  const people = [...workload.entries()].sort((a, b) => b[1].open - a[1].open).slice(0, 8);
  const maxLoad = Math.max(1, ...people.map(([, w]) => w.open + w.done));

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
        <h2 className="text-lg font-semibold text-white">No tasks yet</h2>
        <p className="mx-auto mt-2 max-w-md text-slate-400">
          Add tasks in the Table view, or paste meeting notes into AI Notes and let AI create them for you.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={() => onOpenView("table")} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5">
            Open table
          </button>
          <button type="button" onClick={() => onOpenView("notes")} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-orange-400">
            ✨ AI Notes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Complete" value={`${pct}%`} sub={`${counts.done} of ${total} tasks`} />
        <Stat label="In progress" value={counts.in_progress} sub={`${counts.stuck} stuck`} tone={counts.stuck ? "warn" : undefined} />
        <Stat label="Overdue" value={overdue.length} sub={overdue.length ? "Needs attention" : "All on schedule"} tone={overdue.length ? "bad" : "good"} />
        <Stat label="Done this week" value={doneThisWeek} sub="Last 7 days" />
      </div>

      <AiStatusReport projectId={project.id} usage={usage} />

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Status">
          <div className="flex items-center gap-6">
            <Donut counts={counts} total={total} pct={pct} />
            <ul className="space-y-2 text-sm">
              {STATUSES.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-sm ${s.dot}`} />
                  <span className="text-slate-300">{s.label}</span>
                  <span className="ml-auto pl-4 tabular-nums text-slate-400">{counts[s.id]}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel title="Workload">
          <ul className="space-y-3">
            {people.map(([name, w]) => (
              <li key={name} className="flex items-center gap-3">
                <Avatar name={name === "Unassigned" ? null : name} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-xs">
                    <span className="truncate text-slate-300">{name}</span>
                    <span className="text-slate-500">{w.open} open</span>
                  </div>
                  <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="bg-sky-500" style={{ width: `${(w.open / maxLoad) * 100}%` }} />
                    <div className="bg-emerald-500/60" style={{ width: `${(w.done / maxLoad) * 100}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Due in the next 2 weeks">
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing due soon.</p>
          ) : (
            <ul className="space-y-1">
              {upcoming.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => openTask(t.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5">
                    <span className="min-w-0 flex-1 truncate text-slate-200">{t.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">{relativeDue(t.due_date!, today, formatDate)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={`Overdue (${overdue.length})`}>
          {overdue.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing overdue. Nice work.</p>
          ) : (
            <ul className="space-y-1">
              {overdue.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => openTask(t.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5">
                    <StatusPill status={t.status} className="w-24 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-slate-200">{t.title}</span>
                    <span className="shrink-0 text-xs font-semibold text-red-400">{formatDate(t.due_date!)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title={`Open risks & questions (${openRisks.length})`}
          action={
            <button type="button" onClick={() => onOpenView("log")} className="text-xs text-orange-400 hover:text-orange-300">
              View log →
            </button>
          }
        >
          {openRisks.length === 0 ? (
            <p className="text-sm text-slate-500">No open risks or questions.</p>
          ) : (
            <ul className="space-y-2">
              {openRisks.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 rounded px-1.5 text-[10px] font-semibold uppercase ${r.type === "risk" ? "bg-amber-500/15 text-amber-300" : "bg-sky-500/15 text-sky-300"}`}>
                    {r.type}
                  </span>
                  <span className="text-slate-200">{r.title}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub: string; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "bad" ? "text-red-400" : tone === "warn" ? "text-amber-300" : tone === "good" ? "text-emerald-300" : "text-white";
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

const DONUT_COLORS: Record<string, string> = { open: "#94a3b8", in_progress: "#fbbf24", stuck: "#f43f5e", done: "#34d399" };

function Donut({ counts, total, pct }: { counts: ReturnType<typeof statusCounts>; total: number; pct: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  // Where each status arc starts along the circle.
  const starts = STATUSES.map((_, i) => STATUSES.slice(0, i).reduce((sum, s) => sum + (counts[s.id] / total) * c, 0));
  return (
    <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90" role="img" aria-label={`${pct}% complete`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
      {STATUSES.map((s, i) => {
        const len = (counts[s.id] / total) * c;
        return (
          <circle
            key={s.id}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={DONUT_COLORS[s.id]}
            strokeWidth="12"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-starts[i]}
          />
        );
      })}
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="rotate-90 fill-white text-[18px] font-bold" style={{ transformOrigin: "50px 50px" }}>
        {pct}%
      </text>
    </svg>
  );
}

const HEALTH = {
  on_track: { label: "On track", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  at_risk: { label: "At risk", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  off_track: { label: "Off track", className: "bg-red-500/15 text-red-300 border-red-500/30" },
};

function AiStatusReport({ projectId, usage }: { projectId: string; usage: Usage }) {
  const [report, setReport] = useState<StatusReport>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; upgrade?: boolean }>();
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch("/api/ai/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, today: localToday() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError({ message: body.error ?? "Something went wrong.", upgrade: body.code === "trial_exhausted" });
      setReport(body.report);
    } catch {
      setError({ message: "Couldn't reach the server. Try again." });
    } finally {
      setLoading(false);
    }
  }

  const asText = (r: StatusReport) =>
    [
      `Status: ${HEALTH[r.health].label}`,
      r.headline,
      "",
      "Highlights:",
      ...r.highlights.map((h) => `• ${h}`),
      ...(r.concerns.length ? ["", "Concerns:", ...r.concerns.map((c) => `• ${c}`)] : []),
      "",
      "Next steps:",
      ...r.next_steps.map((n) => `• ${n}`),
    ].join("\n");

  return (
    <section className="rounded-xl border border-orange-500/30 bg-gradient-to-br from-orange-500/[0.08] to-slate-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-orange-500 text-slate-950">
            <Icon name="sparkles" />
          </span>
          <div>
            <h3 className="font-semibold text-white">AI status report</h3>
            <p className="text-sm text-slate-400">A stakeholder-ready update written from your live task data.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(asText(report));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/5"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          )}
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-60"
          >
            {loading ? "Writing…" : report ? "Regenerate" : "Generate report"}
          </button>
        </div>
      </div>
      {!usage.paid && !report && (
        <p className="mt-3 text-xs text-slate-500">Uses 1 of your free AI runs ({usage.trialLeft} left).</p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error.message}
          {error.upgrade && (
            <Link href="/pricing" className="ml-2 font-semibold text-orange-300 underline">
              See plans →
            </Link>
          )}
        </p>
      )}
      {loading && !report && (
        <div className="mt-4 space-y-2" aria-label="Writing report">
          <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
        </div>
      )}
      {report && (
        <div className={`mt-5 space-y-4 ${loading ? "opacity-50" : ""}`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${HEALTH[report.health].className}`}>{HEALTH[report.health].label}</span>
            <p className="font-medium text-white">{report.headline}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <ReportList title="Highlights" items={report.highlights} />
            <ReportList title="Concerns" items={report.concerns} empty="No concerns right now." />
            <ReportList title="Next steps" items={report.next_steps} />
          </div>
        </div>
      )}
    </section>
  );
}

function ReportList({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-orange-400">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-slate-500">•</span>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
