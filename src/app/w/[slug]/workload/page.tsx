import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getWorkspace } from "@/lib/workspaces";
import WorkloadGrid from "./workload-grid";

export const metadata: Metadata = { title: "Workload – Forgeboard" };

export default function WorkloadPage({ params }: PageProps<"/w/[slug]/workload">) {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-3xl font-bold tracking-tight text-white">Workload</h1>
      <p className="mt-1 text-slate-400">Open tasks per person, by the week they&apos;re due, across every project you can see.</p>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-xl bg-white/5" />}>
        <WorkloadLoader params={params} />
      </Suspense>
    </div>
  );
}

async function WorkloadLoader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await getWorkspace(slug);
  if (!access) notFound();
  return <WorkloadGrid slug={slug} enabled={access.plan.features.workload} />;
}
