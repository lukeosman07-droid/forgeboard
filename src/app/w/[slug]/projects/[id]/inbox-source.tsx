"use client";

import { useEffect, useState, useTransition } from "react";
import { formatDate } from "@/lib/dates";
import { listInboxDocuments, type InboxDocument } from "@/server/files";
import { enableInbox, getInbox, newInboxAddress, setOutsideSenders, type InboxInfo } from "@/server/inbox";

// The project's email address, and the emails that arrived at it. Picking one
// sends it to the AI like pasted notes.
export default function InboxSource({ projectId, onPick }: { projectId: string; onPick: (doc: InboxDocument) => void }) {
  const [inbox, setInbox] = useState<InboxInfo | null>(null);
  const [emails, setEmails] = useState<InboxDocument[] | null>(null);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    void Promise.all([getInbox(projectId), listInboxDocuments(projectId)]).then(([info, list]) => {
      if (!alive) return;
      setInbox(info);
      setEmails(list);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const act = (fn: () => Promise<{ error?: string; inbox?: InboxInfo }>) =>
    start(async () => {
      setError(undefined);
      const result = await fn();
      if (result.error) setError(result.error);
      if (result.inbox) setInbox(result.inbox);
    });

  if (!inbox || !emails) return <div className="h-32 animate-pulse rounded-xl bg-white/5" aria-label="Loading the inbox" />;

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
        {!inbox.enabled ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-300">Give this project an email address. Forward meeting minutes or threads to it and they show up here.</p>
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => enableInbox(projectId))}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-50"
            >
              Turn on the inbox
            </button>
          </div>
        ) : inbox.needsSetup || !inbox.address ? (
          <p className="text-sm text-slate-300">
            The inbox is on, but this server has no inbound email domain yet (INBOUND_EMAIL_DOMAIN), so there&apos;s no address to show. See
            docs/INBOUND_EMAIL.md.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Project email address</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-slate-900 px-2.5 py-1.5 text-sm text-orange-200" aria-label="Inbox address">
                {inbox.address}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(inbox.address!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="rounded-md border border-white/15 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/5"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm("Make a new address? The old one stops working right away.")) act(() => newInboxAddress(projectId));
                }}
                className="rounded-md px-2.5 py-1.5 text-xs text-slate-400 hover:bg-white/5 hover:text-white"
              >
                New address
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={inbox.allowOutsideSenders}
                disabled={pending}
                onChange={(e) => {
                  const allow = e.target.checked;
                  act(async () => {
                    const r = await setOutsideSenders(projectId, allow);
                    return r.error ? r : { inbox: { ...inbox, allowOutsideSenders: allow } };
                  });
                }}
                className="h-4 w-4 accent-orange-500"
              />
              Accept email from people outside the workspace
            </label>
            <p className="text-xs text-slate-500">
              {inbox.allowOutsideSenders
                ? "Anyone with the address can send to it."
                : "Only people in this workspace who can see the project can send to it. Others are ignored."}
            </p>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Received</p>
        {emails.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No emails yet.</p>
        ) : (
          <ul className="mt-2 space-y-2" aria-label="Inbox emails">
            {emails.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{doc.title || "(no subject)"}</p>
                  <p className="text-xs text-slate-500">
                    {doc.email_from ?? "unknown sender"} · {formatDate(doc.created_at.slice(0, 10))}
                    {doc.captured_at ? " · captured" : ""}
                  </p>
                </div>
                <button type="button" onClick={() => onPick(doc)} className="rounded-lg border border-orange-500/40 px-3 py-1.5 text-sm text-orange-200 hover:bg-orange-500/10">
                  ✨ Read with AI
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
