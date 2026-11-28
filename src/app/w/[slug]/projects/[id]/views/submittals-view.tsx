"use client";

import { useEffect, useState, useTransition } from "react";
import { useWorkspace } from "@/components/app/workspace-context";
import AssigneePicker from "@/components/work/assignee-picker";
import Attachments from "@/components/work/attachments";
import { useTaskStore } from "@/components/work/task-store";
import { Icon } from "@/components/work/ui";
import type { SubmittalReview } from "@/lib/ai/register-schema";
import { formatDate, useToday } from "@/lib/dates";
import { SUBMITTAL_ACTION, SUBMITTAL_ACTIONS, canResubmit, submittalNumber, submittalOverdue, type Submittal, type SubmittalAction } from "@/lib/registers";
import type { Attachment } from "@/lib/types";
import { STATUS_BY_ID } from "@/lib/work";
import { createLinkedTask, createSubmittal, deleteSubmittal, getSubmittalDetail, resubmitSubmittal, updateSubmittal, type SubmittalDetail } from "@/server/registers";
import type { SubmittalPatch } from "@/server/schemas";
import { BlurField, ErrorNote, ExportLinks, SidePanel, UpgradeCard, input, label, primary, secondary } from "./register-ui";

// The submittal register: shop drawings and product data going to review and
// back, with the decision on each revision kept in a history.

type Filter = "all" | "pending" | "returned";

export default function SubmittalsView({
  projectId,
  submittals,
  registers,
  openId,
  onOpen,
}: {
  projectId: string;
  submittals: Submittal[];
  registers: boolean;
  openId: string | null;
  onOpen: (id: string | null) => void;
}) {
  const today = useToday();
  const { canEdit } = useWorkspace();
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);

  if (!registers && submittals.length === 0) return <UpgradeCard what="RFIs and submittals" />;

  const shown = submittals.filter((s) => filter === "all" || (filter === "pending" ? s.action === "pending" : s.action !== "pending"));
  const current = openId ? submittals.find((s) => s.id === openId) : undefined;
  const late = submittals.filter((s) => submittalOverdue(s, today)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && registers && !adding && (
            <button type="button" onClick={() => setAdding(true)} className={`${primary} flex items-center gap-1.5`}>
              <Icon name="plus" /> New submittal
            </button>
          )}
          <div className="flex gap-1 rounded-lg border border-white/10 p-1" role="group" aria-label="Filter submittals">
            {(
              [
                ["all", "All"],
                ["pending", "Under review"],
                ["returned", "Returned"],
              ] as [Filter, string][]
            ).map(([id, text]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={`rounded-md px-2.5 py-0.5 text-sm ${filter === id ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {text}
              </button>
            ))}
          </div>
          {late > 0 && <span className="text-sm text-red-400">{late} past due</span>}
        </div>
        <ExportLinks projectId={projectId} kind="submittals" today={today} />
      </div>

      {!registers && <p className="text-sm text-slate-500">Your plan no longer includes registers, so these are read-only. You can still export them.</p>}

      {adding && (
        <NewSubmittal
          projectId={projectId}
          onDone={(id) => {
            setAdding(false);
            if (id) onOpen(id);
          }}
        />
      )}

      {submittals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center text-slate-400">
          No submittals yet. Log shop drawings, product data and samples as they come in.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-900/80 text-left text-xs font-medium text-slate-400">
              <tr>
                <th className="px-4 py-2">No.</th>
                <th className="px-2 py-2">Spec</th>
                <th className="px-2 py-2">Title</th>
                <th className="px-2 py-2">Reviewer</th>
                <th className="px-2 py-2">Due</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className="cursor-pointer border-t border-white/5 bg-slate-950/40 hover:bg-white/[0.03]" onClick={() => onOpen(s.id)}>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-slate-300">{submittalNumber(s.number, s.revision)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-slate-400">{s.spec_section ?? "–"}</td>
                  <td className="max-w-md px-2 py-2">
                    <button type="button" className="truncate text-left text-slate-100 hover:text-orange-300" onClick={() => onOpen(s.id)}>
                      {s.title}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-slate-300">{s.reviewer ?? <span className="text-slate-600">–</span>}</td>
                  <td className={`whitespace-nowrap px-2 py-2 ${submittalOverdue(s, today) ? "font-semibold text-red-400" : "text-slate-300"}`}>
                    {s.due_on ? formatDate(s.due_on) : "–"}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${SUBMITTAL_ACTION[s.action].pill}`}>{SUBMITTAL_ACTION[s.action].short}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && <SubmittalPanel key={openId} submittalId={openId} listSubmittal={current} registers={registers} onClose={() => onOpen(null)} />}
    </div>
  );
}

