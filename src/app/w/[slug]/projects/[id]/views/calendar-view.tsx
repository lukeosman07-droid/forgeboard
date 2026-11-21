"use client";

import { useState } from "react";
import { useTaskStore } from "@/components/work/task-store";
import { Icon } from "@/components/work/ui";
import { useToday } from "@/lib/dates";
import type { Project, Section, Task } from "@/lib/types";
import { STATUS_BY_ID, addDays, daysBetween, isOverdue, monthLabel, startOfWeek } from "@/lib/work";

// Month calendar of due dates. Drag a task to another day (or drag an
// unscheduled task onto the calendar) to reschedule it.

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarView({ project, sections, tasks }: { project: Project; sections: Section[]; tasks: Task[] }) {
  const today = useToday();
  const { update, add, openTask } = useTaskStore();
  const [month, setMonth] = useState<string | null>(null); // YYYY-MM-01
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (!today) return <div className="h-[36rem] animate-pulse rounded-xl bg-white/5" />;

  const first = month ?? `${today.slice(0, 7)}-01`;
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const shiftMonth = (delta: number) => {
    const d = new Date(`${first}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + delta);
    setMonth(d.toISOString().slice(0, 10));
  };

  const byDay = new Map<string, Task[]>();
  for (const t of tasks) if (t.due_date) byDay.set(t.due_date, [...(byDay.get(t.due_date) ?? []), t]);
  const unscheduled = tasks.filter((t) => !t.due_date && t.status !== "done");

  const reschedule = (day: string) => {
    const task = tasks.find((t) => t.id === dragId);
    setDragId(null);
    setOverDay(null);
    if (!task || task.due_date === day) return;
    // Keep the task's length: move the start date by the same number of days.
    const start =
      task.start_date && task.due_date ? addDays(task.start_date, daysBetween(task.due_date, day)) : task.start_date && task.start_date > day ? day : task.start_date;
    update(task.id, { due_date: day, start_date: start });
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="mr-2 text-lg font-semibold text-white">{monthLabel(first)}</h2>
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/5">
            <Icon name="chevron" className="h-4 w-4 rotate-180" />
          </button>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/5">
            <Icon name="chevron" className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setMonth(null)} className="rounded-lg border border-white/10 px-3 py-1 text-sm text-slate-300 hover:bg-white/5">
            Today
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <div className="grid min-w-[700px] grid-cols-7">
            {WEEKDAYS.map((d) => (
              <div key={d} className="border-b border-white/10 bg-slate-900/80 py-2 text-center text-xs font-medium text-slate-400">
                {d}
              </div>
            ))}
            {days.map((day) => {
              const inMonth = day.slice(0, 7) === first.slice(0, 7);
              const isToday = day === today;
              const dayTasks = byDay.get(day) ?? [];
              return (
                <div
                  key={day}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    setOverDay(day);
                  }}
                  onDragLeave={() => setOverDay((d) => (d === day ? null : d))}
                  onDrop={(e) => {
                    e.preventDefault();
                    reschedule(day);
                  }}
                  className={`group min-h-28 border-b border-r border-white/5 p-1.5 transition [&:nth-child(7n)]:border-r-0 ${
                    inMonth ? "bg-slate-950/40" : "bg-slate-950/80"
                  } ${overDay === day ? "bg-orange-500/10 ring-2 ring-inset ring-orange-500/50" : ""}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs ${
                        isToday ? "bg-orange-500 font-bold text-slate-950" : inMonth ? "text-slate-300" : "text-slate-600"
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingDay(day);
                        setDraft("");
                      }}
                      aria-label={`Add task due ${day}`}
                      className="rounded p-0.5 text-slate-500 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100 focus:opacity-100"
                    >
                      <Icon name="plus" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {dayTasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        draggable={!t.id.startsWith("temp-")}
                        onDragStart={() => setDragId(t.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverDay(null);
                        }}
                        onClick={() => openTask(t.id)}
                        title={t.title}
                        className={`flex w-full cursor-grab items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-left text-xs ${
                          isOverdue(t, today) ? "bg-red-500/15 text-red-200" : "bg-white/5 text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_BY_ID[t.status].dot}`} />
                        <span className={`truncate ${t.status === "done" ? "text-slate-500 line-through" : ""}`}>{t.title}</span>
                      </button>
                    ))}
                    {addingDay === day && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (draft.trim()) add(project.id, { title: draft.trim(), due_date: day, section_id: sections[0]?.id ?? null });
                          setAddingDay(null);
                        }}
                      >
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => !draft.trim() && setAddingDay(null)}
                          onKeyDown={(e) => e.key === "Escape" && setAddingDay(null)}
                          placeholder="Task name"
                          aria-label="New task name"
                          maxLength={500}
                          className="w-full rounded-md border border-orange-500/50 bg-slate-950 px-1.5 py-1 text-xs text-white focus:outline-none"
                        />
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <aside className="lg:w-64">
        <h3 className="mb-2 text-sm font-semibold text-white">
          Unscheduled <span className="font-normal text-slate-500">({unscheduled.length})</span>
        </h3>
        <p className="mb-3 text-xs text-slate-500">Drag a task onto a day to give it a due date.</p>
        <div className="space-y-1.5">
          {unscheduled.length === 0 && <p className="text-sm text-slate-500">Every open task has a date.</p>}
          {unscheduled.map((t) => (
            <button
              key={t.id}
              type="button"
              draggable={!t.id.startsWith("temp-")}
              onDragStart={() => setDragId(t.id)}
              onDragEnd={() => setDragId(null)}
              onClick={() => openTask(t.id)}
              className="flex w-full cursor-grab items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-2.5 py-2 text-left text-sm text-slate-200 hover:border-white/25"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_BY_ID[t.status].dot}`} />
              <span className="truncate">{t.title}</span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
