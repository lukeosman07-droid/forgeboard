import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  FREE_TRIAL_EXTRACTIONS,
  type Item,
  type ItemType,
  type Plan,
  type Profile,
  type Project,
} from "@/lib/types";

type ProjectWithItems = Project & { items: Item[] };

const PLAN_LABELS: Record<Plan, string> = {
  free: "Free trial",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
};

const SECTIONS: { type: ItemType; label: string }[] = [
  { type: "action_item", label: "Action items" },
  { type: "decision", label: "Decisions" },
  { type: "risk", label: "Risks" },
  { type: "question", label: "Open questions" },
];

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
      .select("*, items(*)")
      .order("created_at", { ascending: false })
      .order("created_at", { referencedTable: "items", ascending: true })
      .returns<ProjectWithItems[]>(),
  ]);

  if (profileResult.error || projectsResult.error) {
    return <SetupNeeded />;
  }

  const profile = profileResult.data;
  const projects = projectsResult.data ?? [];
  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          {firstName ? `Welcome, ${firstName}` : "Welcome"}
        </h1>
        <p className="mt-1 text-slate-400">
          {profile?.company_name ? `${profile.company_name} · ` : ""}
          {user.email}
        </p>
      </div>

      {profile && <PlanCard profile={profile} />}

      <section>
        <h2 className="text-lg font-semibold text-white">Projects</h2>
        {projects.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-400">
            No projects yet. Creating projects and AI note extraction are coming in the next update.
          </div>
        ) : (
          <div className="mt-4 space-y-6">
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
  const isTrial = profile.plan === "free";
  const remaining = Math.max(0, FREE_TRIAL_EXTRACTIONS - profile.ai_extractions_used);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-slate-400">Current plan</p>
        <p className="mt-1 flex items-center gap-3 text-xl font-semibold text-white">
          {PLAN_LABELS[profile.plan]}
          {profile.subscription_status && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium capitalize text-emerald-300">
              {profile.subscription_status}
            </span>
          )}
        </p>
      </div>
      <div className="sm:text-right">
        <p className="text-sm text-slate-400">AI extractions</p>
        <p className="mt-1 text-xl font-semibold text-white">
          {isTrial ? `${remaining} of ${FREE_TRIAL_EXTRACTIONS} trial extractions left` : `${profile.ai_extractions_used} used`}
        </p>
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectWithItems }) {
  const sections = SECTIONS.map((s) => ({ ...s, items: project.items.filter((i) => i.type === s.type) })).filter(
    (s) => s.items.length > 0,
  );

  return (
    <article className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
      <h3 className="text-xl font-semibold text-white">{project.name}</h3>
      {project.description && <p className="mt-1 text-slate-400">{project.description}</p>}

      {sections.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No items in this project yet.</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {sections.map((section) => (
            <div key={section.type}>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-orange-400">
                {section.label} <span className="text-slate-500">({section.items.length})</span>
              </h4>
              <ul className="mt-3 space-y-2">
                {section.items.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function ItemRow({ item }: { item: Item }) {
  const meta = [
    item.assignee,
    item.due_date && `Due ${formatDate(item.due_date)}`,
    item.priority && `${item.priority} priority`,
  ].filter(Boolean);

  return (
    <li className="rounded-lg border border-white/5 bg-slate-950/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className={`font-medium ${item.status === "done" ? "text-slate-500 line-through" : "text-slate-100"}`}>
          {item.title}
        </p>
        {item.status === "done" && (
          <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">Done</span>
        )}
      </div>
      {item.details && <p className="mt-1 text-sm text-slate-400">{item.details}</p>}
      {meta.length > 0 && <p className="mt-1.5 text-xs capitalize text-slate-500">{meta.join(" · ")}</p>}
    </li>
  );
}

function formatDate(isoDate: string) {
  // due_date is a plain date (YYYY-MM-DD); format it without timezone shifts.
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function SetupNeeded() {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-200">
      <h1 className="text-lg font-semibold">Your database isn&apos;t set up yet</h1>
      <p className="mt-2 text-sm">
        You&apos;re logged in, but Forgeboard couldn&apos;t load your data. Run the SQL in{" "}
        <code className="rounded bg-black/30 px-1">supabase/migrations/</code> in the Supabase SQL Editor, then refresh
        this page.
      </p>
    </div>
  );
}
