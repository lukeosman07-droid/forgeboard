import Link from "next/link";
import { notFound } from "next/navigation";
import NewProjectButton from "@/components/app/new-project";
import { FREE_TRIAL_EXTRACTIONS, PLAN_LABELS, hasPaidAccess, trialExtractionsLeft } from "@/lib/plans";
import type { Profile } from "@/lib/types";
import { loadWorkspaceData } from "@/lib/workspace";
import { getWorkspace } from "@/lib/workspaces";
import HomeDashboard from "./home-dashboard";

export default async function DashboardContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await getWorkspace(slug);
  if (!access) notFound();
  const { workspace, user, canEdit } = access;

  const { profile, projects, tasks, failed } = await loadWorkspaceData(workspace.id, user.id, access.people);
  if (failed) return <SetupNeeded />;

  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</h1>
          <p className="mt-1 text-slate-400">
            {workspace.name} · {user.email}
          </p>
        </div>
        {projects.length > 0 && canEdit && <NewProjectButton />}
      </div>

      {projects.length > 0 ? <HomeDashboard projects={projects} tasks={tasks} /> : canEdit ? <EmptyState /> : <GuestEmptyState />}

      {profile && canEdit && <PlanCard profile={profile} slug={slug} />}
    </div>
  );
}

function PlanCard({ profile, slug }: { profile: Profile; slug: string }) {
  const paid = hasPaidAccess(profile);
  const left = trialExtractionsLeft(profile);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-slate-300">
        <span className="font-semibold text-white">{paid ? PLAN_LABELS[profile.plan] : PLAN_LABELS.free} plan</span>
        {" · "}
        {paid ? "Unlimited AI (notes, plans and status reports)" : `${left} of ${FREE_TRIAL_EXTRACTIONS} free AI runs left`}
      </p>
      <Link href={paid ? `/w/${slug}/billing` : "/pricing"} className="font-medium text-orange-400 hover:text-orange-300">
        {paid ? "Manage billing →" : "Upgrade for unlimited AI →"}
      </Link>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-orange-500/10 text-orange-400">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
          <path d="M12 11v5M9.5 13.5h5" />
        </svg>
      </div>
      <h2 className="mt-4 text-lg font-semibold text-white">Create your first project</h2>
      <p className="mx-auto mt-2 max-w-md text-slate-400">
        Start blank, pick a template, or describe your project and let AI draft the whole plan: sections, tasks and a
        schedule.
      </p>
      <div className="mt-6">
        <NewProjectButton variant="large" />
      </div>
    </div>
  );
}

function GuestEmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
      <h2 className="text-lg font-semibold text-white">Nothing has been shared with you yet</h2>
      <p className="mx-auto mt-2 max-w-md text-slate-400">
        You&apos;re a guest in this workspace. Projects appear here as soon as someone shares one with you.
      </p>
    </div>
  );
}

function SetupNeeded() {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-200">
      <h1 className="text-lg font-semibold">Your database isn&apos;t set up yet</h1>
      <p className="mt-2 text-sm">
        You&apos;re logged in, but Forgeboard couldn&apos;t load your data. Run the SQL files in{" "}
        <code className="rounded bg-black/30 px-1">supabase/migrations/</code> in the Supabase SQL Editor, then refresh
        this page.
      </p>
    </div>
  );
}
