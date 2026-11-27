"use client";

import { useState, useTransition } from "react";
import { NotificationRow } from "@/components/app/notification-list";
import { useWorkspace, useWorkspacePath } from "@/components/app/workspace-context";
import { listNotifications, markAllNotificationsRead, markNotificationsRead, type InboxEntry } from "@/server/notifications";
import Link from "next/link";

type Page = Awaited<ReturnType<typeof listNotifications>>;

export default function Inbox({ initial }: { initial: Page }) {
  const { slug } = useWorkspace();
  const path = useWorkspacePath();
  const [entries, setEntries] = useState(initial.entries);
  const [more, setMore] = useState(initial.more);
  const [unread, setUnread] = useState(initial.unread);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [pending, startTransition] = useTransition();

  const reload = (next: "all" | "unread") =>
    startTransition(async () => {
      const page = await listNotifications(slug, { unreadOnly: next === "unread" });
      setFilter(next);
      setEntries(page.entries);
      setMore(page.more);
      setUnread(page.unread);
    });

  const loadMore = () =>
    startTransition(async () => {
      const last = entries[entries.length - 1];
      if (!last) return;
      const page = await listNotifications(slug, { unreadOnly: filter === "unread", before: last.id });
      setEntries((list) => [...list, ...page.entries]);
      setMore(page.more);
    });

  const markRead = (entry: InboxEntry) => {
    if (entry.read_at) return;
    setEntries((list) => list.map((e) => (e.id === entry.id ? { ...e, read_at: new Date().toISOString() } : e)));
    setUnread((n) => Math.max(0, n - 1));
    void markNotificationsRead([entry.id]);
  };

  const readAll = () =>
    startTransition(async () => {
      await markAllNotificationsRead(slug);
      setEntries((list) => list.map((e) => ({ ...e, read_at: e.read_at ?? new Date().toISOString() })));
      setUnread(0);
    });

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Show" className="flex gap-1 rounded-lg border border-white/10 p-0.5">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => reload(f)}
              className={`rounded-md px-3 py-1 text-sm ${filter === f ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
            >
              {f === "all" ? "All" : `Unread${unread ? ` (${unread})` : ""}`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href={`${path("/settings")}#notifications`} className="text-slate-400 hover:text-white">
            Notification settings
          </Link>
          <button
            type="button"
            onClick={readAll}
            disabled={unread === 0 || pending}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-200 hover:bg-white/5 disabled:opacity-40"
          >
            Mark all read
          </button>
        </div>
      </div>

      <div className={`mt-4 rounded-xl border border-white/10 bg-slate-900/40 p-1 ${pending ? "opacity-60" : ""}`}>
        {entries.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">
            {filter === "unread" ? "Nothing unread. You're all caught up." : "No notifications yet. They show up here when someone assigns you a task or mentions you."}
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {entries.map((entry) => (
              <li key={entry.id}>
                <NotificationRow entry={entry} onOpen={markRead} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {more && (
        <button type="button" onClick={loadMore} disabled={pending} className="mt-4 w-full rounded-lg border border-white/10 py-2 text-sm text-slate-300 hover:bg-white/5">
          Show older
        </button>
      )}
    </div>
  );
}
