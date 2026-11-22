import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getWorkspace } from "@/lib/workspaces";
import OnboardingFlow from "./onboarding-flow";

export const metadata: Metadata = { title: "Set up your workspace – Forgeboard" };

// First run for a new workspace: name it, start a project, invite the team.
export default function OnboardingPage({ params }: PageProps<"/w/[slug]/onboarding">) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-2xl animate-pulse rounded-2xl bg-white/5" />}>
      <Onboarding params={params} />
    </Suspense>
  );
}

async function Onboarding({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await getWorkspace(slug);
  if (!access) notFound();
  // Only admins set a workspace up, and only once.
  if (!access.isAdmin || access.workspace.onboarded_at || !access.canEdit) redirect(`/w/${slug}`);

  return <OnboardingFlow slug={slug} workspaceName={access.workspace.name} />;
}
