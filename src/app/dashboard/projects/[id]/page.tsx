import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPaidAccess, trialExtractionsLeft } from "@/lib/plans";
import { TASK_SELECT, toTask } from "@/lib/work";
import type { Item, Note, Profile, Project, Section } from "@/lib/types";
import ProjectWorkspace from "./project-workspace";
import { VIEW_IDS, type ViewId } from "./view-ids";

export const metadata: Metadata = { title: "Project – Forgeboard" };

export default function ProjectPage({ params, searchParams }: PageProps<"/dashboard/projects/[id]">) {
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
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();

  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) redirect("/login");

  // Row Level Security: a project that isn't the user's simply isn't found.
  const [projectResult, sectionsResult, itemsResult, notesResult, profileResult] = await Promise.all([
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
  ]);

  if (!projectResult.data) notFound();

  const all = ((itemsResult.data ?? []) as Item[]).map(toTask);
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
