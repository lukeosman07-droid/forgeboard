"use client";

import { useEffect, useState, useTransition } from "react";
import { usePeople, useWorkspace } from "@/components/app/workspace-context";
import AssigneePicker from "@/components/work/assignee-picker";
import Attachments from "@/components/work/attachments";
import { useTaskStore } from "@/components/work/task-store";
import { Icon } from "@/components/work/ui";
import type { RfiDraft } from "@/lib/ai/register-schema";
import { formatDate, useToday } from "@/lib/dates";
import { displayName } from "@/lib/people";
import { RFI_STATUS, RFI_STATUSES, daysOpen, rfiNumber, rfiOverdue, type Rfi, type RfiStatus } from "@/lib/registers";
import type { Attachment } from "@/lib/types";
import { STATUS_BY_ID } from "@/lib/work";
import { createLinkedTask, createRfi, deleteRfi, getRfiDetail, updateRfi, type RfiDetail } from "@/server/registers";
import type { RfiPatch } from "@/server/schemas";
import { BlurField, ErrorNote, ExportLinks, SidePanel, UpgradeCard, input, label, primary, secondary } from "./register-ui";

// The RFI register: a numbered log with who has the ball, when an answer is
// needed and how long each RFI has been open. New RFIs can be typed, drafted
// by AI from a highlighted passage, or made from a question in the log.

type Filter = "all" | RfiStatus;

