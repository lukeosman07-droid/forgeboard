"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteProject, updateProject } from "@/app/dashboard/actions";
import TaskStore, { useTaskStore } from "@/components/work/task-store";
import { Icon, MenuItem, Popover, type IconName } from "@/components/work/ui";
import type { Item, Note, Project, Section, Task } from "@/lib/types";
import { COLOR_NAMES, colorOf } from "@/lib/work";
import BoardView from "./views/board-view";
import CalendarView from "./views/calendar-view";
import LogView from "./views/log-view";
import NotesView from "./views/notes-view";
import OverviewView from "./views/overview-view";
import TableView from "./views/table-view";
import TimelineView from "./views/timeline-view";

import type { ViewId } from "./view-ids";

export type { ViewId };

const VIEWS: { id: ViewId; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "chart" },
  { id: "table", label: "Table", icon: "table" },
  { id: "board", label: "Board", icon: "board" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "timeline", label: "Timeline", icon: "timeline" },
  { id: "log", label: "Decisions & Risks", icon: "log" },
  { id: "notes", label: "AI Notes", icon: "sparkles" },
];

export type Usage = { paid: boolean; trialLeft: number };

export type Filters = { search: string; owner: string; hideDone: boolean };

export default function ProjectWorkspace(props: {
  project: Project;
  sections: Section[];
  tasks: Task[];
  logItems: Item[];
  notes: Note[];
  usage: Usage;
  initialView: ViewId;
  initialTaskId: string | null;
}) {
  return (
    <TaskStore tasks={props.tasks} initialOpenId={props.initialTaskId}>
      <Workspace {...props} />
    </TaskStore>
  );
}

