"use server";

import { z } from "zod";
import type { ItemStatus, ItemType, Project } from "@/lib/types";
import { session, workspaceFor } from "./session";

// Search for the command palette, limited to one workspace. Projects match by
// name; tasks, comments and meeting notes use full-text search in the database
// (search_workspace), which runs as the caller, so Row Level Security still
// limits a guest to the projects shared with them.

export type SearchMatch = {
  kind: "task" | "comment" | "document";
  id: string;
  item_id: string | null;
  project_id: string;
  project_name: string;
  title: string;
  /** Matching words are wrapped in « and ». */
  snippet: string | null;
  item_type: ItemType | null;
  status: ItemStatus | null;
};

export type SearchResults = {
  projects: Pick<Project, "id" | "name" | "color">[];
  matches: SearchMatch[];
};

const EMPTY: SearchResults = { projects: [], matches: [] };

export async function searchWorkspace(slug: string, query: string): Promise<SearchResults> {
  const parsed = z.string().max(500).safeParse(query);
  if (!parsed.success) return EMPTY;
  const q = parsed.data.trim().slice(0, 100);
  const { supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return EMPTY;

  // Escape the characters that are special in ILIKE patterns.
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  const [projects, matches] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, color")
      .eq("workspace_id", workspace.id)
      .ilike("name", pattern)
      .order("created_at", { ascending: false })
      .limit(5),
    q ? supabase.rpc("search_workspace", { ws: workspace.id, q, p_limit: 12 }) : Promise.resolve({ data: [] }),
  ]);

  // One row per task: a task that matches on its title and in a comment shows once.
  const seen = new Set<string>();
  const unique = ((matches.data ?? []) as SearchMatch[]).filter((m) => {
    const key = m.item_id ?? `document-${m.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    projects: (projects.data ?? []) as SearchResults["projects"],
    matches: unique.slice(0, 12),
  };
}
