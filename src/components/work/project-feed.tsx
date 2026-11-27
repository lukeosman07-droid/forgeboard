"use client";

import { useEffect, useState, useTransition } from "react";
import { getProjectActivity } from "@/server/tasks";
import type { Activity, Section } from "@/lib/types";
import ActivityList from "./activity-list";

// The project's recent activity. Reloads whenever the page's data changes
// (your edits, and other people's through the realtime listener).

export default function ProjectFeed({ projectId, sections, version }: { projectId: string; sections: Pick<Section, "id" | "name">[]; version: unknown }) {
  const [entries, setEntries] = useState<Activity[] | null>(null);
  const [more, setMore] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    getProjectActivity(projectId)
      .then((list) => {
        if (!alive) return;
        setEntries(list);
        setMore(list.length === 30);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId, version]);

  const loadMore = () =>
    startTransition(async () => {
      const last = entries?.[entries.length - 1];
      if (!last) return;
      const older = await getProjectActivity(projectId, last.id);
      setEntries((list) => [...(list ?? []), ...older]);
      setMore(older.length === 30);
    });

  if (entries === null) return <div className="h-24 animate-pulse rounded bg-white/5" />;
  return (
    <>
      <ActivityList entries={entries} sections={sections} withTitles empty="No activity yet. Changes to tasks and new updates show up here." />
      {more && (
        <button type="button" onClick={loadMore} disabled={pending} className="mt-3 text-xs text-orange-400 hover:text-orange-300 disabled:opacity-50">
          {pending ? "Loading…" : "Show older"}
        </button>
      )}
    </>
  );
}
