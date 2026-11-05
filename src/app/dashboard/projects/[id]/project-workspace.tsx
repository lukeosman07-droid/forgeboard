"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createItem, deleteProject } from "@/app/dashboard/actions";
import { formatDate, useToday } from "@/lib/dates";
import type { Item, ItemType, Note, Project } from "@/lib/types";
import AiExtractPanel from "./ai-extract-panel";
import ItemForm from "./item-form";
import ItemRow from "./item-row";

type TabId = "actions" | "decisions" | "risks" | "notes";
type StatusFilter = "all" | "open" | "done";

const TABS: { id: TabId; label: string; types: ItemType[] }[] = [
  { id: "actions", label: "Action Items", types: ["action_item"] },
  { id: "decisions", label: "Decisions", types: ["decision"] },
  { id: "risks", label: "Risks & Questions", types: ["risk", "question"] },
  { id: "notes", label: "Notes", types: [] },
];

const EMPTY_TEXT: Record<Exclude<TabId, "notes">, string> = {
  actions: "No action items yet. Paste meeting notes above, or add one by hand.",
  decisions: "No decisions logged yet. Record what the team agreed on so nobody has to dig through old emails.",
  risks: "No risks or open questions yet. Track what could go wrong before it does.",
};

export type Usage = { paid: boolean; trialLeft: number };

export default function ProjectWorkspace({
  project,
  items,
  notes,
  usage,
}: {
  project: Project;
  items: Item[];
  notes: Note[];
  usage: Usage;
}) {
  const today = useToday();
  const [tab, setTab] = useState<TabId>("actions");
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>();
  const [deleting, startDelete] = useTransition();

  const current = TABS.find((t) => t.id === tab)!;
  const countFor = (t: (typeof TABS)[number]) =>
    t.id === "notes"
      ? notes.length
      : items.filter((i) => t.types.includes(i.type) && (t.id === "decisions" || i.status === "open")).length;

  const showFilter = tab === "actions" || tab === "risks";
  const visible = items
    .filter((i) => current.types.includes(i.type))
    .filter((i) => !showFilter || filter === "all" || i.status === filter)
    .sort(byStatusThenDueDate);

  const overdueCount = items.filter(
    (i) => i.type === "action_item" && i.status === "open" && i.due_date && today && i.due_date < today,
  ).length;

  const switchTab = (id: TabId) => {
    setTab(id);
    setAdding(false);
  };

  const removeProject = () => {
    if (!confirm(`Delete "${project.name}" and everything in it? This can't be undone.`)) return;
    startDelete(async () => {
      const result = await deleteProject(project.id);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white">
          ← All projects
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">{project.name}</h1>
            {project.description && <p className="mt-1 max-w-3xl text-slate-400">{project.description}</p>}
          </div>
          <button
            type="button"
            onClick={removeProject}
            disabled={deleting}
            className="self-start rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-red-500/10 hover:text-red-300"
          >
            {deleting ? "Deleting…" : "Delete project"}
          </button>
        </div>
        {overdueCount > 0 && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-300">
            ⚠ {overdueCount} overdue action item{overdueCount === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <AiExtractPanel
        projectId={project.id}
        usage={usage}
        startOpen={items.length === 0}
        onSaved={() => switchTab("actions")}
      />

      {error && (
        <p role="alert" className="flex justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
          <button type="button" onClick={() => setError(undefined)} aria-label="Dismiss" className="ml-3">
            ✕
          </button>
        </p>
      )}

      <section>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div role="tablist" aria-label="Project sections" className="flex min-w-max gap-1 border-b border-white/10">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => switchTab(t.id)}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  tab === t.id
                    ? "border-orange-500 text-white"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {t.label}
                <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">{countFor(t)}</span>
              </button>
            ))}
          </div>
        </div>

        <div role="tabpanel" className="mt-5">
          {tab === "notes" ? (
            <NotesList notes={notes} items={items} />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                {showFilter ? (
                  <div className="flex gap-1 rounded-lg border border-white/10 p-1" role="group" aria-label="Filter by status">
                    {(["open", "done", "all"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        aria-pressed={filter === f}
                        onClick={() => setFilter(f)}
                        className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                          filter === f ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {f === "done" ? (tab === "actions" ? "Done" : "Resolved") : f}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span />
                )}
                {!adding && (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/5"
                  >
                    + Add {tab === "actions" ? "action item" : tab === "decisions" ? "decision" : "risk or question"}
                  </button>
                )}
              </div>

              {adding && (
                <div className="mb-4">
                  <ItemForm
                    types={current.types}
                    submitLabel="Add"
                    onCancel={() => setAdding(false)}
                    onSubmit={async (input) => {
                      const result = await createItem(project.id, input);
                      if (!result.error) setAdding(false);
                      return result;
                    }}
                  />
                </div>
              )}

              {visible.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center text-slate-400">
                  {showFilter && filter !== "all" && items.some((i) => current.types.includes(i.type))
                    ? `Nothing ${filter === "open" ? "open" : "completed"} here.`
                    : EMPTY_TEXT[tab]}
                </div>
              ) : (
                <ul className="space-y-2">
                  {visible.map((item) => (
                    <ItemRow key={item.id} item={item} today={today} editTypes={current.types} onError={setError} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

// Open before done; earliest due date first; undated last.
function byStatusThenDueDate(a: Item, b: Item) {
  if (a.status !== b.status) return a.status === "open" ? -1 : 1;
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return a.created_at.localeCompare(b.created_at);
}

function NotesList({ notes, items }: { notes: Note[]; items: Item[] }) {
  if (notes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center text-slate-400">
        No notes yet. When you save an AI extraction, the original text is kept here for reference.
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {notes.map((note) => {
        const count = items.filter((i) => i.note_id === note.id).length;
        return (
          <li key={note.id} className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
            <p className="text-xs text-slate-500">
              {formatDate(note.created_at.slice(0, 10))} · {count} item{count === 1 ? "" : "s"} extracted
            </p>
            {note.summary && <p className="mt-2 text-slate-200">{note.summary}</p>}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-orange-400 hover:text-orange-300">Show original text</summary>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950/60 p-4 font-sans text-sm text-slate-300">
                {note.raw_text}
              </pre>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
