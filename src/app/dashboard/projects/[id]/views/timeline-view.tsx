"use client";

import { useRef, useState } from "react";
import { useTaskStore } from "@/components/work/task-store";
import { Avatar, Icon } from "@/components/work/ui";
import { formatDate, useToday } from "@/lib/dates";
import type { Project, Section, Task } from "@/lib/types";
import { STATUS_BY_ID, addDays, daysBetween, startOfWeek, weekdayShort } from "@/lib/work";
import { groupBySection } from "./table-view";

// Gantt-style timeline. Drag a bar to move a task; drag its right edge to
// change how long it runs.

const DAY = 30; // px per day
const WEEKS = 10;
const NAME_COL = "w-64";

type Drag = { id: string; mode: "move" | "resize"; startX: number; delta: number };

export default function TimelineView({ sections, tasks }: { project: Project; sections: Section[]; tasks: Task[] }) {
  const today = useToday();
  const { update, openTask } = useTaskStore();
  const [offsetWeeks, setOffsetWeeks] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const moved = useRef(false);

  if (!today) return <div className="h-96 animate-pulse rounded-xl bg-white/5" />;

  const start = addDays(startOfWeek(today), (offsetWeeks - 1) * 7);
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i));
  const end = days[days.length - 1];
  const groups = groupBySection(sections, tasks);
  const scheduled = tasks.filter((t) => t.start_date || t.due_date).length;

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

          {/* Today line */}
          {todayLeft >= 0 && todayLeft < days.length * DAY && (
            <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-orange-500/70" style={{ left: `calc(16rem + ${todayLeft + DAY / 2}px)` }} />
          )}

          {groups.map((group) => (
            <div key={group.id ?? "none"}>
              <div className="flex border-b border-white/5 bg-slate-900/60">
                <div className={`${NAME_COL} sticky left-0 z-10 shrink-0 border-r border-white/10 bg-slate-900 px-4 py-1.5 text-sm font-semibold ${group.color.text}`}>
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
  );
}
