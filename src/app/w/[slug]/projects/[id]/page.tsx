import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { withCurrentNames } from "@/lib/people";
import { createClient } from "@/lib/supabase/server";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { TASK_SELECT, isPlanTask, toTask } from "@/lib/work";
import type { Dependency, Milestone, Review, Rfi, SavedView, Submittal } from "@/lib/registers";
import type { Item, ProjectDocument, Project, Section } from "@/lib/types";
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

  // Row Level Security: a project the viewer can't see simply isn't found.
  // (For a guest, that is every project that hasn't been shared with them.)
  const [projectResult, sectionsResult, itemsResult, notesResult, sharedResult] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle<Project>(),
    supabase.from("sections").select("*").eq("project_id", id).order("position").overrideTypes<Section[], { merge: false }>(),
    supabase.from("items").select(TASK_SELECT).eq("project_id", id).order("position").order("created_at"),
    supabase
      .from("documents")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .overrideTypes<ProjectDocument[], { merge: false }>(),
    supabase.from("project_members").select("user_id").eq("project_id", id).overrideTypes<{ user_id: string }[], { merge: false }>(),
  ]);
  // Phase 5: registers, milestones, reviews, dependencies and saved views.
  // Each falls back to empty, so the page still works before the migration.
  const [rfis, submittals, milestones, reviews, dependencies, views] = await Promise.all([
    supabase.from("rfis").select("*").eq("project_id", id).order("number", { ascending: false }).overrideTypes<Rfi[], { merge: false }>(),
    supabase.from("submittals").select("*").eq("project_id", id).order("number", { ascending: false }).overrideTypes<Submittal[], { merge: false }>(),
    supabase.from("milestones").select("*").eq("project_id", id).order("due_on").overrideTypes<Milestone[], { merge: false }>(),
    supabase.from("reviews").select("*").eq("project_id", id).order("number", { ascending: false }).overrideTypes<Review[], { merge: false }>(),
    supabase
      .from("item_dependencies")
      .select("id, predecessor_id, successor_id")
      .eq("project_id", id)
      .overrideTypes<Dependency[], { merge: false }>(),
    supabase.from("saved_views").select("*").eq("project_id", id).order("name").overrideTypes<SavedView[], { merge: false }>(),
  ]);

  if (!projectResult.data || projectResult.data.workspace_id !== access.workspace.id) notFound();

  const all = withCurrentNames(((itemsResult.data ?? []) as Item[]).map(toTask), access.people);
  const view = typeof query.view === "string" && (VIEW_IDS as readonly string[]).includes(query.view) ? (query.view as ViewId) : "table";
  const taskParam = typeof query.task === "string" && UUID.test(query.task) ? query.task : null;
  const registerParam = [query.rfi, query.submittal].find((v): v is string => typeof v === "string" && UUID.test(v)) ?? null;
  // Filters and sort live in the address bar, so a saved view or shared link reopens the same list.
  const filterQuery = filtersToQuery(parseFilters(query));

  return (
    <ProjectWorkspace
      // Remount when search opens a different task, so its panel opens.
      key={`${taskParam ?? "none"}-${registerParam ?? ""}`}
      project={projectResult.data}
      sections={sectionsResult.data ?? []}
      tasks={all.filter(isPlanTask)}
      logItems={all.filter((i) => i.type !== "action_item")}
      notes={notesResult.data ?? []}
      usage={{
        runsLeft: Math.max(0, access.plan.aiRuns - access.plan.aiRunsUsed),
        runsLimit: access.plan.aiRuns,
      }}
      sharedWith={(sharedResult.data ?? []).map((m) => m.user_id)}
      initialView={view}
      initialTaskId={taskParam}
      initialQuery={filterQuery}
      initialRegisterId={registerParam}
      extras={{
        projectId: id,
        rfis: rfis.data ?? [],
        submittals: submittals.data ?? [],
        milestones: milestones.data ?? [],
        reviews: reviews.data ?? [],
        reviewComments: all.filter((i) => !!i.review_id),
        dependencies: dependencies.data ?? [],
        views: views.data ?? [],
        registers: access.plan.features.registers,
      }}
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