function NewSubmittal({ projectId, onDone }: { projectId: string; onDone: (id?: string) => void }) {
  const [title, setTitle] = useState("");
  const [spec, setSpec] = useState("");
  const [from, setFrom] = useState("");
  const [received, setReceived] = useState("");
  const [due, setDue] = useState("");
  const [reviewer, setReviewer] = useState<{ assignee: string | null; assignee_id: string | null }>({ assignee: null, assignee_id: null });
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <form
      aria-label="New submittal"
      className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await createSubmittal(projectId, {
            title,
            spec_section: spec,
            submitted_by: from,
            received_on: received || null,
            due_on: due || null,
            reviewer_id: reviewer.assignee_id,
            reviewer: reviewer.assignee_id ? null : reviewer.assignee,
          });
          if (result.error) setError(result.error);
          else onDone(result.id);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <label className="block">
          <span className={label}>Spec section</span>
          <input value={spec} onChange={(e) => setSpec(e.target.value)} maxLength={60} placeholder="23 34 00" aria-label="Spec section" className={input} />
        </label>
        <label className="block">
          <span className={label}>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required placeholder="Rooftop unit product data" aria-label="Submittal title" className={input} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={label}>From</span>
          <input value={from} onChange={(e) => setFrom(e.target.value)} maxLength={200} placeholder="Contractor or supplier" aria-label="Submitted by" className={input} />
        </label>
        <div>
          <span className={label}>Reviewer</span>
          <AssigneePicker assignee={reviewer.assignee} assigneeId={reviewer.assignee_id} onChange={setReviewer} />
        </div>
        <label className="block">
          <span className={label}>Received</span>
          <input type="date" value={received} onChange={(e) => setReceived(e.target.value)} aria-label="Received on" className={input} />
        </label>
        <label className="block">
          <span className={label}>Review due</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Review due" className={input} />
        </label>
      </div>
      <ErrorNote error={error} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !title.trim()} className={primary}>
          {pending ? "Adding…" : "Add submittal"}
        </button>
        <button type="button" onClick={() => onDone()} className="px-2 text-sm text-slate-400 hover:text-white">
          Cancel
        </button>
      </div>
    </form>
  );
}

