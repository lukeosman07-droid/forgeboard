"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ItemInput } from "@/server/schemas";
import { saveExtraction } from "@/server/tasks";
import { documentFromUpload } from "@/server/files";
import type { Extraction } from "@/lib/ai/schema";
import { DUPLICATE_THRESHOLD, findSimilarTask, similarity } from "@/lib/capture";
import { localToday } from "@/lib/dates";
import { CAPTURE_ACCEPT, canCapture } from "@/lib/files";
import { displayName, matchPerson } from "@/lib/people";
import { usePeople, useWorkspacePath } from "@/components/app/workspace-context";
import { MAX_NOTES_CHARS } from "@/lib/plans";
import { SAMPLE_NOTES } from "@/lib/sample-notes";
import type { Task } from "@/lib/types";
import { uploadFile } from "@/lib/upload";
import InboxSource from "./inbox-source";
import type { Usage } from "./project-workspace";

type Level = "high" | "medium" | "low";
type Source = "paste" | "file" | "inbox";

type Where = { source_quote: string; source_page: number | null };

// Editable copies of what the AI returned, each with a "keep" checkbox.
type Review = {
  summary: string;
  /** What the items came from: pasted text, or a document (a file or an email). */
  from: { text: string } | { documentId: string; title: string };
  actions: ({ checked: boolean; title: string; assignee: string; due_date: string; priority: Level } & Where)[];
  decisions: ({ checked: boolean; title: string; details: string } & Where)[];
  risks: ({ checked: boolean; title: string; details: string; severity: Level } & Where)[];
  questions: ({ checked: boolean; question: string } & Where)[];
};

type Failure = { message: string; upgrade?: boolean };

const LOADING_STEPS = [
  "Reading your notes…",
  "Finding action items and owners…",
  "Picking out decisions…",
  "Spotting risks and open questions…",
  "Organizing everything…",
];

const fieldClass =
  "w-full rounded-md border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30";

