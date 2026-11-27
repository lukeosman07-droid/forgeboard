"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { onItemsChanged } from "@/lib/live-events";
import { createClient } from "@/lib/supabase/client";
import { listNotifications, markAllNotificationsRead, markNotificationsRead, unreadNotificationCount, type InboxEntry } from "@/server/notifications";
import { Icon, Popover } from "@/components/work/ui";
import { NotificationRow } from "./notification-list";
import { useWorkspace, useWorkspacePath } from "./workspace-context";

// The bell in the top bar: unread count (kept live with Supabase Realtime) and
// the latest notifications, with a link to the full Inbox.

export default function NotificationBell() {
  const { slug, userId, id: workspaceId } = useWorkspace();
  const path = useWorkspacePath();
  const [unread, setUnread] = useState(0);
  const [entries, setEntries] = useState<InboxEntry[] | null>(null);

  const refreshCount = useCallback(() => {
    unreadNotificationCount(slug)
      .then(setUnread)
      .catch(() => {});
  }, [slug]);

  const load = useCallback(() => {
    listNotifications(slug)
      .then((r) => {
        setEntries(r.entries.slice(0, 8));
        setUnread(r.unread);
      })
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    refreshCount();
    const changed = () => {
      refreshCount();
      setEntries(null); // reload the list next time it opens
    };
    // Backups for the live connection: re-check when tasks on this page change
    // (comments create most notifications), when the tab comes back into view,
    // and once a minute.
    const stopItems = onItemsChanged(changed);
    const onVisible = () => document.visibilityState === "visible" && refreshCount();
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => document.visibilityState === "visible" && refreshCount(), 60_000);

    let supabase: ReturnType<typeof createClient> | null = null;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    try {
      supabase = createClient();
      channel = supabase
        .channel(`notifications:${userId}:${workspaceId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, changed)
        .subscribe();
    } catch {
      // Supabase isn't configured (local demo without env vars).
    }
    return () => {
      stopItems();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [refreshCount, userId, workspaceId]);

  const open = (entry: InboxEntry) => {
    if (entry.read_at) return;
    setUnread((n) => Math.max(0, n - 1));
    setEntries((list) => list?.map((e) => (e.id === entry.id ? { ...e, read_at: new Date().toISOString() } : e)) ?? null);
    void markNotificationsRead([entry.id]);
  };

  const readAll = () => {
    setUnread(0);
    setEntries((list) => list?.map((e) => ({ ...e, read_at: e.read_at ?? new Date().toISOString() })) ?? null);
    void markAllNotificationsRead(slug);
  };

  return (
    <Popover
      align="right"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={(e) => {
            if (entries === null) load();
            toggle(e);
          }}
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
        >
          <Icon name="bell" className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-slate-950">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div className="w-80 max-w-[calc(100vw-2rem)]">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={readAll} className="text-xs text-orange-300 hover:text-orange-200">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto" onClick={(e) => (e.target as HTMLElement).closest("a") && close()}>
            {entries === null ? (
              <div className="space-y-2 p-3">
                <div className="h-10 animate-pulse rounded bg-white/5" />
                <div className="h-10 animate-pulse rounded bg-white/5" />
              </div>
            ) : entries.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">You&apos;re all caught up.</p>
            ) : (
              entries.map((entry) => <NotificationRow key={entry.id} entry={entry} onOpen={open} compact />)
            )}
          </div>
          <Link
            href={path("/inbox")}
            onClick={close}
            className="block border-t border-white/10 px-3 py-2 text-center text-xs font-medium text-slate-300 hover:text-white"
          >
            Open Inbox
          </Link>
        </div>
      )}
    </Popover>
  );
}
