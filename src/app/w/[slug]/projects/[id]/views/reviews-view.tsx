"use client";

import { useState, useTransition } from "react";
import { useWorkspace } from "@/components/app/workspace-context";
import { useTaskStore } from "@/components/work/task-store";
import { Icon } from "@/components/work/ui";
import { formatDate, useToday } from "@/lib/dates";
import { DISPOSITION, DISPOSITIONS, type Disposition, type Milestone, type Review } from "@/lib/registers";
import type { Task } from "@/lib/types";
import { daysBetween } from "@/lib/work";
import { addReviewComment, createMilestone, createReview, deleteMilestone, deleteReview, setDisposition, updateMilestone, updateReview } from "@/server/engineering";
import { ErrorNote, input, label, primary, secondary } from "./register-ui";

// Milestones (key dates, shown on the timeline) and design reviews. Each
// review collects comments; every comment gets a disposition, and the ones to
// incorporate become tasks. A review can only close once that's all done.

export default function ReviewsView({
  projectId,
  milestones,
  reviews,
  comments,
}: {
  projectId: string;
  milestones: Milestone[];
  reviews: Review[];
  comments: Task[];
}) {
  const [error, setError] = useState<string>();
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Milestones projectId={projectId} milestones={milestones} onError={setError} />
      <div className="space-y-4">
        <ErrorNote error={error} />
        <Reviews projectId={projectId} reviews={reviews} milestones={milestones} comments={comments} onError={setError} />
      </div>
    </div>
  );
}

