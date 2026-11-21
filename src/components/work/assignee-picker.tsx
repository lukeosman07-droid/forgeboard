"use client";

import { useState } from "react";
import { usePeople, useWorkspace } from "@/components/app/workspace-context";
import { ROLE_LABELS, displayName } from "@/lib/people";
import { Avatar, Popover } from "./ui";

/** What a pick changes on the task. A member sets assignee_id; a typed name clears it. */
export type AssigneeChange = { assignee: string | null; assignee_id: string | null };

// Chooses who owns a task: a workspace member, or a typed name for someone
// outside the workspace (a contractor, or a name the AI read in meeting notes).
//
// When a task carries a typed name and you pick a member for it, every other
// task in the project under that same name moves to the member too. That is how
// a name from old notes gets mapped to a real person in one click.
export default function AssigneePicker({
  assignee,
  assigneeId,
  onChange,
  variant = "inline",
}: {
  assignee: string | null;
  assigneeId: string | null;
  onChange: (change: AssigneeChange) => void;
  /** "cell" fills a table cell; "inline" sits in a form row. */
  variant?: "cell" | "inline";
}) {
  const { canEdit } = useWorkspace();
  const { people } = usePeople();
  const [text, setText] = useState("");

  const face = (
    <>
      <Avatar name={assignee} />
      {assignee ? (
        <span className="truncate text-slate-200">{assignee}</span>
      ) : (
        variant === "inline" && <span className="text-slate-500">{canEdit ? "Add owner" : "Unassigned"}</span>
      )}
    </>
  );

  if (!canEdit) {
    return (
      <span className={`flex items-center gap-2 ${variant === "cell" ? "h-full w-full justify-center px-2 text-xs" : "text-sm"}`}>{face}</span>
    );
  }

  const q = text.trim().toLowerCase();
  const matches = people.filter((p) => !q || displayName(p).toLowerCase().includes(q) || p.email?.toLowerCase().includes(q));
  const typedIsNew = q && !people.some((p) => displayName(p).toLowerCase() === q);
  const unmapped = assignee && !assigneeId;

  return (
    <Popover
      className={variant === "cell" ? "h-full w-full" : undefined}
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={(e) => {
            setText("");
            toggle(e);
          }}
          aria-label={`Owner: ${assignee ?? "unassigned"}. Change owner`}
          className={
            variant === "cell"
              ? "flex h-full w-full items-center justify-center gap-2 px-2 text-xs hover:bg-white/5"
              : "flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-white/5"
          }
        >
          {face}
        </button>
      )}
    >
      {(close) => {
        const pick = (change: AssigneeChange) => {
          onChange(change);
          close();
        };
        return (
          <div className="flex w-64 flex-col gap-1 p-1">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (matches.length === 1) pick({ assignee_id: matches[0].user_id, assignee: displayName(matches[0]) });
                else if (text.trim()) pick({ assignee_id: null, assignee: text.trim() });
              }}
              placeholder="Search people or type a name"
              aria-label="Search people or type a name"
              maxLength={200}
              className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none"
            />
            {unmapped && (
              <p className="px-2 py-1 text-xs text-slate-400">
                &ldquo;{assignee}&rdquo; isn&apos;t a member. Pick a person to move every &ldquo;{assignee}&rdquo; task in this project to
                them.
              </p>
            )}
            <ul className="max-h-56 overflow-y-auto" role="listbox" aria-label="People">
              {matches.map((p) => (
                <li key={p.user_id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={p.user_id === assigneeId}
                    onClick={() => pick({ assignee_id: p.user_id, assignee: displayName(p) })}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                      p.user_id === assigneeId ? "bg-white/10 text-white" : "text-slate-200 hover:bg-white/5"
                    }`}
                  >
                    <Avatar name={displayName(p)} />
                    <span className="min-w-0 flex-1 truncate">{displayName(p)}</span>
                    {p.role === "guest" && <span className="text-xs text-slate-500">{ROLE_LABELS.guest}</span>}
                  </button>
                </li>
              ))}
              {matches.length === 0 && !typedIsNew && <li className="px-2 py-1.5 text-sm text-slate-500">No people match.</li>}
            </ul>
            {typedIsNew && (
              <button
                type="button"
                onClick={() => pick({ assignee_id: null, assignee: text.trim() })}
                className="rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/5"
              >
                Use &ldquo;{text.trim()}&rdquo; <span className="text-slate-500">(not a member)</span>
              </button>
            )}
            {assignee && (
              <button
                type="button"
                onClick={() => pick({ assignee_id: null, assignee: null })}
                className="rounded-lg border-t border-white/10 px-2 py-1.5 text-left text-sm text-slate-400 hover:bg-white/5 hover:text-white"
              >
                Clear owner
              </button>
            )}
          </div>
        );
      }}
    </Popover>
  );
}
