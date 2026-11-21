"use client";

import { useState, useTransition } from "react";
import InviteResult from "@/components/app/invite-result";
import { useWorkspace } from "@/components/app/workspace-context";
import { Avatar } from "@/components/work/ui";
import { ROLE_HELP, ROLE_LABELS, displayName, usesSeat } from "@/lib/people";
import type { Invite, Person, Role } from "@/lib/types";
import {
  inviteMembers,
  leaveWorkspace,
  removeMember,
  renameWorkspace,
  resendInvite,
  revokeInvite,
  setMemberRole,
  transferOwnership,
  type InviteOutcome,
} from "@/server/members";

type PendingInvite = Omit<Invite, "accepted_at" | "revoked_at"> & { project_name: string | null };
type Result = { error?: string } | undefined | void;

// The Members page: who's in the workspace, what they can do, and invites.
// Buttons only appear for people allowed to use them; the database functions
// behind each action check the same rules again.
export default function MembersPanel({
  seats,
  invites,
  emailReady,
}: {
  seats: { used: number; limit: number };
  invites: PendingInvite[];
  emailReady: boolean;
}) {
  const ws = useWorkspace();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [outcomes, setOutcomes] = useState<InviteOutcome[]>();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<Result>, done?: string) => {
    setError(undefined);
    setNotice(undefined);
    setOutcomes(undefined);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
      else if (done) setNotice(done);
    });
  };

  const isOwner = ws.role === "owner";
  const members = ws.people.filter((p) => usesSeat(p.role));
  const guests = ws.people.filter((p) => !usesSeat(p.role));
  const pendingSeats = invites.filter((i) => usesSeat(i.role)).length;

  return (
    <div className="space-y-8">
      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      {ws.isAdmin && <RenameCard pending={pending} run={run} />}

      {ws.isAdmin && (
        <InviteCard
          seats={seats}
          pendingSeats={pendingSeats}
          emailReady={emailReady}
          isOwner={isOwner}
          pending={pending}
          outcomes={outcomes}
          onInvite={(emails, role) =>
            run(async () => {
              const result = await inviteMembers(ws.slug, emails, role);
              if (result.outcomes) setOutcomes(result.outcomes);
              return result.outcomes ? undefined : result;
            })
          }
        />
      )}

      <Section title={`Members (${members.length})`} aside={<SeatCount used={seats.used} limit={seats.limit} />}>
        <PeopleList people={members} pending={pending} run={run} />
      </Section>

      <Section title={`Guests (${guests.length})`} aside={<span className="text-xs text-slate-500">Free. They see only shared projects.</span>}>
        {guests.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">No guests. Share a project from its page to add one.</p>
        ) : (
          <PeopleList people={guests} pending={pending} run={run} />
        )}
      </Section>

      {invites.length > 0 && (
        <Section title={`Pending invites (${invites.length})`}>
          <ul className="divide-y divide-white/5">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-200">{invite.email}</span>
                  <span className="block text-xs text-slate-500">
                    {ROLE_LABELS[invite.role]}
                    {invite.project_name && ` on ${invite.project_name}`} · expires {new Date(invite.expires_at).toLocaleDateString()}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const result = await resendInvite(ws.slug, invite.id);
                      if (result.outcome) setOutcomes([result.outcome]);
                      return result;
                    })
                  }
                  className="rounded-md px-2 py-1 text-xs font-medium text-orange-400 hover:bg-white/5 hover:text-orange-300"
                >
                  {emailReady ? "Resend" : "New link"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => revokeInvite(invite.id), `Invite to ${invite.email} cancelled.`)}
                  className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-red-300"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
          {outcomes && !ws.isAdmin && <div className="p-4"><InviteResult outcomes={outcomes} /></div>}
        </Section>
      )}

      {!isOwner && (
        <section className="rounded-2xl border border-red-500/25 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">Leave {ws.name}</h2>
          <p className="mt-1 text-sm text-slate-400">You&apos;ll lose access to its projects. Tasks assigned to you keep your name.</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Leave ${ws.name}? You'll need a new invite to come back.`)) run(() => leaveWorkspace(ws.slug));
            }}
            className="mt-4 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10"
          >
            Leave workspace
          </button>
        </section>
      )}
    </div>
  );
}

