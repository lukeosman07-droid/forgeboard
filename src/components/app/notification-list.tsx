"use client";

import Link from "next/link";
import { timeAgo } from "@/lib/activity";
import { notificationHeadline, taskPath } from "@/lib/notifications";
import { displayName } from "@/lib/people";
import type { InboxEntry } from "@/server/notifications";
import { Avatar } from "@/components/work/ui";
import { usePeople, useWorkspace } from "./workspace-context";

// One notification, as a link to its task. Shared by the bell and the Inbox.

export function NotificationRow({ entry, onOpen, compact = false }: { entry: InboxEntry; onOpen: (entry: InboxEntry) => void; compact?: boolean }) {
  const { byId } = usePeople();
  const { slug } = useWorkspace();
  const actor = entry.actor_id ? byId.get(entry.actor_id) : undefined;
  const actorName = actor ? displayName(actor) : null;
  const headline = notificationHeadline(entry.type, actorName, entry.data ?? {});
  const unread = !entry.read_at;
  const href = entry.project_id && entry.item_id ? taskPath(slug, entry.project_id, entry.item_id) : `/w/${slug}`;

  return (
    <Link
      href={href}
      onClick={() => onOpen(entry)}
      className={`flex items-start gap-3 rounded-lg px-3 ${compact ? "py-2" : "py-3"} text-sm hover:bg-white/5 ${unread ? "" : "opacity-70"}`}
    >
      <Avatar name={actorName ?? "?"} />
      <span className="min-w-0 flex-1">
        <span className={`block ${unread ? "font-medium text-white" : "text-slate-300"}`}>{headline}</span>
        <span className="block truncate text-xs text-slate-400">
          {entry.item_title ?? "A task"}
          {entry.project_name && <span className="text-slate-500"> · {entry.project_name}</span>}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <time dateTime={entry.created_at} className="text-[11px] text-slate-500">
          {timeAgo(entry.created_at)}
        </time>
        {unread && <span className="h-2 w-2 rounded-full bg-orange-500" aria-label="Unread" />}
      </span>
    </Link>
  );
}
