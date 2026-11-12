import type { Metadata } from "next";
import { Suspense } from "react";
import { loadWorkspace } from "@/lib/workspace";
import MyWork from "./my-work";

export const metadata: Metadata = { title: "My work – Forgeboard" };

export default function MyWorkPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-bold tracking-tight text-white">My work</h1>
      <p className="mt-1 text-slate-400">Every task across your projects, sorted by when it&apos;s due.</p>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-xl bg-white/5" />}>
        <MyWorkLoader />
      </Suspense>
    </div>
  );
}

async function MyWorkLoader() {
  const { projects, tasks } = await loadWorkspace();
  return <MyWork projects={projects} tasks={tasks} />;
}
