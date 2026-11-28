"use client";

import { useState, useTransition } from "react";
import { useWorkspace } from "@/components/app/workspace-context";
import { Icon, MenuItem, Popover } from "@/components/work/ui";
import { DEFAULT_FILTERS, DUE_LABELS, SORT_LABELS, isFiltering, parseFilters, type DueFilter, type Filters, type SortKey } from "@/lib/filters";
import type { SavedView } from "@/lib/registers";
import type { ItemStatus, Priority, Section } from "@/lib/types";
import { PRIORITIES, STATUSES } from "@/lib/work";
import { deleteView, saveView } from "@/server/engineering";

// Search, filters, sort and saved views for the task views. Everything here
// is mirrored in the address bar by the parent, so copying the URL shares it.

const control =
  "rounded-lg border border-white/10 bg-slate-900/60 px-2.5 py-1.5 text-sm text-slate-200 focus:border-orange-500/60 focus:outline-none [color-scheme:dark]";

type TaskView = "table" | "board" | "calendar" | "timeline";

export default function FilterBar({
  projectId,
  filters,
  onChange,
  owners,
  sections,
  views,
  view,
  onOpenView,
  shown,
  total,
}: {
  projectId: string;
  filters: Filters;
  onChange: (f: Filters) => void;
  owners: string[];
  sections: Section[];
  views: SavedView[];
  view: TaskView;
  onOpenView: (v: SavedView) => void;
  shown: number;
  total: number;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const toggle = <T extends string>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const activeCount = filters.status.length + filters.priority.length + (filters.section ? 1 : 0) + (filters.due ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative">
        <span className="sr-only">Search tasks</span>
        <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search tasks"
          className="w-44 rounded-lg border border-white/10 bg-slate-900/60 py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none sm:w-56"
        />
      </label>
      <select aria-label="Filter by owner" value={filters.owner} onChange={(e) => set({ owner: e.target.value })} className={control}>
        <option value="">All owners</option>
        {owners.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="__none">Unassigned</option>
      </select>

      <Popover
        trigger={({ toggle: open }) => (
          <button
            type="button"
            onClick={open}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
              activeCount ? "border-orange-500/50 bg-orange-500/10 text-orange-300" : "border-white/10 text-slate-300 hover:bg-white/5"
            }`}
          >
            <Icon name="filter" className="h-4 w-4" /> Filters{activeCount > 0 && ` · ${activeCount}`}
          </button>
        )}
      >
        {() => (
          <div className="w-72 space-y-3 p-2 text-sm">
            <fieldset>
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</legend>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <Chip key={s.id} on={filters.status.includes(s.id)} onClick={() => set({ status: toggle<ItemStatus>(filters.status, s.id) })}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Priority</legend>
              <div className="flex flex-wrap gap-1.5">
                {PRIORITIES.map((p) => (
                  <Chip key={p.id} on={filters.priority.includes(p.id)} onClick={() => set({ priority: toggle<Priority | "none">(filters.priority, p.id) })}>
                    {p.label}
                  </Chip>
                ))}
                <Chip on={filters.priority.includes("none")} onClick={() => set({ priority: toggle<Priority | "none">(filters.priority, "none") })}>
                  None
                </Chip>
              </div>
            </fieldset>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Due</span>
              <select aria-label="Filter by due date" value={filters.due} onChange={(e) => set({ due: e.target.value as DueFilter })} className={`${control} w-full`}>
                <option value="">Any time</option>
                {Object.entries(DUE_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {sections.length > 0 && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Section</span>
                <select aria-label="Filter by section" value={filters.section} onChange={(e) => set({ section: e.target.value })} className={`${control} w-full`}>
                  <option value="">All sections</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="__none">No section</option>
                </select>
              </label>
            )}
          </div>
        )}
      </Popover>

      <div className="flex items-center">
        <select
          aria-label="Sort by"
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value as SortKey })}
          className={`${control} ${filters.sort !== "manual" ? "rounded-r-none border-orange-500/50 text-orange-300" : ""}`}
        >
          {Object.entries(SORT_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {id === "manual" ? label : `Sort: ${label}`}
            </option>
          ))}
        </select>
        {filters.sort !== "manual" && (
          <button
            type="button"
            onClick={() => set({ desc: !filters.desc })}
            aria-label={filters.desc ? "Sort descending (click for ascending)" : "Sort ascending (click for descending)"}
            className="rounded-r-lg border border-l-0 border-orange-500/50 px-2 py-1.5 text-sm text-orange-300 hover:bg-white/5"
          >
            {filters.desc ? "↓" : "↑"}
          </button>
        )}
      </div>

      <button
        type="button"
        aria-pressed={filters.hideDone}
        onClick={() => set({ hideDone: !filters.hideDone })}
        className={`rounded-lg border px-3 py-1.5 text-sm ${
          filters.hideDone ? "border-orange-500/50 bg-orange-500/10 text-orange-300" : "border-white/10 text-slate-300 hover:bg-white/5"
        }`}
      >
        Hide done
      </button>

      <SavedViews projectId={projectId} views={views} view={view} onOpen={onOpenView} />

      {(isFiltering(filters) || filters.sort !== "manual") && (
        <button type="button" onClick={() => onChange(DEFAULT_FILTERS)} className="text-sm text-slate-400 hover:text-white">
          Clear · {shown} of {total}
        </button>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-orange-500/60 bg-orange-500/15 text-orange-200" : "border-white/10 text-slate-300 hover:bg-white/5"}`}
    >
      {children}
    </button>
  );
}

function SavedViews({
  projectId,
  views,
  view,
  onOpen,
}: {
  projectId: string;
  views: SavedView[];
  view: TaskView;
  onOpen: (v: SavedView) => void;
}) {
  const { canEdit, userId } = useWorkspace();
  const [name, setName] = useState("");
  const [shared, setShared] = useState(canEdit);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  return (
    <Popover
      align="right"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">
          Views{views.length > 0 && <span className="text-slate-500">· {views.length}</span>}
        </button>
      )}
    >
      {(close) => (
        <div className="w-80 p-1">
          {views.length > 0 ? (
            <ul className="max-h-64 overflow-y-auto">
              {views.map((v) => (
                <li key={v.id} className="flex items-center gap-1">
                  <MenuItem
                    onClick={() => {
                      close();
                      onOpen(v);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{v.name}</span>
                    <span className="shrink-0 text-xs capitalize text-slate-500">
                      {v.view}
                      {!v.shared && " · just you"}
                    </span>
                  </MenuItem>
                  {(v.created_by === userId || canEdit) && (
                    <button
                      type="button"
                      aria-label={`Delete view ${v.name}`}
                      onClick={() => {
                        if (confirm(`Delete the saved view "${v.name}"?`)) start(async () => setError((await deleteView(v.id)).error));
                      }}
                      className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-red-300"
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2.5 py-1.5 text-sm text-slate-500">No saved views yet. Set filters, then save them here.</p>
          )}
          <form
            className="mt-2 space-y-2 border-t border-white/10 px-1.5 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              const query = new URLSearchParams(window.location.search);
              query.delete("view");
              query.delete("task");
              start(async () => {
                const result = await saveView(projectId, { name, view, query: query.toString(), shared });
                setError(result.error);
                if (!result.error) setName("");
              });
            }}
          >
            <label className="block text-xs text-slate-400">
              Save the current {view} view
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="e.g. Overdue structural"
                aria-label="Saved view name"
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none"
              />
            </label>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" checked={shared} disabled={!canEdit} onChange={(e) => setShared(e.target.checked)} className="accent-orange-500" />
                Share with the project
              </label>
              <button type="submit" disabled={!name.trim() || pending} className="rounded-lg bg-orange-500 px-3 py-1 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-40">
                Save view
              </button>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  setError("Couldn't copy. Copy the address bar instead.");
                }
              }}
              className="text-xs text-slate-400 hover:text-white"
            >
              {copied ? "Link copied" : "Copy link to this view"}
            </button>
            {error && (
              <p role="alert" className="text-xs text-red-300">
                {error}
              </p>
            )}
          </form>
        </div>
      )}
    </Popover>
  );
}

/** Filters stored in a saved view's query string. */
export function filtersOf(v: SavedView): Filters {
  return parseFilters(new URLSearchParams(v.query));
}
