"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWorkspace, useWorkspacePath } from "@/components/app/workspace-context";
import { formatDate, useToday } from "@/lib/dates";
import { loadLevel, workloadGrid, type WorkloadCell, type WorkloadGrid as Grid } from "@/lib/workload";
import { getWorkload } from "@/server/engineering";

// People down the side; Overdue, the next few weeks and "No date" across.
// Each cell counts open tasks; the red note is how many of them are late.

const LEVEL: Record<ReturnType<typeof loadLevel>, string> = {
  none: "text-slate-600",
  light: "bg-emerald-500/10 text-emerald-200",
  medium: "bg-amber-500/15 text-amber-200",
  heavy: "bg-rose-500/20 text-rose-200",
};

export default function WorkloadGrid({ slug, enabled }: { slug: string; enabled: boolean }) {
  const today = useToday();
  const path = useWorkspacePath();
  const { isAdmin } = useWorkspace();
  const [weeks, setWeeks] = useState(6);
  const [result, setResult] = useState<{ key: string; grid: Grid | "error" } | null>(null);
  const key = `${today}-${weeks}`;

  useEffect(() => {
    if (!today || !enabled) return;
    let live = true;
    getWorkload(slug, today, weeks).then((rows) => {
      if (live) setResult({ key: `${today}-${weeks}`, grid: rows ? workloadGrid(rows, today, weeks) : "error" });
    });
    return () => {
      live = false;
    };
  }, [slug, today, weeks, enabled]);

  if (!enabled) {
    return (
      <div className="mt-6 rounded-2xl border border-orange-500/30 bg-orange-500/5 px-6 py-8 text-center">
        <p className="font-semibold text-white">The workload view is on the Business plan.</p>
        <p className="mt-1 text-sm text-slate-400">See who is overloaded before deadlines slip, across every project.</p>
        {isAdmin ? (
          <Link href={path("/billing")} className="mt-4 inline-block rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-orange-400">
            See plans
          </Link>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Ask a workspace admin to upgrade.</p>
        )}
      </div>
    );
  }
  const grid = result?.key === key ? result.grid : null;
  if (grid === "error") return <p className="mt-6 text-red-300">Couldn&apos;t load the workload. Please refresh.</p>;
  if (!grid) return <div className="mt-6 h-96 animate-pulse rounded-xl bg-white/5" aria-label="Loading workload" />;

  const totals = {
    overdue: grid.people.reduce((n, p) => n + p.overdue.open, 0),
    weeks: grid.weeks.map((_, i) => grid.people.reduce((n, p) => n + p.weeks[i].open, 0)),
    noDate: grid.people.reduce((n, p) => n + p.noDate.open, 0),
    all: grid.people.reduce((n, p) => n + p.total, 0),
  };

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <label className="flex items-center gap-2">
          Weeks
          <select
            aria-label="Weeks to show"
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1 text-sm text-slate-200 [color-scheme:dark]"
          >
            {[4, 6, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto">
          {totals.all} open task{totals.all === 1 ? "" : "s"} in this window
        </span>
      </div>
      {grid.people.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center text-slate-400">No open tasks. Nice.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[720px] text-sm" aria-label="Workload">
            <thead className="bg-slate-900/80 text-xs font-medium text-slate-400">
              <tr>
                <th className="px-4 py-2 text-left">Person</th>
                <th className="px-2 py-2 text-center text-red-300">Overdue</th>
                {grid.weeks.map((w, i) => (
                  <th key={w} className="px-2 py-2 text-center">
                    {i === 0 ? "This week" : `Wk of ${formatDate(w)}`}
                  </th>
                ))}
                <th className="px-2 py-2 text-center">No date</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {grid.people.map((p) => (
                <tr key={p.key} className="border-t border-white/5" data-person={p.name}>
                  <th scope="row" className="px-4 py-2 text-left font-medium text-slate-200">
                    {p.name}
                    {!p.id && p.key !== "none" && <span className="ml-1 text-xs font-normal text-slate-500">(not a member)</span>}
                  </th>
                  <Cell cell={p.overdue} late />
                  {p.weeks.map((c, i) => (
                    <Cell key={grid.weeks[i]} cell={c} />
                  ))}
                  <Cell cell={p.noDate} />
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-white" data-total>
                    {p.total}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-white/10 bg-slate-900/60 text-xs text-slate-400">
              <tr>
                <th scope="row" className="px-4 py-2 text-left">
                  All
                </th>
                <td className="px-2 py-2 text-center tabular-nums">{totals.overdue}</td>
                {totals.weeks.map((n, i) => (
                  <td key={grid.weeks[i]} className="px-2 py-2 text-center tabular-nums">
                    {n}
                  </td>
                ))}
                <td className="px-2 py-2 text-center tabular-nums">{totals.noDate}</td>
                <td className="px-3 py-2 text-right tabular-nums" data-grand-total>
                  {totals.all}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Counts open tasks (not done) by due date. Tasks due before this week count as overdue; tasks due after the last week shown aren&apos;t counted.
      </p>
    </div>
  );
}

function Cell({ cell, late = false }: { cell: WorkloadCell; late?: boolean }) {
  const level = late && cell.open > 0 ? "bg-red-500/15 text-red-200" : LEVEL[loadLevel(cell.open)];
  return (
    <td className="px-1 py-1 text-center">
      <span className={`inline-flex min-w-10 items-center justify-center gap-1 rounded-md px-2 py-1 tabular-nums ${level}`}>
        {cell.open || "·"}
        {!late && cell.overdue > 0 && (
          <span className="text-[10px] text-red-300" title={`${cell.overdue} past due`}>
            ({cell.overdue} late)
          </span>
        )}
      </span>
    </td>
  );
}
