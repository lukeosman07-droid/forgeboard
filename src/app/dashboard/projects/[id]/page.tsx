import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPaidAccess, trialExtractionsLeft } from "@/lib/plans";
import type { Item, Note, Profile, Project } from "@/lib/types";
import ProjectWorkspace from "./project-workspace";

export const metadata: Metadata = { title: "Project – Forgeboard" };

export default function ProjectPage({ params }: PageProps<"/dashboard/projects/[id]">) {
  return (
    <Suspense fallback={<ProjectSkeleton />}>
      <ProjectLoader params={params} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ProjectLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) redirect("/login");

  // Row Level Security: a project that isn't the user's simply isn't found.
  const [projectResult, itemsResult, notesResult, profileResult] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle<Project>(),
    supabase.from("items").select("*").eq("project_id", id).order("created_at").overrideTypes<Item[], { merge: false }>(),
    supabase
      .from("notes")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .overrideTypes<Note[], { merge: false }>(),
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
  ]);

  if (!projectResult.data) notFound();

  const profile = profileResult.data;
  const usage = {
    paid: profile ? hasPaidAccess(profile) : false,
    trialLeft: profile ? trialExtractionsLeft(profile) : 0,
  };

  return (
    <ProjectWorkspace
      project={projectResult.data}
      items={itemsResult.data ?? []}
      notes={notesResult.data ?? []}
      usage={usage}
    />
  );
}

function ProjectSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading project">
      <div className="h-5 w-24 rounded bg-white/5" />
      <div className="h-9 w-80 rounded bg-white/5" />
      <div className="h-40 rounded-2xl bg-white/5" />
      <div className="h-10 w-full rounded bg-white/5" />
      <div className="h-64 rounded-2xl bg-white/5" />
    </div>
  );
}
