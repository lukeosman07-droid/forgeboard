"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  addComment,
  addSubtask,
  deleteComment,
  deleteSubtask,
  getTaskDetail,
  updateSubtask,
  type TaskDetail,
  type TaskPatch,
} from "@/app/dashboard/actions";
import { useToday } from "@/lib/dates";
import type { ItemComment, Subtask, Task } from "@/lib/types";
import { colorOf, isOverdue } from "@/lib/work";
import { Avatar, DateField, Icon, PriorityPicker, ProgressBar, StatusPicker } from "./ui";

// Right-side panel with everything about one task: fields, description,
// subtasks and an updates feed.
export default function TaskDrawer({
  taskId,
  task: listTask,
  onClose,
  onUpdate,
  onDelete,
}: {
  taskId: string;
  task?: Task;
  onClose: () => void;
  onUpdate: (patch: TaskPatch) => void;
  onDelete: () => void;
}) {
  const today = useToday();
  const [detail, setDetail] = useState<TaskDetail | "missing" | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [comments, setComments] = useState<ItemComment[]>([]);
  const [localPatch, setLocalPatch] = useState<Partial<Task>>({});
  const [error, setError] = useState<string>();

  useEffect(() => {
    let alive = true;
    getTaskDetail(taskId).then((d) => {
      if (!alive) return;
      setDetail(d ?? "missing");
      if (d) {
        setSubtasks(d.subtasks);
        setComments(d.comments);
      }
    });
    return () => {
      alive = false;
    };
  }, [taskId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loaded = detail && detail !== "missing" ? detail : null;
  // Prefer the page's live copy (it has optimistic edits); fall back to the fetched one.
  const base = listTask ?? loaded?.task;
  const task = base ? { ...base, ...localPatch } : undefined;

  const change = (patch: TaskPatch) => {
    setLocalPatch((p) => ({ ...p, ...(patch as Partial<Task>) }));
    onUpdate(patch);
  };

  async function run(result: Promise<{ error?: string }>) {
    const r = await result;
    if (r.error) setError(r.error);
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true" aria-label="Task details">
      <button type="button" aria-label="Close task" onClick={onClose} className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]" />
      <aside className="relative flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-slate-900 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          {loaded ? (
            <Link
              href={`/dashboard/projects/${loaded.project.id}`}
              className="flex min-w-0 items-center gap-2 text-sm text-slate-400 hover:text-white"
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${colorOf(loaded.project.color).dot}`} />
              <span className="truncate">{loaded.project.name}</span>
            </Link>
          ) : (
            <span className="h-4 w-32 animate-pulse rounded bg-white/5" />
          )}
          <div className="flex items-center gap-1">
            {task && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete "${task.title}"? This can't be undone.`)) onDelete();
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-300"
                aria-label="Delete task"
                title="Delete task"
              >
                <Icon name="trash" />
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        </header>

        {detail === "missing" ? (
          <p className="p-6 text-slate-400">This task no longer exists.</p>
        ) : !task ? (
          <div className="space-y-4 p-6" aria-label="Loading task">
            <div className="h-8 w-3/4 animate-pulse rounded bg-white/5" />
            <div className="h-40 animate-pulse rounded-xl bg-white/5" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-6 p-5">
              {error && (
                <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={() => change({ status: task.status === "done" ? "open" : "done" })}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  task.status === "done"
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-white/15 text-slate-200 hover:border-emerald-500/40 hover:text-emerald-300"
                }`}
              >
                <Icon name="check" />
                {task.status === "done" ? "Completed" : "Mark complete"}
              </button>

              <TitleField key={`t-${task.id}`} value={task.title} onSave={(title) => change({ title })} />

              <dl className="grid grid-cols-[7rem_1fr] items-center gap-x-4 gap-y-3 text-sm">
                <dt className="text-slate-400">Status</dt>
                <dd>
                  <StatusPicker status={task.status} onChange={(status) => change({ status })} />
                </dd>

                <dt className="text-slate-400">Owner</dt>
                <dd className="flex items-center gap-2">
                  <Avatar name={task.assignee} />
                  <BlurInput
                    key={`a-${task.id}`}
                    value={task.assignee ?? ""}
                    placeholder="Add owner"
                    ariaLabel="Owner"
                    onSave={(assignee) => change({ assignee: assignee || null })}
                    className="flex-1"
                  />
                </dd>

                <dt className="text-slate-400">Priority</dt>
                <dd>
                  <PriorityPicker priority={task.priority} onChange={(priority) => change({ priority })} />
                </dd>

                <dt className="text-slate-400">Start date</dt>
                <dd>
                  <DateField
                    label="Start date"
                    value={task.start_date}
                    today={today}
                    onChange={(start_date) => change({ start_date })}
                    className="w-fit rounded-md px-2 py-1 hover:bg-white/5"
                  />
                </dd>

                <dt className="text-slate-400">Due date</dt>
                <dd>
                  <DateField
                    label="Due date"
                    value={task.due_date}
                    today={today}
                    overdue={isOverdue(task, today)}
                    onChange={(due_date) => change({ due_date })}
                    className="w-fit rounded-md px-2 py-1 hover:bg-white/5"
                  />
                </dd>

                {loaded && loaded.sections.length > 0 && (
                  <>
                    <dt className="text-slate-400">Section</dt>
                    <dd>
                      <select
                        aria-label="Section"
                        value={task.section_id ?? ""}
                        onChange={(e) => change({ section_id: e.target.value || null })}
                        className="rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-slate-200 hover:border-white/10 focus:border-orange-500/60 focus:outline-none [color-scheme:dark]"
                      >
                        <option value="">No section</option>
                        {loaded.sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </dd>
                  </>
                )}
              </dl>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Description</h3>
                <BlurTextarea
                  key={`d-${task.id}`}
                  value={task.details ?? ""}
                  onSave={(details) => change({ details: details || null })}
                />
              </div>

              <Subtasks
                taskId={task.id}
                subtasks={subtasks}
                setSubtasks={setSubtasks}
                loading={!loaded}
                run={run}
              />

              <Updates comments={comments} setComments={setComments} taskId={task.id} loading={!loaded} run={run} />
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function TitleField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <textarea
      aria-label="Task name"
      value={text}
      rows={1}
      onChange={(e) => setText(e.target.value.replace(/\n/g, ""))}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
      onBlur={() => {
        const t = text.trim();
        if (t && t !== value) onSave(t);
        else setText(value);
      }}
      className="field-sizing-content w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1 -mx-2 text-2xl font-bold text-white hover:border-white/10 focus:border-orange-500/60 focus:outline-none"
    />
  );
}

function BlurInput({
  value,
  onSave,
  placeholder,
  ariaLabel,
  className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  return (
    <input
      aria-label={ariaLabel}
      value={text}
      placeholder={placeholder}
      maxLength={200}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      onBlur={() => text.trim() !== value && onSave(text.trim())}
      className={`rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-slate-200 placeholder:text-slate-500 hover:border-white/10 focus:border-orange-500/60 focus:outline-none ${className}`}
    />
  );
}

function BlurTextarea({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <textarea
      aria-label="Description"
      value={text}
      placeholder="Add more detail: what does done look like?"
      maxLength={5000}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== value.trim() && onSave(text.trim())}
      className="field-sizing-content mt-2 min-h-24 w-full resize-none rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm leading-relaxed text-slate-200 placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none"
    />
  );
}

function Subtasks({
  taskId,
  subtasks,
  setSubtasks,
  loading,
  run,
}: {
  taskId: string;
  subtasks: Subtask[];
  setSubtasks: React.Dispatch<React.SetStateAction<Subtask[]>>;
  loading: boolean;
  run: (p: Promise<{ error?: string }>) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const done = subtasks.filter((s) => s.done).length;

  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    const result = await addSubtask(taskId, title);
    if (result.subtask) setSubtasks((list) => [...list, result.subtask!]);
    else await run(Promise.resolve(result));
  };

  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Subtasks {subtasks.length > 0 && <span className="text-slate-400">· {done}/{subtasks.length}</span>}
        </h3>
      </div>
      {subtasks.length > 0 && <ProgressBar done={done} total={subtasks.length} className="mt-2" />}
      {loading ? (
        <div className="mt-3 h-8 animate-pulse rounded bg-white/5" />
      ) : (
        <ul className="mt-2 space-y-1">
          {subtasks.map((s) => (
            <li key={s.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/5">
              <input
                type="checkbox"
                checked={s.done}
                aria-label={`Mark "${s.title}" ${s.done ? "not done" : "done"}`}
                onChange={() => {
                  setSubtasks((list) => list.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)));
                  run(updateSubtask(s.id, { done: !s.done }));
                }}
                className="h-4 w-4 cursor-pointer accent-emerald-500"
              />
              <span className={`flex-1 text-sm ${s.done ? "text-slate-500 line-through" : "text-slate-200"}`}>{s.title}</span>
              <button
                type="button"
                aria-label={`Delete subtask "${s.title}"`}
                onClick={() => {
                  setSubtasks((list) => list.filter((x) => x.id !== s.id));
                  run(deleteSubtask(s.id));
                }}
                className="rounded p-1 text-slate-500 opacity-0 hover:text-red-300 group-hover:opacity-100 focus:opacity-100"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="mt-2 flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="+ Add a subtask"
          aria-label="New subtask"
          maxLength={300}
          className="flex-1 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none"
        />
        {draft.trim() && (
          <button type="submit" className="rounded-lg bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/15">
            Add
          </button>
        )}
      </form>
    </section>
  );
}

function Updates({
  comments,
  setComments,
  taskId,
  loading,
  run,
}: {
  comments: ItemComment[];
  setComments: React.Dispatch<React.SetStateAction<ItemComment[]>>;
  taskId: string;
  loading: boolean;
  run: (p: Promise<{ error?: string }>) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const post = async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    const result = await addComment(taskId, body);
    setPosting(false);
    if (result.comment) {
      setComments((list) => [...list, result.comment!]);
      setDraft("");
    } else await run(Promise.resolve(result));
  };

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Updates</h3>
      <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/40 focus-within:border-orange-500/60">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post();
          }}
          placeholder="Write an update…"
          aria-label="Write an update"
          maxLength={5000}
          rows={2}
          className="block w-full resize-none bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
        <div className="flex items-center justify-between border-t border-white/5 px-3 py-1.5">
          <span className="text-[11px] text-slate-500">Ctrl + Enter to post</span>
          <button
            type="button"
            onClick={post}
            disabled={!draft.trim() || posting}
            className="rounded-md bg-orange-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-40"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
      {loading ? (
        <div className="mt-3 h-12 animate-pulse rounded bg-white/5" />
      ) : comments.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No updates yet. Post progress, questions or links here.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {[...comments].reverse().map((c) => (
            <li key={c.id} className="group rounded-xl border border-white/5 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{new Date(c.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <button
                  type="button"
                  onClick={() => {
                    setComments((list) => list.filter((x) => x.id !== c.id));
                    run(deleteComment(c.id));
                  }}
                  className="opacity-0 hover:text-red-300 group-hover:opacity-100 focus:opacity-100"
                >
                  Delete
                </button>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