function Milestones({ projectId, milestones, onError }: { projectId: string; milestones: Milestone[]; onError: (e?: string) => void }) {
  const today = useToday();
  const { canEdit } = useWorkspace();
  const [name, setName] = useState("");
  const [due, setDue] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => onError((await fn()).error));

  return (
    <section aria-label="Milestones">
      <h2 className="mb-3 text-lg font-semibold text-white">Milestones</h2>
      <ul className="space-y-2">
        {milestones.map((m) => {
          const late = !m.done_at && !!today && m.due_on < today;
          const days = today ? daysBetween(today, m.due_on) : null;
          return (
            <li key={m.id} className="group flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2">
              <input
                type="checkbox"
                aria-label={`Mark ${m.name} ${m.done_at ? "not reached" : "reached"}`}
                checked={!!m.done_at}
                disabled={!canEdit || pending}
                onChange={() => run(() => updateMilestone(m.id, { done: !m.done_at }))}
                className="h-4 w-4 accent-emerald-500"
              />
              <span className={`h-2.5 w-2.5 shrink-0 rotate-45 ${m.done_at ? "bg-emerald-400" : "bg-violet-400"}`} />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${m.done_at ? "text-slate-500 line-through" : "text-slate-100"}`}>{m.name}</p>
                <p className={`text-xs ${late ? "text-red-400" : "text-slate-500"}`}>
                  {formatDate(m.due_on)}
                  {!m.done_at && days !== null && (days === 0 ? " · today" : days > 0 ? ` · in ${days} day${days === 1 ? "" : "s"}` : ` · ${-days} day${days === -1 ? "" : "s"} late`)}
                </p>
              </div>
              {canEdit && (
                <>
                  <input
                    type="date"
                    aria-label={`Move ${m.name}`}
                    value={m.due_on}
                    onChange={(e) => e.target.value && run(() => updateMilestone(m.id, { due_on: e.target.value }))}
                    className="w-8 cursor-pointer bg-transparent text-transparent [color-scheme:dark] focus:w-auto focus:text-slate-200"
                    title="Change date"
                  />
                  <button
                    type="button"
                    aria-label={`Delete ${m.name}`}
                    onClick={() => confirm(`Delete the milestone "${m.name}"?`) && run(() => deleteMilestone(m.id))}
                    className="rounded p-1 text-slate-500 opacity-0 hover:text-red-300 group-hover:opacity-100 focus:opacity-100"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          );
        })}
        {milestones.length === 0 && <li className="text-sm text-slate-500">No milestones yet. Add the dates that matter: design gates, permit submission, issue for construction.</li>}
      </ul>
      {canEdit && (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !due) return;
            run(async () => {
              const result = await createMilestone(projectId, { name, due_on: due });
              if (!result.error) {
                setName("");
                setDue("");
              }
              return result;
            });
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Milestone name" aria-label="Milestone name" className={`${input} min-w-0 flex-1`} />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Milestone date" className={`${input} w-auto`} />
          <button type="submit" disabled={pending || !name.trim() || !due} className={secondary}>
            Add
          </button>
        </form>
      )}
    </section>
  );
}

function Reviews({
  projectId,
  reviews,
  milestones,
  comments,
  onError,
}: {
  projectId: string;
  reviews: Review[];
  milestones: Milestone[];
  comments: Task[];
  onError: (e?: string) => void;
}) {
  const { canEdit } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [milestone, setMilestone] = useState("");
  const [due, setDue] = useState("");
  const [pending, start] = useTransition();

  return (
    <section aria-label="Design reviews">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">Design reviews</h2>
        {canEdit && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={`${primary} flex items-center gap-1.5`}>
            <Icon name="plus" /> New review
          </button>
        )}
      </div>
      {adding && (
        <form
          aria-label="New review"
          className="mb-4 space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const result = await createReview(projectId, { name, milestone_id: milestone || null, due_on: due || null });
              onError(result.error);
              if (!result.error) {
                setAdding(false);
                setName("");
                setMilestone("");
                setDue("");
              }
            });
          }}
        >
          <label className="block">
            <span className={label}>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required placeholder="60% design review" aria-label="Review name" className={input} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Milestone</span>
              <select value={milestone} onChange={(e) => setMilestone(e.target.value)} aria-label="Review milestone" className={input}>
                <option value="">None</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Comments due</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Comments due" className={input} />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={pending || !name.trim()} className={primary}>
              Add review
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-2 text-sm text-slate-400 hover:text-white">
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="space-y-4">
        {reviews.map((r) => (
          <ReviewCard key={r.id} review={r} milestone={milestones.find((m) => m.id === r.milestone_id)} comments={comments.filter((c) => c.review_id === r.id)} onError={onError} />
        ))}
        {reviews.length === 0 && !adding && (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center text-slate-400">
            No reviews yet. Start one for a design gate, collect comments, and decide what to do with each.
          </div>
        )}
      </div>
    </section>
  );
}

function ReviewCard({ review, milestone, comments, onError }: { review: Review; milestone?: Milestone; comments: Task[]; onError: (e?: string) => void }) {
  const { canEdit } = useWorkspace();
  const { openTask } = useTaskStore();
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => onError((await fn()).error));
  const closed = review.status === "closed";
  const pendingCount = comments.filter((c) => (c.disposition ?? "pending") === "pending").length;
  const undone = comments.filter((c) => c.disposition === "incorporate" && c.status !== "done").length;
  const ready = pendingCount === 0 && undone === 0;

  return (
    <article className={`rounded-xl border p-4 ${closed ? "border-emerald-500/20 bg-emerald-500/[0.03]" : "border-white/10 bg-slate-900/60"}`} aria-label={review.name}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-white">{review.name}</h3>
          <p className="text-xs text-slate-500">
            {milestone && <>For {milestone.name} · </>}
            {review.due_on && <>Comments due {formatDate(review.due_on)} · </>}
            {comments.length} comment{comments.length === 1 ? "" : "s"}
            {!closed && pendingCount > 0 && <> · {pendingCount} need a disposition</>}
            {!closed && undone > 0 && <> · {undone} to incorporate still open</>}
            {closed && review.closed_at && <> · closed {formatDate(review.closed_at.slice(0, 10))}</>}
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={pending || (!closed && !ready)}
              title={!closed && !ready ? "Give every comment a disposition, and finish the ones to incorporate, before closing." : undefined}
              onClick={() => run(() => updateReview(review.id, { status: closed ? "open" : "closed" }))}
              className={closed ? secondary : `${secondary} border-emerald-500/40 text-emerald-300`}
            >
              {closed ? "Reopen" : "Close review"}
            </button>
            <button
              type="button"
              aria-label={`Delete ${review.name}`}
              onClick={() => confirm(`Delete "${review.name}" and its ${comments.length} comments?`) && run(() => deleteReview(review.id))}
              className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
            >
              <Icon name="trash" className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>

      <ul className="mt-3 divide-y divide-white/5">
        {comments.map((c) => {
          const d = (c.disposition ?? "pending") as Disposition;
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <button type="button" onClick={() => openTask(c.id)} className={`min-w-0 flex-1 truncate text-left hover:text-orange-300 ${c.status === "done" ? "text-slate-500 line-through" : "text-slate-200"}`}>
                {c.title}
              </button>
              {d === "incorporate" && <span className="text-xs text-slate-500">{c.status === "done" ? "done" : "task open"}</span>}
              {canEdit && !closed ? (
                <select
                  aria-label={`Disposition for ${c.title}`}
                  value={d}
                  onChange={(e) => run(() => setDisposition(c.id, e.target.value))}
                  className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium [color-scheme:dark] ${DISPOSITION[d].pill}`}
                >
                  {DISPOSITIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DISPOSITION[d].pill}`}>{DISPOSITION[d].label}</span>
              )}
            </li>
          );
        })}
        {comments.length === 0 && <li className="py-2 text-sm text-slate-500">No comments yet.</li>}
      </ul>

      {canEdit && !closed && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const title = comment.trim();
            if (!title) return;
            setComment("");
            run(() => addReviewComment(review.id, { title }));
          }}
        >
          <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="Add a review comment" aria-label={`Add a comment to ${review.name}`} className={input} />
          <button type="submit" disabled={pending || !comment.trim()} className={secondary}>
            Add
          </button>
        </form>
      )}
    </article>
  );
}