function PeopleList({ people, pending, run }: { people: Person[]; pending: boolean; run: (a: () => Promise<Result>, done?: string) => void }) {
  const ws = useWorkspace();
  const isOwner = ws.role === "owner";

  return (
    <ul className="divide-y divide-white/5">
      {people.map((p) => {
        const me = p.user_id === ws.userId;
        const name = displayName(p);
        // Admins manage members and guests; only the owner manages admins.
        const canManage = !me && p.role !== "owner" && ws.isAdmin && (isOwner || p.role !== "admin");
        const roles: Exclude<Role, "owner">[] = isOwner ? ["admin", "member", "guest"] : ["member", "guest"];

        return (
          <li key={p.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-slate-200">
                {name} {me && <span className="text-slate-500">(you)</span>}
              </span>
              <span className="block truncate text-xs text-slate-500">{p.email}</span>
            </span>

            {canManage ? (
              <select
                value={p.role}
                disabled={pending}
                aria-label={`Role for ${name}`}
                title={ROLE_HELP[p.role]}
                onChange={(e) => run(() => setMemberRole(ws.slug, p.user_id, e.target.value), `${name} is now ${ROLE_LABELS[e.target.value as Role].toLowerCase()}.`)}
                className="rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 text-sm text-slate-200"
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-slate-400" title={ROLE_HELP[p.role]}>
                {ROLE_LABELS[p.role]}
              </span>
            )}

            {isOwner && !me && p.role !== "guest" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Make ${name} the owner of ${ws.name}? You'll become an admin and they'll control billing.`)) {
                    run(() => transferOwnership(ws.slug, p.user_id), `${name} now owns ${ws.name}.`);
                  }
                }}
                className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-white"
              >
                Make owner
              </button>
            )}
            {canManage && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Remove ${name} from ${ws.name}? Their tasks keep their name.`)) {
                    run(() => removeMember(ws.slug, p.user_id), `${name} was removed.`);
                  }
                }}
                className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-red-300"
              >
                Remove
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function InviteCard({
  seats,
  pendingSeats,
  emailReady,
  isOwner,
  pending,
  outcomes,
  onInvite,
}: {
  seats: { used: number; limit: number };
  pendingSeats: number;
  emailReady: boolean;
  isOwner: boolean;
  pending: boolean;
  outcomes?: InviteOutcome[];
  onInvite: (emails: string, role: string) => void;
}) {
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState("member");
  const free = Math.max(0, seats.limit - seats.used - pendingSeats);

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
      <h2 className="text-lg font-semibold text-white">Invite people</h2>
      <p className="mt-1 text-sm text-slate-400">
        {free} {free === 1 ? "seat" : "seats"} free{pendingSeats > 0 && ` (${pendingSeats} held by pending invites)`}. Guests don&apos;t use a seat.
        {!emailReady && " Email isn't set up yet, so you'll get a link to send yourself."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onInvite(emails, role);
          setEmails("");
        }}
        className="mt-4 space-y-3"
      >
        <textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          required
          rows={2}
          placeholder="name@firm.com, another@firm.com"
          aria-label="Email addresses"
          className="block w-full rounded-lg border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-label="Role for new people"
            className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
          >
            {(isOwner ? (["admin", "member", "guest"] as const) : (["member", "guest"] as const)).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <span className="min-w-0 flex-1 text-xs text-slate-500">{ROLE_HELP[role as Role]}</span>
          <button
            type="submit"
            disabled={pending || !emails.trim()}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send invites"}
          </button>
        </div>
      </form>
      {outcomes && (
        <div className="mt-4">
          <InviteResult outcomes={outcomes} />
        </div>
      )}
    </section>
  );
}

function RenameCard({ pending, run }: { pending: boolean; run: (a: () => Promise<Result>, done?: string) => void }) {
  const ws = useWorkspace();
  const [name, setName] = useState(ws.name);

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
      <h2 className="text-lg font-semibold text-white">Workspace</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => renameWorkspace(ws.slug, name), "Workspace renamed.");
        }}
        className="mt-4 flex flex-wrap gap-3"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          aria-label="Workspace name"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-3.5 py-2 text-sm text-white focus:border-orange-500/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !name.trim() || name.trim() === ws.name}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-50"
        >
          Save name
        </button>
      </form>
      <p className="mt-2 text-xs text-slate-500">The web address (/w/{ws.slug}) stays the same, so links keep working.</p>
    </section>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function SeatCount({ used, limit }: { used: number; limit: number }) {
  const full = used >= limit;
  return (
    <span className={`text-xs ${full ? "text-amber-300" : "text-slate-400"}`}>
      {used} of {limit} seats used
    </span>
  );
}
