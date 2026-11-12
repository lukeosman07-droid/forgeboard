import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Item, Profile, Project } from "@/lib/types";
import { TASK_SELECT, toTask } from "@/lib/work";

export type ProjectSummary = Pick<Project, "id" | "name" | "color" | "description" | "created_at">;

// Everything the Home and My Work pages need, in one round of queries.
// Row Level Security means these only ever return this user's rows.
export async function loadWorkspace() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) redirect("/login");

  const [profile, projects, items] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    supabase.from("projects").select("id, name, color, description, created_at").order("created_at", { ascending: false }),
    supabase.from("items").select(TASK_SELECT).eq("type", "action_item").order("due_date", { nullsFirst: false }).order("position"),
  ]);

  return {
    user,
    profile: profile.data,
    projects: (projects.data ?? []) as ProjectSummary[],
    tasks: ((items.data ?? []) as Item[]).map(toTask),
    failed: !!(profile.error || projects.error || items.error),
  };
}