function Workspace({
  project,
  sections,
  logItems,
  notes,
  usage,
  initialView,
}: Parameters<typeof ProjectWorkspace>[0]) {
  const { tasks, add } = useTaskStore();
  const [view, setView] = useState<ViewId>(initialView);
  const [filters, setFilters] = useState<Filters>({ search: "", owner: "", hideDone: false });

  const switchView = (id: ViewId) => {
    setView(id);
    // Keep the view in the address bar so refresh and shared links land on it.
    const url = new URL(window.location.href);
    url.searchParams.set("view", id);
    url.searchParams.delete("task");
    window.history.replaceState(null, "", url);
  };

  const owners = useMemo(
    () => [...new Set(tasks.map((t) => t.assignee).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b)),
    [tasks],
  );

  const visible = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (!q || t.title.toLowerCase().includes(q) || t.assignee?.toLowerCase().includes(q)) &&
        (!filters.owner || (filters.owner === "__none" ? !t.assignee : t.assignee === filters.owner)) &&
        (!filters.hideDone || t.status !== "done"),
    );
  }, [tasks, filters]);

  const filtering = !!(filters.search || filters.owner || filters.hideDone);
  const showToolbar = view === "table" || view === "board" || view === "calendar" || view === "timeline";

  return (
    <div className="flex flex-col gap-5">
      <ProjectHeader project={project} taskCount={tasks.length} />

      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-8 sm:px-8">
        <div role="tablist" aria-label="Project views" className="flex min-w-max gap-1 border-b border-white/10">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => switchView(v.id)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                view === v.id ? "border-orange-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon name={v.icon} />
              {v.label}
              {v.id === "log" && logItems.length > 0 && (
                <span className="rounded-full bg-white/5 px-1.5 text-xs text-slate-400">{logItems.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          <NewTaskButton onAdd={(title) => add(project.id, { title, section_id: sections[0]?.id ?? null })} />
          <label className="relative">
            <span className="sr-only">Search tasks</span>
            <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search tasks"
              className="w-44 rounded-lg border border-white/10 bg-slate-900/60 py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none sm:w-56"
            />
          </label>
          <select
            aria-label="Filter by owner"
            value={filters.owner}
            onChange={(e) => setFilters((f) => ({ ...f, owner: e.target.value }))}
            className="rounded-lg border border-white/10 bg-slate-900/60 px-2.5 py-1.5 text-sm text-slate-200 focus:border-orange-500/60 focus:outline-none [color-scheme:dark]"
          >
            <option value="">All owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            <option value="__none">Unassigned</option>
          </select>
          <button
            type="button"
            aria-pressed={filters.hideDone}
            onClick={() => setFilters((f) => ({ ...f, hideDone: !f.hideDone }))}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              filters.hideDone ? "border-orange-500/50 bg-orange-500/10 text-orange-300" : "border-white/10 text-slate-300 hover:bg-white/5"
            }`}
          >
            Hide done
          </button>
          {filtering && (
            <button
              type="button"
              onClick={() => setFilters({ search: "", owner: "", hideDone: false })}
              className="text-sm text-slate-400 hover:text-white"
            >
              Clear · {visible.length} of {tasks.length}
            </button>
          )}
        </div>
      )}

      <div role="tabpanel">
        {view === "overview" && (
          <OverviewView project={project} tasks={tasks} logItems={logItems} usage={usage} onOpenView={switchView} />
        )}
        {view === "table" && <TableView project={project} sections={sections} tasks={visible} filtering={filtering} />}
        {view === "board" && <BoardView project={project} sections={sections} tasks={visible} />}
        {view === "calendar" && <CalendarView project={project} sections={sections} tasks={visible} />}
        {view === "timeline" && <TimelineView project={project} sections={sections} tasks={visible} />}
        {view === "log" && <LogView projectId={project.id} items={logItems} />}
        {view === "notes" && (
          <NotesView projectId={project.id} usage={usage} notes={notes} items={[...tasks, ...logItems]} onSaved={() => switchView("table")} />
        )}
      </div>
    </div>
  );
}

function ProjectHeader({ project, taskCount }: { project: Project; taskCount: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [name, setName] = useState(project.name);
  const color = colorOf(project.color);

  const save = (patch: Parameters<typeof updateProject>[1]) =>
    startTransition(async () => {
      const result = await updateProject(project.id, patch);
      if (result.error) setError(result.error);
    });

  const remove = () => {
    if (!confirm(`Delete "${project.name}" and all ${taskCount} tasks in it? This can't be undone.`)) return;
    startTransition(async () => {
      const result = await deleteProject(project.id);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <Popover
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-label="Change project color"
              className={`mt-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${color.dot} text-sm font-bold text-slate-950`}
            >
              {project.name.slice(0, 1).toUpperCase()}
            </button>
          )}
        >
          {(close) => (
            <div className="grid grid-cols-4 gap-2 p-1">
              {COLOR_NAMES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => {
                    close();
                    save({ color: c });
                  }}
                  className={`h-7 w-7 rounded-md ${colorOf(c).dot} ${c === project.color ? "ring-2 ring-white" : ""}`}
                />
              ))}
            </div>
          )}
        </Popover>
        <div className="min-w-0 flex-1">
          <input
            aria-label="Project name"
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            onBlur={() => {
              const n = name.trim();
              if (n && n !== project.name) save({ name: n });
              else setName(project.name);
            }}
            className="w-full truncate rounded-lg border border-transparent bg-transparent px-1 -mx-1 text-2xl font-bold tracking-tight text-white hover:border-white/10 focus:border-orange-500/60 focus:outline-none sm:text-3xl"
          />
          {project.description && <p className="mt-0.5 max-w-3xl text-sm text-slate-400">{project.description}</p>}
        </div>
        <Popover
          align="right"
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} aria-label="Project options" className="mt-1 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
              <Icon name="dots" className="h-5 w-5" />
            </button>
          )}
        >
          {(close) => (
            <MenuItem
              danger
              onClick={() => {
                close();
                remove();
              }}
            >
              <Icon name="trash" /> {pending ? "Deleting…" : "Delete project"}
            </MenuItem>
          )}
        </Popover>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

function NewTaskButton({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState("");
  return (
    <Popover
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-orange-400"
        >
          <Icon name="plus" /> New task
        </button>
      )}
    >
      {(close) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            onAdd(title.trim());
            setTitle("");
            close();
          }}
          className="flex w-72 gap-2 p-1"
        >
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task name"
            aria-label="New task name"
            maxLength={500}
            className="flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none"
          />
          <button type="submit" className="rounded-lg bg-orange-500 px-3 text-sm font-semibold text-slate-950 hover:bg-orange-400">
            Add
          </button>
        </form>
      )}
    </Popover>
  );
}
