"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { deleteProject, updateProject } from "@/server/projects";
import { saveProjectAsTemplate } from "@/server/engineering";
import { useWorkspace } from "@/components/app/workspace-context";
import { ProjectExtrasProvider, type ProjectExtras } from "@/components/work/project-extras";
import ProjectLive from "@/components/work/project-live";
import TaskStore, { useTaskStore } from "@/components/work/task-store";
import { Icon, MenuItem, Popover, type IconName } from "@/components/work/ui";
import { useToday } from "@/lib/dates";
import { findConflicts } from "@/lib/dependencies";
import { FILTER_KEYS, applyFilters, filtersToQuery, isFiltering, parseFilters, type Filters } from "@/lib/filters";
import type { SavedView } from "@/lib/registers";
import type { Item, ProjectDocument, Project, Section, Task } from "@/lib/types";
import { COLOR_NAMES, colorOf } from "@/lib/work";
import FilterBar from "./filter-bar";
import BoardView from "./views/board-view";
import CalendarView from "./views/calendar-view";
import LogView from "./views/log-view";
import NotesView from "./views/notes-view";
import OverviewView from "./views/overview-view";
import ReviewsView from "./views/reviews-view";
import RfisView from "./views/rfis-view";
import ShareDialog from "./share-dialog";
import SubmittalsView from "./views/submittals-view";
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
  { id: "rfis", label: "RFIs", icon: "comment" },
  { id: "submittals", label: "Submittals", icon: "file" },
  { id: "reviews", label: "Milestones & Reviews", icon: "check" },
  { id: "notes", label: "AI Notes", icon: "sparkles" },
];

const TASK_VIEWS = ["table", "board", "calendar", "timeline"] as const;
type TaskViewId = (typeof TASK_VIEWS)[number];
const isTaskView = (v: ViewId): v is TaskViewId => (TASK_VIEWS as readonly string[]).includes(v);

/** The workspace's AI runs this month. */
export type Usage = { runsLeft: number; runsLimit: number };

export default function ProjectWorkspace(props: {
  project: Project;
  sections: Section[];
  tasks: Task[];
  logItems: Item[];
  notes: ProjectDocument[];
  usage: Usage;
  /** User IDs this project is shared with by name (how guests get access). */
  sharedWith: string[];
  initialView: ViewId;
  initialTaskId: string | null;
  /** Filters and sort from the address bar (?status=open&sort=due, for example). */
  initialQuery: string;
  /** ?rfi= or ?submittal= opens one. */
  initialRegisterId: string | null;
  extras: ProjectExtras;
}) {
  return (
    <ProjectExtrasProvider value={props.extras}>
      <TaskStore tasks={props.tasks} initialOpenId={props.initialTaskId}>
        <Workspace {...props} />
      </TaskStore>
    </ProjectExtrasProvider>
  );
}

