"use server";

import type { Project, Task } from "@/lib/types";
import { session, workspaceFor } from "./session";

// Search for the command palette, limited to one workspace. Row Level Security
// further limits a guest to the projects shared with them.

export type SearchResults = {
  projects: Pick<Project, "id" | "name" | "color">[];
  tasks: (Pick<Task, "id" | "title" | "status" | "project_id"> & { project_name: string })[];
};

const EMPTY: SearchResults = { projects: [], tasks: [] };

export async function searchWorkspace(slug: string, query: string): Promise<SearchResults> {
  const q = query.trim().slice(0, 100);
  const { supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return EMPTY;

  // Escape the characters that are special in ILIKE patterns.
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  const [projects, tasks] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, color")
      .eq("workspace_id", workspace.id)
      .ilike("name", pattern)
      .order("created_at", { ascending: false })
      .limit(5),
    q
      ? supabase
          .from("items")
          .select("id, title, status, project_id, projects(name)")
          .eq("workspace_id", workspace.id)
          .eq("type", "action_item")
          .ilike("title", pattern)
          .order("created_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    projects: (projects.data ?? []) as SearchResults["projects"],
    tasks: ((tasks.data ?? []) as unknown as (SearchResults["tasks"][number] & { projects: { name: string } | null })[]).map(
      ({ projects: p, ...t }) => ({ ...t, project_name: p?.name ?? "" }),
    ),
  };
}
