import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  FREE_TRIAL_EXTRACTIONS,
  HOURLY_EXTRACTION_LIMIT,
  PLAN_LABELS,
  hasPaidAccess,
  trialExtractionsLeft,
} from "@/lib/plans";
import type { Item, Profile, Project } from "@/lib/types";
import NewProjectButton from "./new-project";

type ProjectWithCounts = Project & { items: Pick<Item, "type" | "status">[] };

export default async function DashboardContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  if (!supabase) redirect("/login");

  // Row Level Security means these queries only ever return this user's rows.
  const [profileResult, projectsResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    supabase
      .from("projects")
      .select("*, items(type, status)")
      .order("created_at", { ascending: false })
      .overrideTypes<ProjectWithCounts[], { merge: false }>(),
  ]);

  if (profileResult.error || projectsResult.error) return <SetupNeeded />;

  const profile = profileResult.data;
  const projects = projectsResult.data ?? [];
  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            {firstName ? `Welcome, ${firstName}` : "Welcome"}
          </h1>
          <p className="mt-1 text-slate-400">
            {profile?.company_name ? `${profile.company_name} · ` : ""}
            {user.email}
          </p>
        </div>
        {projects.length > 0 && <NewProjectButton />}
      </div>

      {profile && <PlanCard profile={profile} />}

      <section>
        <h2 className="text-lg font-semibold text-white">Projects</h2>
        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PlanCard({ profile }: { profile: Profile }) {
  const paid = hasPaidAccess(profile);
  const left = trialExtractionsLeft(profile);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-slate-400">Current plan</p>
        <p className="mt-1 flex items-center gap-3 text-xl font-semibold text-white">
          {paid ? PLAN_LABELS[profile.plan] : PLAN_LABELS.free}
          {paid && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
              Active
            </span>
          )}
        </p>
      </div>
      <div className="sm:text-right">
        <p className="text-sm text-slate-400">AI extractions</p>
        {paid ? (
          <p className="mt-1 text-xl font-semibold text-white">
            Unlimited <span className="text-sm font-normal text-slate-400">(up to {HOURLY_EXTRACTION_LIMIT}/hour)</span>
          </p>
        ) : (
          <p className="mt-1 text-xl font-semibold text-white">
            {left} of {FREE_TRIAL_EXTRACTIONS} trial extractions left
            {left === 0 && (
              <Link href="/pricing" className="ml-3 text-sm font-medium text-orange-400 hover:text-orange-300">
                Upgrade →
              </Link>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectWithCounts }) {
  const openActions = project.items.filter((i) => i.type === "action_item" && i.status === "open").length;
  const decisions = project.items.filter((i) => i.type === "decision").length;
  const risks = project.items.filter((i) => i.type === "risk" && i.status === "open").length;

  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className="group flex flex-col rounded-2xl border border-white/10 bg-slate-900/60 p-6 transition hover:border-orange-500/40 hover:bg-slate-900"
    >
      <h3 className="text-lg font-semibold text-white group-hover:text-orange-300">{project.name}</h3>
      <p className="mt-1 line-clamp-2 flex-1 text-sm text-slate-400">{project.description || "No description"}</p>
      <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-white/5 pt-4 text-center">
        <Count label="Open actions" value={openActions} />
        <Count label="Decisions" value={decisions} />
        <Count label="Open risks" value={risks} highlight={risks > 0} />
      </dl>
    </Link>
  );
}

function Count({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <dd className={`text-2xl font-bold ${highlight ? "text-amber-300" : "text-white"}`}>{value}</dd>
      <dt className="text-xs text-slate-500">{label}</dt>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-orange-500/10 text-orange-400">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
          <path d="M12 11v5M9.5 13.5h5" />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">Create your first project</h3>
      <p className="mx-auto mt-2 max-w-md text-slate-400">
        A project holds your action items, decisions, and risks. Then paste in meeting notes and let AI organize them
        for you.
      </p>
      <div className="mt-6">
        <NewProjectButton variant="large" />
      </div>
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