function Workspace({
  project,
  sections,
  logItems,
  notes,
  usage,
  sharedWith,
  initialView,
  initialQuery,
  initialRegisterId,
  extras,
}: Parameters<typeof ProjectWorkspace>[0]) {
  const { tasks, add } = useTaskStore();
  const { canEdit } = useWorkspace();
  const today = useToday();
  const [view, setView] = useState<ViewId>(initialView);
  const [filters, setFiltersState] = useState<Filters>(() => parseFilters(new URLSearchParams(initialQuery)));
  const [openRfi, setOpenRfi] = useState<string | null>(initialView === "rfis" ? initialRegisterId : null);
  const [openSubmittal, setOpenSubmittal] = useState<string | null>(initialView === "submittals" ? initialRegisterId : null);
  const [rfiSeed, setRfiSeed] = useState<string | null>(null);

  /** Rewrites the address bar: the view, its filters, and an open RFI or submittal. */
  const syncUrl = useCallback((next: { view: ViewId; filters: Filters; register?: { key: "rfi" | "submittal"; id: string | null } }) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", next.view);
    for (const key of [...FILTER_KEYS, "task", "doc", "rfi", "submittal"]) url.searchParams.delete(key);
    if (isTaskView(next.view)) for (const [k, v] of new URLSearchParams(filtersToQuery(next.filters))) url.searchParams.set(k, v);
    if (next.register?.id) url.searchParams.set(next.register.key, next.register.id);
    window.history.replaceState(null, "", url);
  }, []);

  const switchView = (id: ViewId) => {
    setView(id);
    // Keep the view (and its filters) in the address bar so refresh and shared links land on it.
    syncUrl({ view: id, filters });
  };
  const setFilters = (f: Filters) => {
    setFiltersState(f);
    syncUrl({ view, filters: f });
  };
  const openSaved = (v: SavedView) => {
    const f = parseFilters(new URLSearchParams(v.query));
    setFiltersState(f);
    setView(v.view);
    syncUrl({ view: v.view, filters: f });
  };
  const showRfi = (id: string | null) => {
    setOpenRfi(id);
    setView("rfis");
    syncUrl({ view: "rfis", filters, register: { key: "rfi", id } });
  };
  const showSubmittal = (id: string | null) => {
    setOpenSubmittal(id);
    syncUrl({ view: "submittals", filters, register: { key: "submittal", id } });
  };
  const draftRfi = (passage: string) => {
    setRfiSeed(passage);
    setOpenRfi(null);
    switchView("rfis");
  };
  const clearSeed = useCallback(() => setRfiSeed(null), []);

  const owners = useMemo(
    () => [...new Set(tasks.map((t) => t.assignee).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b)),
    [tasks],
  );

  const visible = useMemo(() => applyFilters(tasks, filters, today), [tasks, filters, today]);
  const conflicts = useMemo(() => findConflicts(tasks, extras.dependencies), [tasks, extras.dependencies]);
  const conflictIds = useMemo(() => new Set(conflicts.map((c) => c.successor.id)), [conflicts]);

  const filtering = isFiltering(filters);
  const sorted = filters.sort !== "manual";
  const showToolbar = isTaskView(view);
  const counts: Partial<Record<ViewId, number>> = {
    log: logItems.length,
    rfis: extras.rfis.filter((r) => r.status === "open").length,
    submittals: extras.submittals.filter((s) => s.action === "pending").length,
  };

  return (
    <div className="flex flex-col gap-5">
      <ProjectHeader project={project} taskCount={tasks.length} sharedWith={sharedWith} />

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
              {!!counts[v.id] && <span className="rounded-full bg-white/5 px-1.5 text-xs text-slate-400">{counts[v.id]}</span>}
            </button>
          ))}
        </div>
      </div>

      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && <NewTaskButton onAdd={(title) => add(project.id, { title, section_id: sections[0]?.id ?? null })} />}
          <FilterBar
            projectId={project.id}
            filters={filters}
            onChange={setFilters}
            owners={owners}
            sections={sections}
            views={extras.views}
            view={view as TaskViewId}
            onOpenView={openSaved}
            shown={visible.length}
            total={tasks.length}
          />
        </div>
      )}

      {showToolbar && conflicts.length > 0 && (
        <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          ⚠ {conflicts.length === 1 ? "1 task starts" : `${conflicts.length} tasks start`} before a task {conflicts.length === 1 ? "it waits" : "they wait"} on is due:{" "}
          {conflicts
            .slice(0, 3)
            .map((c) => `${c.successor.title} (waits on ${c.predecessor.title})`)
            .join("; ")}
          {conflicts.length > 3 && "…"}
        </p>
      )}

      <div role="tabpanel">
        {view === "overview" && (
          <OverviewView project={project} sections={sections} tasks={tasks} logItems={logItems} usage={usage} sharedWith={sharedWith} onOpenView={switchView} />
        )}
        {view === "table" && <TableView project={project} sections={sections} tasks={visible} filtering={filtering} sorted={sorted} conflicts={conflictIds} />}
        {view === "board" && <BoardView project={project} sections={sections} tasks={visible} sorted={sorted} />}
        {view === "calendar" && <CalendarView project={project} sections={sections} tasks={visible} />}
        {view === "timeline" && <TimelineView project={project} sections={sections} tasks={visible} sorted={sorted} />}
        {view === "log" && <LogView projectId={project.id} items={logItems} rfis={extras.rfis} registers={extras.registers} onOpenRfi={showRfi} />}
        {view === "rfis" && (
          <RfisView
            projectId={project.id}
            rfis={extras.rfis}
            registers={extras.registers}
            openId={openRfi}
            onOpen={showRfi}
            seed={rfiSeed}
            onSeedUsed={clearSeed}
          />
        )}
        {view === "submittals" && (
          <SubmittalsView projectId={project.id} submittals={extras.submittals} registers={extras.registers} openId={openSubmittal} onOpen={showSubmittal} />
        )}
        {view === "reviews" && <ReviewsView projectId={project.id} milestones={extras.milestones} reviews={extras.reviews} comments={extras.reviewComments} />}
        {view === "notes" && (
          <NotesView
            projectId={project.id}
            usage={usage}
            notes={notes}
            items={[...tasks, ...logItems]}
            onSaved={() => switchView("table")}
            onDraftRfi={extras.registers && canEdit ? draftRfi : undefined}
          />
        )}
      </div>
    </div>
  );
}

function ProjectHeader({ project, taskCount, sharedWith }: { project: Project; taskCount: number; sharedWith: string[] }) {
  const { slug, canEdit, limits } = useWorkspace();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
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
      const result = await deleteProject(slug, project.id);
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
              onClick={canEdit ? toggle : undefined}
              aria-label={canEdit ? "Change project color" : undefined}
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
            readOnly={!canEdit}
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
        <ProjectLive projectId={project.id} />
        <ShareDialog projectId={project.id} projectName={project.name} sharedWith={sharedWith} managerId={project.manager_id} />
        {canEdit && <Popover
          align="right"
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} aria-label="Project options" className="mt-1 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
              <Icon name="dots" className="h-5 w-5" />
            </button>
          )}
        >
          {(close) => (
            <>
            {limits.features.workload && (
              <MenuItem
                onClick={() => {
                  close();
                  const templateName = prompt("Name the template (its sections and tasks are copied; dates become offsets):", project.name);
                  if (!templateName?.trim()) return;
                  startTransition(async () => {
                    const result = await saveProjectAsTemplate(project.id, { name: templateName.trim(), description: project.description });
                    setError(result.error);
                    if (!result.error) setNotice(`Saved "${templateName.trim()}" as a template. Pick it under New project → Template.`);
                  });
                }}
              >
                <Icon name="file" /> Save as template
              </MenuItem>
            )}
            <MenuItem
              danger
              onClick={() => {
                close();
                remove();
              }}
            >
              <Icon name="trash" /> {pending ? "Deleting…" : "Delete project"}
            </MenuItem>
            </>
          )}
        </Popover>}
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {notice}
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
