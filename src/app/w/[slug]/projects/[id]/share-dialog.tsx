"use client";

import { useRef, useState, useTransition } from "react";
import InviteResult from "@/components/app/invite-result";
import { useWorkspace } from "@/components/app/workspace-context";
import { Avatar, Icon } from "@/components/work/ui";
import { displayName } from "@/lib/people";
import { addProjectMember, removeProjectMember, shareProjectByEmail, type InviteOutcome } from "@/server/members";
import { setProjectManager } from "@/server/projects";

// "Share" on the project header. Members already see every project, so this is
// about guests: people outside the firm (a client's PM, a contractor) who can
// read and comment on this one project and don't use a seat.
// Only the project's PM and the workspace's admins can bring guests in; admins
// also choose the PM. The database enforces both.
export default function ShareDialog({
  projectId,
  projectName,
  sharedWith,
  managerId,
}: {
  projectId: string;
  projectName: string;
  sharedWith: string[];
  managerId: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { people, isAdmin, userId, name: workspaceName } = useWorkspace();
  const canManage = isAdmin || (managerId !== null && managerId === userId);
  const manager = people.find((p) => p.user_id === managerId && p.role !== "guest");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [outcome, setOutcome] = useState<InviteOutcome>();
  const [pending, startTransition] = useTransition();

  const shared = new Set(sharedWith);
  const members = people.filter((p) => p.role !== "guest");
  const guestsHere = people.filter((p) => p.role === "guest" && shared.has(p.user_id));
  const otherGuests = people.filter((p) => p.role === "guest" && !shared.has(p.user_id));

  const run = (action: () => Promise<{ error?: string }>, done?: () => void) => {
    setError(undefined);
    setNotice(undefined);
    setOutcome(undefined);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else done?.();
    });
  };

  const share = () =>
    run(async () => {
      const result = await shareProjectByEmail(projectId, email);
      if (!result.error) {
        setEmail("");
        if (result.added) setNotice("Added to this project.");
        if (result.outcome) setOutcome(result.outcome);
      }
      return result;
    });

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="mt-1 flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/5"
      >
        <Icon name="users" /> Share
      </button>

      <dialog
        ref={dialogRef}
        aria-label={`Share ${projectName}`}
        className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-0 text-slate-200 shadow-2xl backdrop:bg-slate-950/70 backdrop:backdrop-blur-sm"
        onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
      >
        <div className="flex items-start justify-between border-b border-white/10 p-6 pb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Share &ldquo;{projectName}&rdquo;</h2>
            <p className="mt-1 text-sm text-slate-400">
              Guests can read and comment on this project only. They&apos;re free and don&apos;t use a seat.
            </p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5">
            <Icon name="x" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-6">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Project manager</h3>
            {isAdmin ? (
              <select
                value={manager?.user_id ?? ""}
                disabled={pending}
                aria-label="Project manager"
                onChange={(e) => run(() => setProjectManager(projectId, e.target.value || null), () => setNotice("Project manager updated."))}
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
              >
                <option value="">No PM (admins only)</option>
                {members.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {displayName(p)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-2 text-sm text-slate-300">{manager ? displayName(manager) : "None yet (admins manage sharing)"}</p>
            )}
            {!canManage && (
              <p className="mt-2 text-xs text-slate-500">Only the project manager or an admin can invite guests to this project.</p>
            )}
          </section>

          {canManage && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                share();
              }}
              className="flex gap-2"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="guest@client.com"
                aria-label="Guest's email"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-orange-500 px-4 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-60"
              >
                {pending ? "Sharing…" : "Invite guest"}
              </button>
            </form>
          )}

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
          {outcome && <InviteResult outcomes={[outcome]} />}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Guests on this project</h3>
            {guestsHere.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No guests yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {guestsHere.map((p) => (
                  <li key={p.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
                    <Avatar name={displayName(p)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-slate-200">{displayName(p)}</span>
                      <span className="block truncate text-xs text-slate-500">{p.email}</span>
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => removeProjectMember(projectId, p.user_id))}
                        className="text-xs text-slate-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canManage && otherGuests.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Other guests in {workspaceName}</h3>
              <ul className="mt-2 space-y-1">
                {otherGuests.map((p) => (
                  <li key={p.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
                    <Avatar name={displayName(p)} />
                    <span className="min-w-0 flex-1 truncate text-slate-200">{displayName(p)}</span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => addProjectMember(projectId, p.user_id))}
                      className="text-xs font-medium text-orange-400 hover:text-orange-300"
                    >
                      Add to project
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-400">
            All {members.length} {members.length === 1 ? "member" : "members"} of {workspaceName} can already see and edit this project.
          </p>
        </div>
      </dialog>
    </>
  );
}
