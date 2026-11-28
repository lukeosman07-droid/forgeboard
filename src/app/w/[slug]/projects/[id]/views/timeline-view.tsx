"use client";

import { useRef, useState } from "react";
import { useProjectExtras } from "@/components/work/project-extras";
import { useTaskStore } from "@/components/work/task-store";
import { Avatar, Icon } from "@/components/work/ui";
import { formatDate, useToday } from "@/lib/dates";
import type { Project, Section, Task } from "@/lib/types";
import { findConflicts } from "@/lib/dependencies";
import { STATUS_BY_ID, addDays, daysBetween, startOfWeek, weekdayShort } from "@/lib/work";
import { groupBySection } from "./table-view";

// Gantt-style timeline. Drag a bar to move a task; drag its right edge to
// change how long it runs. Milestones show as diamonds; arrows link a task to
// the ones that wait on it, and turn amber when the dates clash.

const DAY = 30; // px per day
const WEEKS = 10;
const NAME_COL = "w-64";
const NAME_PX = 256;
const GROUP_H = 32;
const ROW_H = 40;

type Drag = { id: string; mode: "move" | "resize"; startX: number; delta: number };

export default function TimelineView({ sections, tasks, sorted = false }: { project: Project; sections: Section[]; tasks: Task[]; sorted?: boolean }) {
  const today = useToday();
  const { update, openTask, tasks: allTasks } = useTaskStore();
  const extras = useProjectExtras();
  const milestones = extras?.milestones ?? [];
  const dependencies = extras?.dependencies ?? [];
  const [offsetWeeks, setOffsetWeeks] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const moved = useRef(false);

  if (!today) return <div className="h-96 animate-pulse rounded-xl bg-white/5" />;

  const start = addDays(startOfWeek(today), (offsetWeeks - 1) * 7);
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i));
  const end = days[days.length - 1];
  const groups = groupBySection(sections, tasks, sorted);
  const scheduled = tasks.filter((t) => t.start_date || t.due_date).length;
  const conflictIds = new Set(findConflicts(allTasks, dependencies).map((c) => c.dependencyId));
  const flagged = new Set(findConflicts(allTasks, dependencies).map((c) => c.successor.id));

  const span = (t: Task) => {
    let from = t.start_date ?? t.due_date!;
    let to = t.due_date ?? t.start_date!;
    if (to < from) [from, to] = [to, from];
    if (drag?.id === t.id) {
      if (drag.mode === "move") {
        from = addDays(from, drag.delta);
        to = addDays(to, drag.delta);
      } else {
        to = addDays(to, drag.delta);
        if (to < from) to = from;
      }
    }
    return { from, to };
  };

  const finish = (t: Task) => {
    if (!drag || drag.id !== t.id) return;
    const { delta, mode } = drag;
    setDrag(null);
    if (delta === 0) return;
    moved.current = true; // swallow the click that follows a drag
    const baseFrom = t.start_date ?? t.due_date!;
    const baseTo = t.due_date ?? t.start_date!;
    if (mode === "move") {
      update(t.id, { start_date: addDays(baseFrom, delta), due_date: addDays(baseTo, delta) });
    } else {
      const newTo = addDays(baseTo, delta);
      update(t.id, { start_date: baseFrom, due_date: newTo < baseFrom ? baseFrom : newTo });
    }
  };

  const todayLeft = daysBetween(start, today) * DAY;

  // Where each visible bar sits, for drawing dependency arrows.
  const bars = new Map<string, { y: number; left: number; right: number }>();
  let y = 0;
  for (const group of groups) {
    y += GROUP_H;
    for (const t of group.tasks) {
      if (t.start_date || t.due_date) {
        const { from, to } = span(t);
        bars.set(t.id, { y: y + ROW_H / 2, left: daysBetween(start, from) * DAY, right: daysBetween(start, to) * DAY + DAY });
      }
      y += ROW_H;
    }
  }
  const bodyHeight = y;
  const arrows = dependencies
    .map((d) => ({ d, from: bars.get(d.predecessor_id), to: bars.get(d.successor_id) }))
    .filter((a): a is { d: (typeof dependencies)[number]; from: { y: number; left: number; right: number }; to: { y: number; left: number; right: number } } => !!a.from && !!a.to);
  const shownMilestones = milestones.filter((m) => m.due_on >= start && m.due_on <= end);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOffsetWeeks((w) => w - 4)} aria-label="Earlier" className="rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/5">
          <Icon name="chevron" className="h-4 w-4 rotate-180" />
        </button>
        <button type="button" onClick={() => setOffsetWeeks((w) => w + 4)} aria-label="Later" className="rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/5">
          <Icon name="chevron" className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setOffsetWeeks(0)} className="rounded-lg border border-white/10 px-3 py-1 text-sm text-slate-300 hover:bg-white/5">
          Today
        </button>
        <span className="text-sm text-slate-400">
          {formatDate(start)} – {formatDate(end)}
        </span>
        <span className="ml-auto text-xs text-slate-500">
          {tasks.length - scheduled > 0 && `${tasks.length - scheduled} task${tasks.length - scheduled === 1 ? "" : "s"} without dates aren't shown. `}
          Drag bars to reschedule.
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <div className="relative" style={{ width: `calc(16rem + ${days.length * DAY}px)` }}>
          {/* Header: weeks + days */}
          <div className="sticky top-0 z-20 flex border-b border-white/10 bg-slate-900">
            <div className={`${NAME_COL} sticky left-0 z-30 shrink-0 border-r border-white/10 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-400`}>
              Task
            </div>
            <div className="flex">
              {days.map((d) => (
                <div
                  key={d}
                  style={{ width: DAY }}
                  className={`shrink-0 border-l py-1 text-center ${weekdayShort(d) === "Mon" ? "border-white/15" : "border-white/[0.03]"}`}
                >
                  <div className="h-3.5 text-[10px] text-slate-500">{weekdayShort(d) === "Mon" ? formatDate(d) : ""}</div>
                  <div className={`text-[11px] ${d === today ? "font-bold text-orange-400" : "text-slate-400"}`}>{Number(d.slice(8))}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Milestones: a diamond in the header and a dashed line down the chart */}
          {shownMilestones.map((m) => {
            const x = daysBetween(start, m.due_on) * DAY + DAY / 2;
            return (
              <div key={m.id} className="pointer-events-none absolute bottom-0 top-0 z-10" style={{ left: `calc(16rem + ${x}px)` }}>
                <div className={`h-full border-l border-dashed ${m.done_at ? "border-emerald-400/50" : "border-violet-400/60"}`} />
                <div
                  title={`Milestone: ${m.name} (${formatDate(m.due_on)})`}
                  className={`pointer-events-auto absolute -left-1.5 top-1 h-3 w-3 rotate-45 ${m.done_at ? "bg-emerald-400" : "bg-violet-400"}`}
                />
              </div>
            );
          })}

          {/* Today line */}
          {todayLeft >= 0 && todayLeft < days.length * DAY && (
            <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-orange-500/70" style={{ left: `calc(16rem + ${todayLeft + DAY / 2}px)` }} />
          )}

          <div className="relative">
          {arrows.length > 0 && (
            <svg
              aria-hidden
              className="pointer-events-none absolute top-0 z-[5]"
              style={{ left: NAME_PX, width: days.length * DAY, height: bodyHeight }}
            >
              <defs>
                <marker id="dep-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="#94a3b8" />
                </marker>
                <marker id="dep-arrow-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="#f59e0b" />
                </marker>
              </defs>
              {arrows.map(({ d, from, to }) => {
                const bad = conflictIds.has(d.id);
                const x1 = from.right;
                const x2 = to.left;
                const mid = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 12));
                return (
                  <path
                    key={d.id}
                    data-dependency={d.id}
                    data-conflict={bad || undefined}
                    d={`M${x1},${from.y} H${mid} V${to.y} H${x2}`}
                    fill="none"
                    stroke={bad ? "#f59e0b" : "#94a3b8"}
                    strokeWidth={bad ? 2 : 1.25}
                    strokeDasharray={bad ? "4 3" : undefined}
                    markerEnd={`url(#${bad ? "dep-arrow-bad" : "dep-arrow"})`}
                    opacity={0.85}
                  />
                );
              })}
            </svg>
          )}
          {groups.map((group) => (
            <div key={group.id ?? "none"}>
              <div className="flex h-8 border-b border-white/5 bg-slate-900/60">
                <div className={`${NAME_COL} sticky left-0 z-10 flex shrink-0 items-center border-r border-white/10 bg-slate-900 px-4 text-sm font-semibold ${group.color.text}`}>
                  {group.name}
                </div>
                <div className="flex-1" />
              </div>
              {group.tasks.map((t) => {
                const dated = t.start_date || t.due_date;
                const { from, to } = dated ? span(t) : { from: "", to: "" };
                const visible = dated && to >= start && from <= end;
                const left = visible ? Math.max(daysBetween(start, from), 0) * DAY : 0;
                const right = visible ? Math.min(daysBetween(start, to), days.length - 1) * DAY + DAY : 0;
                const status = STATUS_BY_ID[t.status];
                return (
                  <div key={t.id} className="group flex h-10 border-b border-white/5 hover:bg-white/[0.02]">
                    <button
                      type="button"
                      onClick={() => openTask(t.id)}
                      className={`${NAME_COL} sticky left-0 z-10 flex shrink-0 items-center gap-2 truncate border-r border-white/10 bg-slate-950 px-4 text-left text-sm hover:text-orange-300 ${
                        t.status === "done" ? "text-slate-500 line-through" : "text-slate-200"
                      }`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
                      <span className="truncate">{t.title}</span>
                      {flagged.has(t.id) && (
                        <span data-conflict className="ml-auto shrink-0 text-amber-400" title="Starts before a task it waits on is due">
                          ⚠
                        </span>
                      )}
                    </button>
                    <div className="relative flex-1">
                      {visible ? (
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`${t.title}: ${formatDate(from)} to ${formatDate(to)}. Drag to reschedule.`}
                          onKeyDown={(e) => e.key === "Enter" && openTask(t.id)}
                          onClick={() => {
                            if (moved.current) moved.current = false;
                            else openTask(t.id);
                          }}
                          onPointerDown={(e) => {
                            if (t.id.startsWith("temp-")) return;
                            e.currentTarget.setPointerCapture(e.pointerId);
                            const mode = (e.target as HTMLElement).dataset.handle ? "resize" : "move";
                            setDrag({ id: t.id, mode, startX: e.clientX, delta: 0 });
                          }}
                          onPointerMove={(e) => {
                            if (drag?.id !== t.id) return;
                            const delta = Math.round((e.clientX - drag.startX) / DAY);
                            if (delta !== drag.delta) setDrag({ ...drag, delta });
                          }}
                          onPointerUp={() => finish(t)}
                          onPointerCancel={() => setDrag(null)}
                          style={{ left: left + 2, width: Math.max(right - left - 4, DAY - 4) }}
                          className={`absolute top-1.5 flex h-7 cursor-grab touch-none select-none items-center gap-1.5 overflow-hidden rounded-md px-2 text-xs font-medium shadow active:cursor-grabbing ${status.pill} ${
                            drag?.id === t.id ? "ring-2 ring-white/70" : ""
                          }`}
                        >
                          {t.assignee && <Avatar name={t.assignee} />}
                          <span className="truncate">{t.title}</span>
                          <span data-handle="end" className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/20 opacity-0 group-hover:opacity-100" />
                        </div>
                      ) : dated ? (
                        <span className="absolute left-2 top-2.5 text-xs text-slate-600">
                          {from > end ? "Later →" : "← Earlier"}
                        </span>
                      ) : (
                        <span className="absolute left-2 top-2.5 text-xs text-slate-600">No dates</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          </div>
        </div>
      </div>
      {(milestones.length > 0 || dependencies.length > 0) && (
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-block h-2.5 w-2.5 rotate-45 bg-violet-400" /> Milestone
          {dependencies.length > 0 && (
            <>
              <span className="ml-3 inline-block h-0.5 w-5 bg-slate-400" /> Waits on
              <span className="ml-3 inline-block h-0.5 w-5 bg-amber-500" /> Date conflict
            </>
          )}
        </p>
      )}
    </div>
  );
}