export default function RfisView({
  projectId,
  rfis,
  registers,
  openId,
  onOpen,
  seed,
  onSeedUsed,
}: {
  projectId: string;
  rfis: Rfi[];
  registers: boolean;
  openId: string | null;
  onOpen: (id: string | null) => void;
  /** Text highlighted elsewhere (notes) to draft a new RFI from. */
  seed: string | null;
  onSeedUsed: () => void;
}) {
  const today = useToday();
  const { canEdit } = useWorkspace();
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  // A highlight from the notes opens the new-RFI form with the AI draft running.
  const formOpen = adding || !!seed;

  if (!registers && rfis.length === 0) return <UpgradeCard what="RFIs and submittals" />;

  const shown = rfis.filter((r) => filter === "all" || r.status === filter);
  const openCount = rfis.filter((r) => r.status === "open").length;
  const overdueCount = rfis.filter((r) => rfiOverdue(r, today)).length;
  const current = openId ? rfis.find((r) => r.id === openId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && registers && !formOpen && (
            <button type="button" onClick={() => setAdding(true)} className={`${primary} flex items-center gap-1.5`}>
              <Icon name="plus" /> New RFI
            </button>
          )}
          <div className="flex gap-1 rounded-lg border border-white/10 p-1" role="group" aria-label="Filter RFIs">
            {(["all", ...RFI_STATUSES.map((s) => s.id)] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-2.5 py-0.5 text-sm ${filter === f ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {f === "all" ? "All" : RFI_STATUS[f].label}
                <span className="ml-1 text-xs text-slate-500">{f === "all" ? rfis.length : rfis.filter((r) => r.status === f).length}</span>
              </button>
            ))}
          </div>
          <span className="text-sm text-slate-400">
            {openCount} open{overdueCount > 0 && <span className="text-red-400"> · {overdueCount} overdue</span>}
          </span>
        </div>
        <ExportLinks projectId={projectId} kind="rfis" today={today} />
      </div>

      {!registers && <p className="text-sm text-slate-500">Your plan no longer includes registers, so these RFIs are read-only. You can still export them.</p>}

      {formOpen && (
        <NewRfi
          key={seed ?? "new"}
          projectId={projectId}
          seed={seed}
          onDone={(id) => {
            setAdding(false);
            onSeedUsed();
            if (id) onOpen(id);
          }}
        />
      )}

      {rfis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center text-slate-400">
          No RFIs yet. Add one, highlight a question in your notes, or use &ldquo;Create RFI&rdquo; on a question in Decisions &amp; Risks.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-900/80 text-left text-xs font-medium text-slate-400">
              <tr>
                <th className="px-4 py-2">RFI</th>
                <th className="px-2 py-2">Subject</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Ball in court</th>
                <th className="px-2 py-2">Required</th>
                <th className="px-2 py-2 text-right">Days open</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const days = today ? daysOpen(r, today) : null;
                const late = rfiOverdue(r, today);
                return (
                  <tr key={r.id} className="cursor-pointer border-t border-white/5 bg-slate-950/40 hover:bg-white/[0.03]" onClick={() => onOpen(r.id)}>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-slate-300">{rfiNumber(r.number)}</td>
                    <td className="max-w-md px-2 py-2">
                      <button type="button" className="truncate text-left text-slate-100 hover:text-orange-300" onClick={() => onOpen(r.id)}>
                        {r.subject}
                      </button>
                    </td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RFI_STATUS[r.status].pill}`}>{RFI_STATUS[r.status].label}</span>
                    </td>
                    <td className="px-2 py-2 text-slate-300">{r.ball_in_court ?? <span className="text-slate-600">–</span>}</td>
                    <td className={`whitespace-nowrap px-2 py-2 ${late ? "font-semibold text-red-400" : "text-slate-300"}`}>
                      {r.date_required ? formatDate(r.date_required) : <span className="text-slate-600">–</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-300" data-days-open={days ?? undefined}>
                      {days === null ? "–" : days}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No {filter === "all" ? "" : RFI_STATUS[filter as RfiStatus].label.toLowerCase()} RFIs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {openId && <RfiPanel key={openId} rfiId={openId} listRfi={current} registers={registers} onClose={() => onOpen(null)} />}
    </div>
  );
}

function NewRfi({ projectId, seed, onDone }: { projectId: string; seed: string | null; onDone: (id?: string) => void }) {
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [owner, setOwner] = useState<{ assignee: string | null; assignee_id: string | null }>({ assignee: null, assignee_id: null });
  const [required, setRequired] = useState("");
  const [passage, setPassage] = useState(seed ?? "");
  const [draft, setDraft] = useState<RfiDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const runDraft = async (text: string) => {
    setDrafting(true);
    setError(undefined);
    try {
      const res = await fetch("/api/ai/rfi-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, passage: text }),
      });
      const body = (await res.json().catch(() => ({}))) as { draft?: RfiDraft; error?: string };
      if (!res.ok || !body.draft) throw new Error(body.error ?? "The AI couldn't draft that. Please try again.");
      setDraft(body.draft);
      setSubject(body.draft.subject);
      setQuestion(
        [body.draft.question, body.draft.suggested_answer && `Suggested answer: ${body.draft.suggested_answer}`, body.draft.references.length ? `References: ${body.draft.references.join(", ")}` : ""]
          .filter(Boolean)
          .join("\n\n"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The AI couldn't draft that.");
    } finally {
      setDrafting(false);
    }
  };

  // Started from a highlight: draft straight away.
  useEffect(() => {
    if (!seed) return;
    const timer = setTimeout(() => void runDraft(seed), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const submit = (status: "open" | "draft") =>
    start(async () => {
      const result = await createRfi(projectId, {
        subject,
        question,
        status,
        ball_in_court_id: owner.assignee_id,
        ball_in_court: owner.assignee_id ? null : owner.assignee,
        date_required: required || null,
      });
      if (result.error) setError(result.error);
      else onDone(result.id);
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit("open");
      }}
      className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4"
      aria-label="New RFI"
    >
      <details open={!!seed} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
        <summary className="cursor-pointer text-sm text-orange-300">
          <Icon name="sparkles" className="mr-1 inline h-4 w-4" /> Draft with AI from a highlighted question
        </summary>
        <div className="mt-2 space-y-2">
          <textarea
            aria-label="Passage to draft from"
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
            rows={3}
            maxLength={8000}
            placeholder="Paste the sentence or two from your notes or an email that asks the question."
            className={input}
          />
          <button type="button" disabled={drafting || passage.trim().length < 10} onClick={() => runDraft(passage)} className={secondary}>
            {drafting ? "Drafting…" : draft ? "Draft again" : "Draft RFI"}
          </button>
          {draft && <p className="text-xs text-slate-500">Check the draft below before you create it. One AI run used.</p>}
        </div>
      </details>

      <label className="block">
        <span className={label}>Subject</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} required aria-label="RFI subject" className={input} />
      </label>
      <label className="block">
        <span className={label}>Question</span>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={4} maxLength={10000} aria-label="RFI question" className={input} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>Ball in court</span>
          <AssigneePicker assignee={owner.assignee} assigneeId={owner.assignee_id} onChange={setOwner} />
        </div>
        <label className="block">
          <span className={label}>Answer needed by</span>
          <input type="date" value={required} onChange={(e) => setRequired(e.target.value)} aria-label="Answer needed by" className={input} />
        </label>
      </div>
      <ErrorNote error={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || !subject.trim()} className={primary}>
          {pending ? "Creating…" : "Create RFI"}
        </button>
        <button type="button" disabled={pending || !subject.trim()} onClick={() => submit("draft")} className={secondary}>
          Save as draft
        </button>
        <button type="button" onClick={() => onDone()} className="px-2 text-sm text-slate-400 hover:text-white">
          Cancel
        </button>
      </div>
    </form>
  );
}

function RfiPanel({ rfiId, listRfi, registers, onClose }: { rfiId: string; listRfi?: Rfi; registers: boolean; onClose: () => void }) {
  const today = useToday();
  const { canEdit } = useWorkspace();
  const { byId } = usePeople();
  const { openTask } = useTaskStore();
  const [detail, setDetail] = useState<RfiDetail | "missing" | null>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState<string>();
  const [newTask, setNewTask] = useState("");
  const [pending, start] = useTransition();

  // Reload when the list copy changes (someone saved, here or elsewhere).
  const stamp = listRfi?.updated_at;
  useEffect(() => {
    let live = true;
    getRfiDetail(rfiId).then((d) => {
      if (!live) return;
      setDetail(d ?? "missing");
      if (d) setFiles(d.files);
    });
    return () => {
      live = false;
    };
  }, [rfiId, stamp]);

  const rfi = listRfi ?? (detail && detail !== "missing" ? detail.rfi : undefined);
  const editable = canEdit && registers;
  const save = (patch: RfiPatch) =>
    start(async () => {
      const result = await updateRfi(rfiId, patch);
      setError(result.error);
    });

  if (detail === "missing") return <SidePanel title="RFI" onClose={onClose}><p className="text-slate-400">This RFI no longer exists.</p></SidePanel>;
  if (!rfi) {
    return (
      <SidePanel title="RFI" onClose={onClose}>
        <div className="h-40 animate-pulse rounded-xl bg-white/5" />
      </SidePanel>
    );
  }
  const days = today ? daysOpen(rfi, today) : null;
  const askedBy = rfi.asked_by_id ? byId.get(rfi.asked_by_id) : undefined;

  return (
    <SidePanel
      title={<span className="font-mono">{rfiNumber(rfi.number)}</span>}
      onClose={onClose}
      actions={
        canEdit && (
          <button
            type="button"
            aria-label="Delete RFI"
            onClick={() => {
              if (!confirm(`Delete ${rfiNumber(rfi.number)}? Its files are deleted too. This can't be undone.`)) return;
              start(async () => {
                const result = await deleteRfi(rfi.id);
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
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RFI_STATUS[rfi.status].pill}`}>{RFI_STATUS[rfi.status].label}</span>
          {days !== null && (
            <span className={`rounded-full px-2 py-0.5 text-xs ${rfiOverdue(rfi, today) ? "bg-red-500/15 text-red-300" : "bg-white/5 text-slate-300"}`} data-testid="days-open">
              {days} day{days === 1 ? "" : "s"} open
            </span>
          )}
          {rfi.opened_at && <span className="text-xs text-slate-500">Opened {formatDate(rfi.opened_at.slice(0, 10))}</span>}
          {askedBy && <span className="text-xs text-slate-500">· asked by {displayName(askedBy)}</span>}
        </div>

        <fieldset disabled={!editable} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <label className="block">
            <span className={label}>Subject</span>
            <BlurField ariaLabel="Subject" value={rfi.subject} maxLength={300} onSave={(subject) => subject && save({ subject })} />
          </label>
          <label className="block">
            <span className={label}>Question</span>
            <BlurField ariaLabel="Question" multiline value={rfi.question} maxLength={10000} onSave={(question) => save({ question })} />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={label}>Status</span>
              <select aria-label="Status" value={rfi.status} onChange={(e) => save({ status: e.target.value as RfiStatus })} className={input}>
                {RFI_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className={label}>Ball in court</span>
              <AssigneePicker
                assignee={rfi.ball_in_court}
                assigneeId={rfi.ball_in_court_id}
                onChange={(o) => save(o.assignee_id ? { ball_in_court_id: o.assignee_id } : { ball_in_court: o.assignee })}
              />
            </div>
            <label className="block">
              <span className={label}>Needed by</span>
              <input type="date" aria-label="Needed by" value={rfi.date_required ?? ""} onChange={(e) => save({ date_required: e.target.value || null })} className={input} />
            </label>
          </div>
          <label className="block">
            <span className={label}>Response</span>
            <BlurField
              ariaLabel="Response"
              multiline
              value={rfi.response ?? ""}
              maxLength={10000}
              placeholder="The design team's answer. Saving a response doesn't change the status; set it to Answered when the ball comes back."
              onSave={(response) => save({ response: response || null })}
            />
          </label>
        </fieldset>

        {detail?.source && (
          <p className="text-sm text-slate-400">
            Made from the question <span className="text-slate-200">&ldquo;{detail.source.title}&rdquo;</span> in Decisions &amp; Risks.
          </p>
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
                  {t.due_date && <span className="text-xs text-slate-500">{formatDate(t.due_date)}</span>}
                </li>
              ))}
              {detail.tasks.length === 0 && <li className="text-sm text-slate-500">None yet. Link a task from its panel, or add a follow-up here.</li>}
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
                  const result = await createLinkedTask("rfi", rfi.id, title);
                  if (result.error) setError(result.error);
                  else setDetail(await getRfiDetail(rfi.id));
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

        <Attachments projectId={rfi.project_id} rfiId={rfi.id} files={files} setFiles={setFiles} canEdit={editable} />
      </div>
    </SidePanel>
  );
}
