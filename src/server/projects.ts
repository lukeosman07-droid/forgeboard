"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Id, NewProjectSchema, ProjectPatchSchema, firstIssue, type ActionResult, type NewProjectInput, type ProjectPatch } from "./schemas";
import { NO_ACCESS, isDenied, refused, session, workspaceFor } from "./session";

// Projects. The database sets workspace_id on everything inside a project and
// checks the caller's role, so these actions only validate and report.

/** Creates a project in a workspace, optionally filled from a template or an AI plan. */
export async function createProject(slug: string, input: NewProjectInput): Promise<ActionResult & { id?: string }> {
  const parsed = NewProjectSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { name, description, color, plan } = parsed.data;
  const today = parsed.data.today ?? new Date().toISOString().slice(0, 10);

  const { supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return { error: "That workspace doesn't exist or you're not a member of it." };

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ workspace_id: workspace.id, name, description: description ?? null, color })
    .select("id")
    .single();
  if (error || !project) {
    return { error: isDenied(error) ? "Guests can't create projects. Ask an admin to make you a member." : "Couldn't create the project. Please try again." };
  }

  const sectionsToCreate = plan?.sections.length ? plan.sections : [{ name: "To do", tasks: [] }];
  const { data: sections, error: sectionError } = await supabase
    .from("sections")
    .insert(sectionsToCreate.map((s, i) => ({ project_id: project.id, name: s.name, position: i + 1 })))
    .select("id, position");
  if (sectionError || !sections) {
    await supabase.from("projects").delete().eq("id", project.id);
    return { error: "Couldn't set up the project. Has the latest database migration been run?" };
  }

  const sectionIds = [...sections].sort((a, b) => a.position - b.position).map((s) => s.id);
  let position = 0;
  const tasks = sectionsToCreate.flatMap((section, si) =>
    section.tasks.map((t) => {
      const start = t.start_offset != null ? shift(today, t.start_offset) : null;
      const due = start && t.duration_days ? shift(start, t.duration_days - 1) : start;
      return {
        project_id: project.id,
        section_id: sectionIds[si],
        type: "action_item",
        title: t.title,
        details: t.details ?? null,
        assignee: t.assignee ?? null,
        priority: t.priority ?? null,
        start_date: start,
        due_date: due,
        status: "open",
        position: ++position,
        note_id: null,
      };
    }),
  );
  if (tasks.length) {
    const { error: taskError } = await supabase.from("items").insert(tasks);
    if (taskError) return { id: project.id, error: "The project was created, but some tasks couldn't be added." };
  }

  refresh();
  return { ok: true, id: project.id };
}

function shift(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function updateProject(projectId: string, patch: ProjectPatch): Promise<ActionResult> {
  const parsed = ProjectPatchSchema.safeParse(patch);
  if (!parsed.success || !Id.safeParse(projectId).success) return { error: "Invalid change." };
  const { supabase } = await session();
  const error = refused(await supabase.from("projects").update(parsed.data).eq("id", projectId).select("id"), "Couldn't save the project.");
  if (error) return { error };
  refresh();
  return { ok: true };
}

/** Deletes a project and everything in it. Admins, or the member who created it. */
export async function deleteProject(slug: string, projectId: string): Promise<ActionResult> {
  if (!Id.safeParse(projectId).success) return { error: "Invalid project." };
  const { supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return { error: NO_ACCESS };

  const result = await supabase.from("projects").delete().eq("id", projectId).eq("workspace_id", workspace.id).select("id");
  if (result.error) return { error: "Couldn't delete the project." };
  if (!result.data?.length) return { error: "Only an admin or the person who created this project can delete it." };

  // Re-render the workspace layout too, so the sidebar drops the deleted project.
  revalidatePath(`/w/${workspace.slug}`, "layout");
  redirect(`/w/${workspace.slug}`);
}
