"use client";

import Link from "next/link";
import { usePeople, useWorkspacePath } from "@/components/app/workspace-context";
import { describeActivity, timeAgo, type ActivityLookups } from "@/lib/activity";
import { displayName } from "@/lib/people";
import type { Activity } from "@/lib/types";
import { Avatar } from "./ui";

// Who changed what and when, for the task panel (one task) and the project
// feed (every task, with links).

export default function ActivityList({
  entries,
  sections = [],
  withTitles = false,
  empty = "No changes yet.",
}: {
  entries: Activity[];
  sections?: { id: string; name: string }[];
  /** Project feed: name each task and link to it. */
  withTitles?: boolean;
  empty?: string;
}) {
  const { byId } = usePeople();
  const path = useWorkspacePath();
  const lookups: ActivityLookups = {
    personName: (id) => {
      const p = byId.get(id);
      return p ? displayName(p) : null;
    },
    sectionName: (id) => sections.find((s) => s.id === id)?.name ?? null,
  };

  if (entries.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;

  return (
    <ol className="space-y-2.5" aria-label="History">
      {entries.map((entry) => {
        const actor = entry.actor_id ? byId.get(entry.actor_id) : undefined;
        const name = actor ? displayName(actor) : entry.actor_id ? "Former member" : "Someone";
        const text = describeActivity(entry, lookups, withTitles);
        const when = new Date(entry.created_at);
        return (
          <li key={entry.id} className="flex items-start gap-2.5 text-sm">
            <Avatar name={name} />
            <p className="min-w-0 flex-1 text-slate-400">
              <span className="font-medium text-slate-200">{name}</span>{" "}
              {withTitles && entry.item_id && entry.verb !== "deleted" ? (
                <Link href={path(`/projects/${entry.project_id}?view=table&task=${entry.item_id}`)} className="hover:text-white">
                  {text}
                </Link>
              ) : (
                text
              )}{" "}
              <time dateTime={entry.created_at} title={when.toLocaleString()} className="whitespace-nowrap text-xs text-slate-500">
                · {timeAgo(entry.created_at)}
              </time>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
