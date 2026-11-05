"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { saveExtraction, type ItemInput } from "@/app/dashboard/actions";
import type { Extraction } from "@/lib/ai/schema";
import { localToday } from "@/lib/dates";
import { FREE_TRIAL_EXTRACTIONS, MAX_NOTES_CHARS } from "@/lib/plans";
import { SAMPLE_NOTES } from "@/lib/sample-notes";
import type { Usage } from "./project-workspace";

type Level = "high" | "medium" | "low";

// Editable copies of what the AI returned, each with a "keep" checkbox.
type Review = {
  summary: string;
  actions: { checked: boolean; title: string; assignee: string; due_date: string; priority: Level; source_quote: string }[];
  decisions: { checked: boolean; title: string; details: string; source_quote: string }[];
  risks: { checked: boolean; title: string; details: string; severity: Level }[];
  questions: { checked: boolean; question: string }[];
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

export default function AiExtractPanel({
  projectId,
  usage,
  startOpen,
  onSaved,
}: {
  projectId: string;
  usage: Usage;
  startOpen: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure>();
  const [review, setReview] = useState<Review>();
  const [submittedText, setSubmittedText] = useState("");
  const [trialLeft, setTrialLeft] = useState(usage.trialLeft);
  const [savedMessage, setSavedMessage] = useState<string>();
  const [saving, startSaving] = useTransition();

  const tooLong = text.length > MAX_NOTES_CHARS;
  const outOfTrial = !usage.paid && trialLeft <= 0;

  async function extract() {
    setFailure(undefined);
    setSavedMessage(undefined);
    setLoading(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, text, today: localToday() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.code === "trial_exhausted") setTrialLeft(0);
        setFailure({ message: body.error ?? "Something went wrong. Please try again.", upgrade: body.code === "trial_exhausted" });
        return;
      }
      const data: Extraction = body.extraction;
      if (typeof body.freeRemaining === "number") setTrialLeft(body.freeRemaining);
      setSubmittedText(text);
      setReview(toReview(data));
    } catch {
      setFailure({ message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  function save() {
    if (!review) return;
    const items = fromReview(review);
    if (items.length === 0) {
      setFailure({ message: "Select at least one item to save." });
      return;
    }
    setFailure(undefined);
    startSaving(async () => {
      const result = await saveExtraction({ projectId, rawText: submittedText, summary: review.summary, items });
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
            <span className="block font-semibold text-white">AI Extract</span>
            <span className="block text-sm text-slate-400">Turn messy notes into action items, decisions, and risks.</span>
          </span>
        </span>
        <span className="flex items-center gap-3">
          <UsageBadge paid={usage.paid} trialLeft={trialLeft} />
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
                <Link href="/pricing" className="ml-2 font-semibold text-orange-300 underline hover:text-orange-200">
                  See plans →
                </Link>
              )}
            </div>
          )}

          {review ? (
            <ReviewScreen review={review} setReview={setReview} saving={saving} onSave={save} onDiscard={() => setReview(undefined)} />
          ) : loading ? (
            <LoadingState />
          ) : outOfTrial ? (
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-6 text-center">
              <p className="font-semibold text-white">You&apos;ve used all {FREE_TRIAL_EXTRACTIONS} free AI extractions</p>
              <p className="mt-1 text-sm text-slate-400">Upgrade to keep turning notes into organized projects. You can still add items by hand below.</p>
              <Link
                href="/pricing"
                className="mt-4 inline-block rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-orange-400"
              >
                See plans
              </Link>
            </div>
          ) : (
            <div>
              <label htmlFor="notes-input" className="sr-only">
                Notes to extract from
              </label>
              <textarea
                id="notes-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                placeholder="Paste meeting notes, an email thread, or a spec document."
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
                  onClick={extract}
                  disabled={!text.trim() || tooLong}
                  className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/20 hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  ✨ Extract with AI
                </button>
              </div>
              {tooLong && <p className="mt-2 text-xs text-red-300">That&apos;s over the limit. Split it into smaller parts.</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function UsageBadge({ paid, trialLeft }: { paid: boolean; trialLeft: number }) {
  if (paid) return <span className="hidden rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300 sm:inline">Unlimited</span>;
  return (
    <span
      className={`hidden rounded-full px-2.5 py-1 text-xs sm:inline ${trialLeft > 0 ? "bg-white/5 text-slate-300" : "bg-red-500/10 text-red-300"}`}
    >
      {trialLeft} of {FREE_TRIAL_EXTRACTIONS} free left
    </span>
  );
}

function LoadingState() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const step = LOADING_STEPS[Math.min(Math.floor(seconds / 6), LOADING_STEPS.length - 1)];

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-12 text-center">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-orange-500/20 border-t-orange-500" aria-hidden />
      <div>
        <p className="font-medium text-white">{step}</p>
        <p className="mt-1 text-sm text-slate-500">This usually takes 15–45 seconds · {seconds}s</p>
      </div>
    </div>
  );
}

function ReviewScreen({
  review,
  setReview,
  saving,
  onSave,
  onDiscard,
}: {
  review: Review;
  setReview: (r: Review) => void;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  // Small helper to update one field of one row in one group.
  function edit<K extends keyof Omit<Review, "summary">>(group: K, index: number, patch: Partial<Review[K][number]>) {
    const rows = review[group].map((row, i) => (i === index ? { ...row, ...patch } : row));
    setReview({ ...review, [group]: rows });
  }
  const selected =
    [...review.actions, ...review.decisions, ...review.risks, ...review.questions].filter((r) => r.checked).length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">Summary</p>
        <textarea
          value={review.summary}
          onChange={(e) => setReview({ ...review, summary: e.target.value })}
          rows={3}
          className={`${fieldClass} mt-2`}
        />
      </div>

      <Group title="Action items" count={review.actions.length}>
        {review.actions.map((a, i) => (
          <ReviewRow key={i} checked={a.checked} onCheck={(checked) => edit("actions", i, { checked })} quote={a.source_quote}>
            <input aria-label="Title" value={a.title} onChange={(e) => edit("actions", i, { title: e.target.value })} className={fieldClass} />
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                aria-label="Assignee"
                value={a.assignee}
                onChange={(e) => edit("actions", i, { assignee: e.target.value })}
                placeholder="Unassigned"
                className={fieldClass}
              />
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
        ))}
      </Group>

      <Group title="Decisions" count={review.decisions.length}>
        {review.decisions.map((d, i) => (
          <ReviewRow key={i} checked={d.checked} onCheck={(checked) => edit("decisions", i, { checked })} quote={d.source_quote}>
            <input aria-label="Decision" value={d.title} onChange={(e) => edit("decisions", i, { title: e.target.value })} className={fieldClass} />
            <textarea aria-label="Details" value={d.details} rows={2} onChange={(e) => edit("decisions", i, { details: e.target.value })} className={fieldClass} />
          </ReviewRow>
        ))}
      </Group>

      <Group title="Risks" count={review.risks.length}>
        {review.risks.map((r, i) => (
          <ReviewRow key={i} checked={r.checked} onCheck={(checked) => edit("risks", i, { checked })}>
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
          <ReviewRow key={i} checked={q.checked} onCheck={(checked) => edit("questions", i, { checked })}>
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
  quote,
  children,
}: {
  checked: boolean;
  onCheck: (checked: boolean) => void;
  quote?: string;
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
        {quote && <p className="truncate text-xs italic text-slate-500" title={quote}>“{quote}”</p>}
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

function toReview(data: Extraction): Review {
  return {
    summary: data.summary,
    actions: data.action_items.map((a) => ({
      checked: true,
      title: a.title,
      assignee: a.assignee === "Unassigned" ? "" : a.assignee,
      due_date: a.due_date ?? "",
      priority: a.priority,
      source_quote: a.source_quote,
    })),
    decisions: data.decisions.map((d) => ({ checked: true, ...d })),
    risks: data.risks.map((r) => ({ checked: true, ...r })),
    questions: data.questions.map((q) => ({ checked: true, ...q })),
  };
}

// Checked rows -> rows for the items table.
function fromReview(review: Review): ItemInput[] {
  const quoteNote = (q: string) => (q.trim() ? `From notes: “${q.trim()}”` : "");
  const join = (...parts: string[]) => parts.filter(Boolean).join("\n\n") || null;

  return [
    ...review.actions
      .filter((a) => a.checked && a.title.trim())
      .map((a): ItemInput => ({
        type: "action_item",
        title: a.title,
        assignee: a.assignee.trim() || null,
        due_date: a.due_date || null,
        priority: a.priority,
        details: join(quoteNote(a.source_quote)),
      })),
    ...review.decisions
      .filter((d) => d.checked && d.title.trim())
      .map((d): ItemInput => ({ type: "decision", title: d.title, details: join(d.details.trim(), quoteNote(d.source_quote)) })),
    ...review.risks
      .filter((r) => r.checked && r.title.trim())
      .map((r): ItemInput => ({ type: "risk", title: r.title, details: join(r.details.trim()), priority: r.severity })),
    ...review.questions
      .filter((q) => q.checked && q.question.trim())
      .map((q): ItemInput => ({ type: "question", title: q.question })),
  ];
}
