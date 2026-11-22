import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DismissChecklist from "./dismiss-checklist";

// First-run checklist for a new workspace's admins, shown above every page
// until each step is done or someone dismisses it. Each step is worked out
// from the workspace's data, so it ticks itself off.
export default async function SetupChecklist({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const supabase = await createClient();
  if (!supabase) return null;
  const head = { count: "exact" as const, head: true };
  const [projects, notes, members, invites] = await Promise.all([
    supabase.from("projects").select("id", head).eq("workspace_id", workspaceId),
    supabase.from("notes").select("id", head).eq("workspace_id", workspaceId),
    supabase.from("workspace_members").select("user_id", head).eq("workspace_id", workspaceId),
    supabase.from("workspace_invites").select("id", head).eq("workspace_id", workspaceId),
  ]);

  const steps = [
    { label: "Name your workspace", done: true, href: `/w/${slug}/members` },
    { label: "Create a project", done: (projects.count ?? 0) > 0, href: `/w/${slug}` },
    { label: "Paste meeting notes into AI Extract", done: (notes.count ?? 0) > 0, href: `/w/${slug}` },
    { label: "Invite a colleague", done: (members.count ?? 0) > 1 || (invites.count ?? 0) > 0, href: `/w/${slug}/members` },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <section aria-label="Setup checklist" className="mb-6 rounded-xl border border-orange-500/30 bg-orange-500/[0.06] px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-white">
          Get set up · {done} of {steps.length} done
        </p>
        <DismissChecklist slug={slug} />
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs ${step.done ? "bg-orange-500 text-slate-950" : "border border-white/25"}`}
            >
              {step.done ? "✓" : ""}
            </span>
            {step.done ? (
              <span className="text-slate-400 line-through">{step.label}</span>
            ) : (
              <Link href={step.href} className="text-slate-200 hover:text-white">
                {step.label}
              </Link>
            )}
            <span className="sr-only">{step.done ? "(done)" : "(to do)"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
