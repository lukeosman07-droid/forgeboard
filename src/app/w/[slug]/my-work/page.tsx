import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { loadWorkspaceData } from "@/lib/workspace";
import { getWorkspace } from "@/lib/workspaces";
import MyWork from "./my-work";

export const metadata: Metadata = { title: "My work – Forgeboard" };

export default function MyWorkPage({ params }: PageProps<"/w/[slug]/my-work">) {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-bold tracking-tight text-white">My work</h1>
      <p className="mt-1 text-slate-400">Tasks across this workspace&apos;s projects, sorted by when they&apos;re due.</p>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-xl bg-white/5" />}>
        <MyWorkLoader params={params} />
      </Suspense>
    </div>
  );
}

async function MyWorkLoader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await getWorkspace(slug);
  if (!access) notFound();
  const { projects, tasks } = await loadWorkspaceData(access.workspace.id, access.user.id, access.people);
  return <MyWork projects={projects} tasks={tasks} />;
}
