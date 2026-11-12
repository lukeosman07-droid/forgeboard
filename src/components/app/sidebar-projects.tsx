import NewProjectButton from "@/app/dashboard/new-project";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";
import { ProjectLink } from "./project-link";

// The user's projects in the sidebar, newest first.
export default async function SidebarProjects() {
  const user = await getCurrentUser();
  const supabase = user ? await createClient() : null;
  const { data } = (await supabase?.from("projects").select("id, name, color").order("created_at", { ascending: false })) ?? {};
  const projects = (data ?? []) as Pick<Project, "id" | "name" | "color">[];

  return (
    <>
      <Header />
      <ul className="-mr-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {projects.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">No projects yet.</li>}
        {projects.map((p) => (
          <li key={p.id}>
            <ProjectLink id={p.id} name={p.name} color={p.color} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Header() {
  return (
    <div className="mb-1 flex items-center justify-between px-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Projects</span>
      <NewProjectButton variant="sidebar" />
    </div>
  );
}

export function SidebarProjectsFallback() {
  return (
    <>
      <Header />
      <div className="space-y-2 px-3 pt-1">
        <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
        <div className="h-4 w-24 animate-pulse rounded bg-white/5" />
      </div>
    </>
  );
}
