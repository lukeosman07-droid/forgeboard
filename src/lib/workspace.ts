import "server-only";
import { withCurrentNames } from "@/lib/people";
import { createClient } from "@/lib/supabase/server";
import type { Item, Person, Profile, Project } from "@/lib/types";
import { TASK_SELECT, toTask } from "@/lib/work";

export type ProjectSummary = Pick<Project, "id" | "name" | "color" | "description" | "created_at">;

// Everything the Home and My Work pages need for one workspace, in one round of
// queries. Row Level Security limits a guest to the projects shared with them.
export async function loadWorkspaceData(workspaceId: string, userId: string, people: Person[]) {
  const supabase = await createClient();
  if (!supabase) return { profile: null, projects: [], tasks: [], failed: true };

  const [profile, projects, items] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>(),
    supabase
      .from("projects")
      .select("id, name, color, description, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("items")
      .select(TASK_SELECT)
      .eq("workspace_id", workspaceId)
      .eq("type", "action_item")
      .order("due_date", { nullsFirst: false })
      .order("position"),
  ]);

  return {
    profile: profile.data,
    projects: (projects.data ?? []) as ProjectSummary[],
    tasks: withCurrentNames(((items.data ?? []) as Item[]).map(toTask), people),
    failed: !!(profile.error || projects.error || items.error),
  };
}
