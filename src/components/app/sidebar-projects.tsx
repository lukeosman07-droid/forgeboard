import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";
import NewProjectButton from "./new-project";
import { ProjectLink } from "./project-link";

// The workspace's projects in the sidebar, newest first. A guest sees only the
// projects shared with them (Row Level Security filters the rest out).
export default async function SidebarProjects({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const supabase = await createClient();
  const { data } =
    (await supabase?.from("projects").select("id, name, color").eq("workspace_id", workspaceId).order("created_at", { ascending: false })) ?? {};
  const projects = (data ?? []) as Pick<Project, "id" | "name" | "color">[];

  return (
    <>
      <Header canEdit={canEdit} />
      <ul className="-mr-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {projects.length === 0 && (
          <li className="px-3 py-2 text-xs text-slate-500">{canEdit ? "No projects yet." : "No projects have been shared with you yet."}</li>
        )}
        {projects.map((p) => (
          <li key={p.id}>
            <ProjectLink id={p.id} name={p.name} color={p.color} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Header({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="mb-1 flex items-center justify-between px-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Projects</span>
      {canEdit && <NewProjectButton variant="sidebar" />}
    </div>
  );
}

export function SidebarProjectsFallback({ canEdit }: { canEdit: boolean }) {
  return (
    <>
      <Header canEdit={canEdit} />
      <div className="space-y-2 px-3 pt-1">
        <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
        <div className="h-4 w-24 animate-pulse rounded bg-white/5" />
      </div>
    </>
  );
}
