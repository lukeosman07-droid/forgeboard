"use client";

import Link from "next/link";
import { useState } from "react";
import { useWorkspacePath } from "@/components/app/workspace-context";
import type { InviteOutcome } from "@/server/members";

// What happened to each invite just sent. When email isn't set up (or a send
// failed) the link is shown so it can be passed on by hand. It is only
// available here, once: the database keeps a hash, not the link.
export default function InviteResult({ outcomes }: { outcomes: InviteOutcome[] }) {
  const path = useWorkspacePath();
  return (
    <ul className="space-y-2" aria-label="Invite results">
      {outcomes.map((o) => (
        <li
          key={o.email}
          className={`rounded-lg border px-3 py-2 text-sm ${
            o.error ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          <p>
            <span className="font-medium">{o.email}</span>
            {o.error ? `: ${o.error}` : o.emailed ? ": invite emailed." : ": invite created. Email isn't set up, so send them this link:"}
          </p>
          {o.upgrade && (
            <Link href={path("/billing")} className="mt-1 inline-block font-semibold text-orange-300 underline hover:text-orange-200">
              Upgrade for more seats →
            </Link>
          )}
          {!o.error && !o.emailed && o.link && <CopyLink link={o.link} />}
        </li>
      ))}
    </ul>
  );
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex gap-2">
      <input
        readOnly
        value={link}
        aria-label="Invite link"
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 font-mono text-xs text-slate-200"
      />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(link).catch(() => {});
          setCopied(true);
        }}
        className="rounded-md border border-white/15 px-2.5 text-xs font-medium text-white hover:bg-white/5"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
