"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePeople, useWorkspace } from "@/components/app/workspace-context";
import { announceItemsChanged } from "@/lib/live-events";
import { displayName } from "@/lib/people";
import { createClient } from "@/lib/supabase/client";
import { useTaskStore } from "./task-store";
import { Avatar } from "./ui";

// Keeps a project page live. Listens to Supabase Realtime for changes to this
// project's tasks, sections, subtasks and comments, then refreshes the page
// (debounced) and tells an open task panel to reload. Row Level Security
// decides which changes each viewer receives. Also shows who else is here.

const REFRESH_DELAY = 300;

type Row = { id?: string; item_id?: string; project_id?: string };

export default function ProjectLive({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { userId, id: workspaceId } = useWorkspace();
  const { byId } = usePeople();
  const { tasks } = useTaskStore();
  const taskIds = useRef(new Set<string>());
  const [here, setHere] = useState<string[]>([]);

  useEffect(() => {
    taskIds.current = new Set(tasks.map((t) => t.id));
  }, [tasks]);

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return; // Supabase isn't configured (local demo without env vars).
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<string>();
    const schedule = (ids: (string | undefined)[] = []) => {
      for (const id of ids) if (id) pending.add(id);
      clearTimeout(timer);
      timer = setTimeout(() => {
        announceItemsChanged([...pending]);
        pending.clear();
        router.refresh();
      }, REFRESH_DELAY);
    };
    const ours = (row: Row | undefined) => !!row?.item_id && taskIds.current.has(row.item_id);

    const channel = supabase
      .channel(`project:${projectId}`, { config: { presence: { key: userId } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "items", filter: `project_id=eq.${projectId}` }, (p) =>
        schedule([(p.new as Row).id]),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "items", filter: `project_id=eq.${projectId}` }, (p) =>
        schedule([(p.new as Row).id]),
      )
      // Deletes carry only the row's ID and can't be filtered, so check it's one of ours.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "items" }, (p) => {
        const id = (p.old as Row).id;
        if (id && taskIds.current.has(id)) schedule([id]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sections", filter: `project_id=eq.${projectId}` }, () => schedule())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "sections" }, () => schedule())
      .on("postgres_changes", { event: "*", schema: "public", table: "subtasks", filter: `workspace_id=eq.${workspaceId}` }, (p) => {
        if (p.eventType === "DELETE") schedule([...taskIds.current]);
        else if (ours(p.new as Row)) schedule([(p.new as Row).item_id]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "item_comments", filter: `workspace_id=eq.${workspaceId}` }, (p) => {
        if (p.eventType === "DELETE") schedule([...taskIds.current]);
        else if (ours(p.new as Row)) schedule([(p.new as Row).item_id]);
      })
      .on("presence", { event: "sync" }, () => {
        setHere(Object.keys(channel.presenceState()).filter((id) => id !== userId));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ online_at: new Date().toISOString() });
      });

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [projectId, workspaceId, userId, router]);

  if (here.length === 0) return null;
  const names = here.map((id) => {
    const p = byId.get(id);
    return p ? displayName(p) : "Someone";
  });
  return (
    <div className="mt-1.5 flex items-center" aria-label={`Also viewing: ${names.join(", ")}`} title={`Also viewing: ${names.join(", ")}`}>
      <span className="relative mr-1.5 flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <div className="flex -space-x-1.5">
        {names.slice(0, 4).map((name, i) => (
          <span key={here[i]} className="rounded-full ring-2 ring-slate-950">
            <Avatar name={name} />
          </span>
        ))}
      </div>
      {names.length > 4 && <span className="ml-1.5 text-xs text-slate-400">+{names.length - 4}</span>}
    </div>
  );
}