const tabClass = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium ${on ? "bg-orange-500/15 text-orange-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`;

export default function AiExtractPanel({
  projectId,
  usage,
  startOpen,
  onSaved,
  tasks,
  fileAi,
}: {
  projectId: string;
  usage: Usage;
  startOpen: boolean;
  onSaved: () => void;
  /** The project's tasks, to warn about ones that already exist. */
  tasks: Pick<Task, "id" | "title" | "status">[];
  /** The plan includes reading files and email. */
  fileAi: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [source, setSource] = useState<Source>("paste");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure>();
  const [review, setReview] = useState<Review>();
  const [runsLeft, setRunsLeft] = useState(usage.runsLeft);
  const path = useWorkspacePath();
  const { people } = usePeople();
  const [savedMessage, setSavedMessage] = useState<string>();
  const [saving, startSaving] = useTransition();

  const tooLong = text.length > MAX_NOTES_CHARS;
  const outOfRuns = runsLeft <= 0;

  async function extract(body: { text: string } | { documentId: string }, from: Review["from"]) {
    setFailure(undefined);
    setSavedMessage(undefined);
    setLoading("extract");
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...body, today: localToday() }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (result.code === "ai_limit") setRunsLeft(0);
        setFailure({
          message: result.error ?? "Something went wrong. Please try again.",
          upgrade: result.code === "ai_limit" || result.code === "read_only" || result.code === "plan",
        });
        return;
      }
      if (typeof result.runsLeft === "number") setRunsLeft(result.runsLeft);
      setReview(toReview(result.extraction as Extraction, from, tasks));
    } catch {
      setFailure({ message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setLoading(null);
    }
  }

  async function captureFile(file: File) {
    setFailure(undefined);
    setSavedMessage(undefined);
    if (!canCapture(file.name)) {
      setFailure({ message: "The AI can read PDF, Word (DOCX), email (EML) and text or transcript (TXT, VTT, SRT) files." });
      return;
    }
    setLoading("upload");
    const uploaded = await uploadFile(file, { projectId });
    if (!uploaded.attachment) {
      setLoading(null);
      setFailure({ message: uploaded.error ?? "Couldn't upload the file." });
      return;
    }
    setLoading("read");
    const doc = await documentFromUpload(uploaded.attachment.id);
    if (!doc.document) {
      setLoading(null);
      setFailure({ message: doc.error ?? "Couldn't read the file." });
      return;
    }
    await extract({ documentId: doc.document.id }, { documentId: doc.document.id, title: doc.document.title });
  }

  function save() {
    if (!review) return;
    const items = fromReview(review, people);
    if (items.length === 0) {
      setFailure({ message: "Select at least one item to save." });
      return;
    }
    setFailure(undefined);
    startSaving(async () => {
      const result = await saveExtraction({
        projectId,
        ...("text" in review.from ? { rawText: review.from.text } : { documentId: review.from.documentId }),
        summary: review.summary,
        items,
      });
      if (result.error) {
        setFailure({ message: result.error });
        return;
      }
      setReview(undefined);
      setText("");
      setSavedMessage(`Saved ${items.length} item${items.length === 1 ? "" : "s"} to this project.`);
      onSaved();
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-orange-500/30 bg-gradient-to-b from-orange-500/[0.07] to-slate-900/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-orange-500 text-xs font-bold text-slate-950">AI</span>
          <span>
            <span className="block font-semibold text-white">AI Capture</span>
            <span className="block text-sm text-slate-400">Turn notes, files and emails into action items, decisions, and risks.</span>
          </span>
        </span>
        <span className="flex items-center gap-3">
          <UsageBadge runsLeft={runsLeft} runsLimit={usage.runsLimit} />
          <span className="text-slate-400" aria-hidden>
            {open ? "▲" : "▼"}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-white/10 px-6 py-5">
          {savedMessage && (
            <p role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              ✓ {savedMessage}
            </p>
          )}
          {failure && (
            <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {failure.message}
              {failure.upgrade && (
                <Link href={path("/billing")} className="ml-2 font-semibold text-orange-300 underline hover:text-orange-200">
                  See plans →
                </Link>
              )}
            </div>
          )}

          {review ? (
            <ReviewScreen
              review={review}
              setReview={setReview}
              saving={saving}
              onSave={save}
              onDiscard={() => setReview(undefined)}
              tasks={tasks}
              people={people}
            />
          ) : loading ? (
            <LoadingState step={loading} />
          ) : outOfRuns ? (
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-6 text-center">
              <p className="font-semibold text-white">This workspace has used all {usage.runsLimit.toLocaleString()} AI runs for this month</p>
              <p className="mt-1 text-sm text-slate-400">
                Upgrade for more, or wait until the 1st when the count resets. You can still add items by hand.
              </p>
              <Link
                href={path("/billing")}
                className="mt-4 inline-block rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-orange-400"
              >
                See plans
              </Link>
            </div>
          ) : (
            <div>
              <div role="tablist" aria-label="Capture from" className="mb-4 flex flex-wrap gap-1">
                {(
                  [
                    ["paste", "Paste text"],
                    ["file", "From a file"],
                    ["inbox", "Project inbox"],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={source === id} onClick={() => setSource(id)} className={tabClass(source === id)}>
                    {label}
                  </button>
                ))}
              </div>

              {source === "paste" && (
                <div>
                  <label htmlFor="notes-input" className="sr-only">
                    Notes to extract from
                  </label>
                  <textarea
                    id="notes-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={10}
                    placeholder="Paste meeting notes, an email thread, a transcript, or a spec document."
                    className="block w-full resize-y rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm leading-relaxed text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setText(SAMPLE_NOTES)}
                        className="rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-white hover:bg-white/5"
                      >
                        Try sample notes
                      </button>
                      <span className={`text-xs tabular-nums ${tooLong ? "font-semibold text-red-300" : "text-slate-500"}`}>
                        {text.length.toLocaleString()} / {MAX_NOTES_CHARS.toLocaleString()}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void extract({ text }, { text })}
                      disabled={!text.trim() || tooLong}
                      className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                    >
                      ✨ Extract with AI
                    </button>
                  </div>
                  {tooLong && <p className="mt-2 text-xs text-red-300">That&apos;s over the limit. Split it into smaller parts.</p>}
                </div>
              )}

              {source !== "paste" && !fileAi && (
                <div className="rounded-xl border border-white/10 bg-slate-950/40 p-6 text-center">
                  <p className="font-semibold text-white">Reading files and email with AI is on the Team and Business plans</p>
                  <p className="mt-1 text-sm text-slate-400">Pasting notes works on every plan.</p>
                  <Link href={path("/billing")} className="mt-4 inline-block rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-orange-400">
                    See plans
                  </Link>
                </div>
              )}

              {source === "file" && fileAi && <FileDrop onFile={(file) => void captureFile(file)} />}

              {source === "inbox" && fileAi && (
                <InboxSource projectId={projectId} onPick={(doc) => void extract({ documentId: doc.id }, { documentId: doc.id, title: doc.title ?? "Email" })} />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FileDrop({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={`flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
        over ? "border-orange-500/70 bg-orange-500/10" : "border-white/15 bg-slate-950/40"
      }`}
    >
      <p className="font-medium text-white">Drop a file here</p>
      <p className="mt-1 text-sm text-slate-400">PDF meeting minutes, Word documents, emails (.eml) or transcripts (.txt, .vtt, .srt). Up to 25 MB.</p>
      <button type="button" onClick={() => input.current?.click()} className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-orange-400">
        Choose a file
      </button>
      <input
        ref={input}
        type="file"
        accept={CAPTURE_ACCEPT}
        className="hidden"
        aria-label="Choose a file to capture"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <p className="mt-3 text-xs text-slate-500">The file is kept with the project, and every item links back to the page it came from.</p>
    </div>
  );
}

function UsageBadge({ runsLeft, runsLimit }: { runsLeft: number; runsLimit: number }) {
  return (
    <span
      className={`hidden rounded-full px-2.5 py-1 text-xs sm:inline ${runsLeft > 0 ? "bg-white/5 text-slate-300" : "bg-red-500/10 text-red-300"}`}
    >
      {runsLeft.toLocaleString()} of {runsLimit.toLocaleString()} AI runs left
    </span>
  );
}

function LoadingState({ step: phase }: { step: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const step =
    phase === "upload"
      ? "Uploading the file…"
      : phase === "read"
        ? "Reading the file…"
        : LOADING_STEPS[Math.min(Math.floor(seconds / 6), LOADING_STEPS.length - 1)];

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-12 text-center">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-orange-500/20 border-t-orange-500" aria-hidden />
      <div>
        <p className="font-medium text-white">{step}</p>
        <p className="mt-1 text-sm text-slate-500">Usually 15–45 seconds; long documents take a few minutes · {seconds}s</p>
      </div>
    </div>
  );
}

type People = ReturnType<typeof usePeople>["people"];

function ReviewScreen({
  review,
  setReview,
  saving,
  onSave,
  onDiscard,
  tasks,
  people,
}: {
  review: Review;
  setReview: (r: Review) => void;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  tasks: Pick<Task, "id" | "title" | "status">[];
  people: People;
}) {
  // Small helper to update one field of one row in one group.
  function edit<K extends "actions" | "decisions" | "risks" | "questions">(group: K, index: number, patch: Partial<Review[K][number]>) {
    const rows = review[group].map((row, i) => (i === index ? { ...row, ...patch } : row));
    setReview({ ...review, [group]: rows });
  }
  const selected =
    [...review.actions, ...review.decisions, ...review.risks, ...review.questions].filter((r) => r.checked).length;

  return (
    <div className="space-y-6">
      {"title" in review.from && (
        <p className="text-sm text-slate-400">
          From <span className="font-medium text-slate-200">{review.from.title}</span>
        </p>
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">Summary</p>
        <textarea
          value={review.summary}
          onChange={(e) => setReview({ ...review, summary: e.target.value })}
          rows={3}
          aria-label="Summary"
          className={`${fieldClass} mt-2`}
        />
      </div>

      <Group title="Action items" count={review.actions.length}>
        {review.actions.map((a, i) => {
          const similar = findSimilarTask(a.title, tasks);
          const member = matchPerson(a.assignee, people);
          return (
            <ReviewRow key={i} checked={a.checked} onCheck={(checked) => edit("actions", i, { checked })} where={a}>
              {similar && (
                <p className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-300" role="note">
                  Similar to existing task: “{similar.title}”
                </p>
              )}
              <input aria-label="Title" value={a.title} onChange={(e) => edit("actions", i, { title: e.target.value })} className={fieldClass} />
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <input
                    aria-label="Assignee"
                    value={a.assignee}
                    onChange={(e) => edit("actions", i, { assignee: e.target.value })}
                    placeholder="Unassigned"
                    className={fieldClass}
                  />
                  {a.assignee.trim() && (
                    <p className={`mt-1 text-xs ${member ? "text-emerald-300" : "text-slate-500"}`}>
                      {member ? `→ ${displayName(member)}` : "Not a member; kept as a name"}
                    </p>
                  )}
                </div>
                <input
                  aria-label="Due date"
                  type="date"
                  value={a.due_date}
                  onChange={(e) => edit("actions", i, { due_date: e.target.value })}
                  className={`${fieldClass} [color-scheme:dark]`}
                />
                <LevelSelect label="Priority" value={a.priority} onChange={(priority) => edit("actions", i, { priority })} />
              </div>
            </ReviewRow>
          );
        })}
      </Group>

      <Group title="Decisions" count={review.decisions.length}>
        {review.decisions.map((d, i) => (
          <ReviewRow key={i} checked={d.checked} onCheck={(checked) => edit("decisions", i, { checked })} where={d}>
            <input aria-label="Decision" value={d.title} onChange={(e) => edit("decisions", i, { title: e.target.value })} className={fieldClass} />
            <textarea aria-label="Details" value={d.details} rows={2} onChange={(e) => edit("decisions", i, { details: e.target.value })} className={fieldClass} />
          </ReviewRow>
        ))}
      </Group>

      <Group title="Risks" count={review.risks.length}>
        {review.risks.map((r, i) => (
          <ReviewRow key={i} checked={r.checked} onCheck={(checked) => edit("risks", i, { checked })} where={r}>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input aria-label="Risk" value={r.title} onChange={(e) => edit("risks", i, { title: e.target.value })} className={fieldClass} />
              <LevelSelect label="Severity" value={r.severity} onChange={(severity) => edit("risks", i, { severity })} />
            </div>
            <textarea aria-label="Details" value={r.details} rows={2} onChange={(e) => edit("risks", i, { details: e.target.value })} className={fieldClass} />
          </ReviewRow>
        ))}
      </Group>

      <Group title="Open questions" count={review.questions.length}>
        {review.questions.map((q, i) => (
          <ReviewRow key={i} checked={q.checked} onCheck={(checked) => edit("questions", i, { checked })} where={q}>
            <input aria-label="Question" value={q.question} onChange={(e) => edit("questions", i, { question: e.target.value })} className={fieldClass} />
          </ReviewRow>
        ))}
      </Group>

      <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-slate-900/95 px-6 py-4 backdrop-blur">
        <span className="text-sm text-slate-400">{selected} selected</span>
        <div className="flex gap-2">
          <button type="button" onClick={onDiscard} disabled={saving} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || selected === 0}
            className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save to project"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
        {title} <span className="text-slate-500">({count})</span>
      </p>
      <ul className="mt-2 space-y-2">{children}</ul>
    </div>
  );
}

function ReviewRow({
  checked,
  onCheck,
  where,
  children,
}: {
  checked: boolean;
  onCheck: (checked: boolean) => void;
  where: Where;
  children: React.ReactNode;
}) {
  return (
    <li className={`flex gap-3 rounded-xl border p-3 transition ${checked ? "border-white/10 bg-slate-950/40" : "border-white/5 opacity-50"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheck(e.target.checked)}
        aria-label="Include this item"
        className="mt-2 h-4 w-4 shrink-0 cursor-pointer accent-orange-500"
      />
      <div className="min-w-0 flex-1 space-y-2">
        {children}
        {(where.source_quote || where.source_page) && (
          <p className="truncate text-xs italic text-slate-500" title={where.source_quote}>
            {where.source_page && <span className="mr-1.5 not-italic font-medium text-slate-400">p. {where.source_page}</span>}
            {where.source_quote && `“${where.source_quote}”`}
          </p>
        )}
      </div>
    </li>
  );
}

function LevelSelect({ label, value, onChange }: { label: string; value: Level; onChange: (v: Level) => void }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Level)} className={fieldClass}>
      <option value="high">High {label.toLowerCase()}</option>
      <option value="medium">Medium {label.toLowerCase()}</option>
      <option value="low">Low {label.toLowerCase()}</option>
    </select>
  );
}

function toReview(data: Extraction, from: Review["from"], tasks: Pick<Task, "title" | "status">[]): Review {
  return {
    summary: data.summary,
    from,
    actions: data.action_items.map((a) => {
      const similar = findSimilarTask(a.title, tasks);
      return {
        // Leave out, by default, what is almost certainly a task that already exists.
        checked: !(similar && similarity(a.title, similar.title) >= DUPLICATE_THRESHOLD),
        title: a.title,
        assignee: a.assignee === "Unassigned" ? "" : a.assignee,
        due_date: a.due_date ?? "",
        priority: a.priority,
        source_quote: a.source_quote,
        source_page: a.source_page,
      };
    }),
    decisions: data.decisions.map((d) => ({ checked: true, ...d })),
    risks: data.risks.map((r) => ({ checked: true, ...r })),
    questions: data.questions.map((q) => ({ checked: true, ...q })),
  };
}

// Checked rows -> rows for the items table.
function fromReview(review: Review, people: People): ItemInput[] {
  const where = (w: Where) => ({ source_quote: w.source_quote.trim() || null, source_page: w.source_page ?? null });
  return [
    ...review.actions
      .filter((a) => a.checked && a.title.trim())
      .map((a): ItemInput => {
        const member = matchPerson(a.assignee, people);
        return {
          type: "action_item",
          title: a.title,
          assignee: member ? displayName(member) : a.assignee.trim() || null,
          due_date: a.due_date || null,
          priority: a.priority,
          ...where(a),
        };
      }),
    ...review.decisions
      .filter((d) => d.checked && d.title.trim())
      .map((d): ItemInput => ({ type: "decision", title: d.title, details: d.details.trim() || null, ...where(d) })),
    ...review.risks
      .filter((r) => r.checked && r.title.trim())
      .map((r): ItemInput => ({ type: "risk", title: r.title, details: r.details.trim() || null, priority: r.severity, ...where(r) })),
    ...review.questions
      .filter((q) => q.checked && q.question.trim())
      .map((q): ItemInput => ({ type: "question", title: q.question, ...where(q) })),
  ];
}
