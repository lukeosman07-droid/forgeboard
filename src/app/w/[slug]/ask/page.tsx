import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getWorkspace } from "@/lib/workspaces";
import Ask from "./ask";

export const metadata: Metadata = { title: "Ask Forgeboard – Forgeboard" };

export default function AskPage({ params }: PageProps<"/w/[slug]/ask">) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight text-white">Ask Forgeboard</h1>
      <p className="mt-1 text-slate-400">
        Ask about decisions, tasks, risks and documents in the projects you can see. Every answer links to where it came from.
      </p>
      <Suspense fallback={<div className="mt-6 h-40 animate-pulse rounded-xl bg-white/5" />}>
        <AskLoader params={params} />
      </Suspense>
    </div>
  );
}

async function AskLoader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await getWorkspace(slug);
  if (!access) notFound();
  return <Ask slug={slug} available={access.plan.features.file_ai} />;
}