function SubmittalPanel({ submittalId, listSubmittal, registers, onClose }: { submittalId: string; listSubmittal?: Submittal; registers: boolean; onClose: () => void }) {
  const { canEdit, limits } = useWorkspace();
  const { openTask } = useTaskStore();
  const [detail, setDetail] = useState<SubmittalDetail | "missing" | null>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState<string>();
  const [newTask, setNewTask] = useState("");
  const [pending, start] = useTransition();

  const stamp = listSubmittal?.updated_at;
  useEffect(() => {
    let live = true;
    getSubmittalDetail(submittalId).then((d) => {
      if (!live) return;
      setDetail(d ?? "missing");
      if (d) setFiles(d.files);
    });
    return () => {
      live = false;
    };
  }, [submittalId, stamp]);

  const s = listSubmittal ?? (detail && detail !== "missing" ? detail.submittal : undefined);
  const editable = canEdit && registers;
  const save = (patch: SubmittalPatch) =>
    start(async () => {
      const result = await updateSubmittal(submittalId, patch);
      setError(result.error);
    });

  if (detail === "missing") return <SidePanel title="Submittal" onClose={onClose}><p className="text-slate-400">This submittal no longer exists.</p></SidePanel>;
  if (!s) {
    return (
      <SidePanel title="Submittal" onClose={onClose}>
        <div className="h-40 animate-pulse rounded-xl bg-white/5" />
      </SidePanel>
    );
  }

  return (
    <SidePanel
      title={<span className="font-mono">{submittalNumber(s.number, s.revision)}</span>}
      onClose={onClose}
      actions={
        canEdit && (
          <button
            type="button"
            aria-label="Delete submittal"
            onClick={() => {
              if (!confirm(`Delete ${submittalNumber(s.number)} and its history and files? This can't be undone.`)) return;
              start(async () => {
                const result = await deleteSubmittal(s.id);
                if (result.error) setError(result.error);
                else onClose();
              });
            }}
            className="rounded-lg p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Icon name="trash" />
          </button>
        )
      }
    >
      <div className="space-y-5">
        <ErrorNote error={error} />
        <fieldset disabled={!editable} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <label className="block">
              <span className={label}>Spec section</span>
              <BlurField ariaLabel="Spec section" value={s.spec_section ?? ""} maxLength={60} onSave={(v) => save({ spec_section: v || null })} />
            </label>
            <label className="block">
              <span className={label}>Title</span>
              <BlurField ariaLabel="Title" value={s.title} maxLength={300} onSave={(title) => title && save({ title })} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>From</span>
              <BlurField ariaLabel="From" value={s.submitted_by ?? ""} maxLength={200} onSave={(v) => save({ submitted_by: v || null })} />
            </label>
            <div>
              <span className={label}>Reviewer</span>
              <AssigneePicker
                assignee={s.reviewer}
                assigneeId={s.reviewer_id}
                onChange={(o) => save(o.assignee_id ? { reviewer_id: o.assignee_id } : { reviewer: o.assignee })}
              />
            </div>
            <label className="block">
              <span className={label}>Received</span>
              <input type="date" aria-label="Received" value={s.received_on ?? ""} onChange={(e) => save({ received_on: e.target.value || null })} className={input} />
            </label>
            <label className="block">
              <span className={label}>Review due</span>
              <input type="date" aria-label="Review due" value={s.due_on ?? ""} onChange={(e) => save({ due_on: e.target.value || null })} className={input} />
            </label>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block min-w-48 flex-1">
                <span className={label}>Action (revision {s.revision})</span>
                <select aria-label="Action" value={s.action} onChange={(e) => save({ action: e.target.value as SubmittalAction })} className={input}>
                  {SUBMITTAL_ACTIONS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              {s.returned_on && <span className="pb-2 text-xs text-slate-500">Returned {formatDate(s.returned_on)}</span>}
              {canResubmit(s) && (
                <button
                  type="button"
                  className={secondary}
                  onClick={() =>
                    start(async () => {
                      const result = await resubmitSubmittal(s.id, new Date().toISOString().slice(0, 10));
                      setError(result.error);
                    })
                  }
                >
                  Log revision {s.revision + 1}
                </button>
              )}
            </div>
            <div className="mt-3">
              <span className={label}>Review notes</span>
              <BlurField ariaLabel="Review notes" multiline rows={4} value={s.review_notes ?? ""} maxLength={10000} onSave={(v) => save({ review_notes: v || null })} />
            </div>
          </div>
        </fieldset>

        {limits.features.file_ai && registers && (
          <AiReview submittalId={s.id} files={files} canEdit={editable} onAddNotes={(text) => save({ review_notes: [s.review_notes, text].filter(Boolean).join("\n\n") })} />
        )}

        {detail && detail.revisions.length > 0 && (
          <section>
            <h3 className={label}>History</h3>
            <ul className="space-y-1 text-sm">
              {detail.revisions.map((r) => (
                <li key={r.id} className="flex flex-wrap gap-x-3 text-slate-300">
                  <span className="font-mono text-xs text-slate-400">Rev {r.revision}</span>
                  <span>{SUBMITTAL_ACTION[r.action].label}</span>
                  {r.returned_on && <span className="text-slate-500">returned {formatDate(r.returned_on)}</span>}
                  {r.review_notes && <span className="w-full whitespace-pre-wrap pl-12 text-xs text-slate-500">{r.review_notes}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className={label}>Linked tasks</h3>
          {detail ? (
            <ul className="space-y-1">
              {detail.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${STATUS_BY_ID[t.status].dot}`} />
                  <button type="button" onClick={() => openTask(t.id)} className="min-w-0 truncate text-left text-slate-200 hover:text-orange-300">
                    {t.title}
                  </button>
                </li>
              ))}
              {detail.tasks.length === 0 && <li className="text-sm text-slate-500">None yet.</li>}
            </ul>
          ) : (
            <div className="h-6 animate-pulse rounded bg-white/5" />
          )}
          {editable && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const title = newTask.trim();
                if (!title) return;
                setNewTask("");
                start(async () => {
                  const result = await createLinkedTask("submittal", s.id, title);
                  if (result.error) setError(result.error);
                  else setDetail(await getSubmittalDetail(s.id));
                });
              }}
            >
              <input value={newTask} onChange={(e) => setNewTask(e.target.value)} maxLength={500} placeholder="Add a follow-up task" aria-label="New linked task" className={input} />
              <button type="submit" disabled={pending || !newTask.trim()} className={secondary}>
                Add
              </button>
            </form>
          )}
        </section>

        <Attachments projectId={s.project_id} submittalId={s.id} files={files} setFiles={setFiles} canEdit={editable} />
      </div>
    </SidePanel>
  );
}

/** Compare an attached PDF to a pasted spec section; the reviewer confirms each finding. */
function AiReview({ submittalId, files, canEdit, onAddNotes }: { submittalId: string; files: Attachment[]; canEdit: boolean; onAddNotes: (text: string) => void }) {
  const readable = files.filter((f) => f.mime_type === "application/pdf" || f.mime_type.includes("wordprocessingml"));
  const [fileId, setFileId] = useState("");
  const [spec, setSpec] = useState("");
  const [review, setReview] = useState<SubmittalReview | null>(null);
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const chosen = fileId || readable[0]?.id || "";

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/ai/submittal-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submittalId, attachmentId: chosen, spec }),
      });
      const body = (await res.json().catch(() => ({}))) as { review?: SubmittalReview; error?: string };
      if (!res.ok || !body.review) throw new Error(body.error ?? "The AI review failed. Please try again.");
      setReview(body.review);
      setKept(new Set(body.review.deviations.map((_, i) => i).filter((i) => body.review!.deviations[i].severity !== "minor")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The AI review failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
      <summary className="cursor-pointer text-sm text-orange-300">
        <Icon name="sparkles" className="mr-1 inline h-4 w-4" /> Check against the spec with AI
      </summary>
      <div className="mt-3 space-y-3">
        {readable.length === 0 ? (
          <p className="text-sm text-slate-500">Attach the submittal PDF (or Word file) below first.</p>
        ) : (
          <>
            {readable.length > 1 && (
              <select aria-label="Submittal file" value={chosen} onChange={(e) => setFileId(e.target.value)} className={input}>
                {readable.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
            <textarea
              aria-label="Spec section text"
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              rows={5}
              maxLength={60000}
              placeholder="Paste the spec section the submittal should meet (Part 2 Products, for example)."
              className={input}
            />
            <button type="button" disabled={busy || spec.trim().length < 40} onClick={run} className={secondary}>
              {busy ? "Reading the submittal…" : "Find deviations"}
            </button>
          </>
        )}
        <ErrorNote error={error} />
        {review && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-300">{review.summary}</p>
            {review.deviations.length === 0 && review.missing.length === 0 ? (
              <p className="text-emerald-300">No deviations found. Check the submittal yourself before approving.</p>
            ) : (
              <>
                <p className="text-xs text-slate-500">Possible deviations. Tick the ones you confirm; the AI can be wrong.</p>
                <ul className="space-y-2">
                  {review.deviations.map((d, i) => (
                    <li key={i} className="rounded-lg border border-white/10 p-2">
                      <label className="flex gap-2">
                        <input
                          type="checkbox"
                          className="mt-1 accent-orange-500"
                          checked={kept.has(i)}
                          onChange={() =>
                            setKept((k) => {
                              const next = new Set(k);
                              if (next.has(i)) next.delete(i);
                              else next.add(i);
                              return next;
                            })
                          }
                        />
                        <span>
                          <span className="font-medium text-white">{d.item}</span>{" "}
                          <span className={`rounded px-1 text-xs ${d.severity === "major" ? "bg-red-500/15 text-red-300" : d.severity === "minor" ? "bg-slate-500/20 text-slate-300" : "bg-amber-500/15 text-amber-300"}`}>
                            {d.severity}
                          </span>
                          <span className="block text-slate-400">Spec: {d.required}</span>
                          <span className="block text-slate-400">
                            Submitted: {d.submitted}
                            {d.page ? ` (p. ${d.page})` : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {review.missing.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Not included</p>
                    <ul className="ml-4 list-disc text-slate-400">
                      {review.missing.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {canEdit && (
                  <button
                    type="button"
                    className={secondary}
                    disabled={kept.size === 0 && review.missing.length === 0}
                    onClick={() =>
                      onAddNotes(
                        [
                          ...review.deviations.filter((_, i) => kept.has(i)).map((d) => `- ${d.item}: spec requires ${d.required}; submitted ${d.submitted}.`),
                          ...review.missing.map((m) => `- Missing: ${m}`),
                        ].join("\n"),
                      )
                    }
                  >
                    Add confirmed items to review notes
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
