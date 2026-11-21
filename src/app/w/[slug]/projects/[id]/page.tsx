import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { withCurrentNames } from "@/lib/people";
import { createClient } from "@/lib/supabase/server";
import { hasPaidAccess, trialExtractionsLeft } from "@/lib/plans";
import { TASK_SELECT, toTask } from "@/lib/work";
import type { Item, Note, Profile, Project, Section } from "@/lib/types";
import { getWorkspace } from "@/lib/workspaces";
import ProjectWorkspace from "./project-workspace";
import { VIEW_IDS, type ViewId } from "./view-ids";

export const metadata: Metadata = { title: "Project – Forgeboard" };

export default function ProjectPage({ params, searchParams }: PageProps<"/w/[slug]/projects/[id]">) {
  return (
    <Suspense fallback={<ProjectSkeleton />}>
      <ProjectLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ProjectLoader({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug, id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();

  const access = await getWorkspace(slug);
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  if (!access) notFound();
  const { user } = access;

  // Row Level Security: a project the viewer can't see simply isn't found.
  // (For a guest, that is every project that hasn't been shared with them.)
  const [projectResult, sectionsResult, itemsResult, notesResult, profileResult, sharedResult] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle<Project>(),
    supabase.from("sections").select("*").eq("project_id", id).order("position").overrideTypes<Section[], { merge: false }>(),
    supabase.from("items").select(TASK_SELECT).eq("project_id", id).order("position").order("created_at"),
    supabase
      .from("notes")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .overrideTypes<Note[], { merge: false }>(),
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    supabase.from("project_members").select("user_id").eq("project_id", id).overrideTypes<{ user_id: string }[], { merge: false }>(),
  ]);

  if (!projectResult.data || projectResult.data.workspace_id !== access.workspace.id) notFound();

  const all = withCurrentNames(((itemsResult.data ?? []) as Item[]).map(toTask), access.people);
  const profile = profileResult.data;
  const view = typeof query.view === "string" && (VIEW_IDS as readonly string[]).includes(query.view) ? (query.view as ViewId) : "table";
  const taskParam = typeof query.task === "string" && UUID.test(query.task) ? query.task : null;

  return (
    <ProjectWorkspace
      // Remount when search opens a different task, so its panel opens.
      key={taskParam ?? "none"}
      project={projectResult.data}
      sections={sectionsResult.data ?? []}
      tasks={all.filter((i) => i.type === "action_item")}
      logItems={all.filter((i) => i.type !== "action_item")}
      notes={notesResult.data ?? []}
      usage={{
        paid: profile ? hasPaidAccess(profile) : false,
        trialLeft: profile ? trialExtractionsLeft(profile) : 0,
      }}
      sharedWith={(sharedResult.data ?? []).map((m) => m.user_id)}
      initialView={view}
      initialTaskId={taskParam}
    />
  );
}

function ProjectSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading project">
      <div className="h-9 w-80 rounded bg-white/5" />
      <div className="h-10 w-full max-w-xl rounded bg-white/5" />
      <div className="h-96 rounded-2xl bg-white/5" />
    </div>
  );
}
