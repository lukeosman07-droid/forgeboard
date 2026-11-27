"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { displayName, matchPerson, withCurrentNames } from "@/lib/people";
import type { Activity, ItemComment, Project, Section, Subtask, Task } from "@/lib/types";
import { TASK_SELECT, toTask } from "@/lib/work";
import {
  Id,
  ItemInputSchema,
  SaveExtractionSchema,
  SectionName,
  Status,
  TaskPatchSchema,
  firstIssue,
  type ActionResult,
  type ItemInput,
  type SaveExtractionInput,
  type TaskPatch,
} from "./schemas";
import { deliverQuietly } from "./deliver";
import { NO_ACCESS, isDenied, peopleIn, refused, session } from "./session";

// Sections, tasks, the decisions/risks/questions log, subtasks, and saving AI
// results. Every write is checked by Row Level Security: guests can read but
// their writes change nothing, which refused() turns into a clear message.

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export async function createSection(projectId: string, name: string): Promise<ActionResult & { id?: string }> {
  const parsed = SectionName.safeParse(name);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!Id.safeParse(projectId).success) return { error: "Invalid project." };
  const { supabase } = await session();

  const { data: last } = await supabase
    .from("sections")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<Section, "position">>();

  const { data, error } = await supabase
    .from("sections")
    .insert({ project_id: projectId, name: parsed.data, position: (last?.position ?? 0) + 1 })
    .select("id")
    .single();
  if (error || !data) return { error: isDenied(error) ? NO_ACCESS : "Couldn't add the section." };
  refresh();
  return { ok: true, id: data.id };
}

export async function renameSection(sectionId: string, name: string): Promise<ActionResult> {
  const parsed = SectionName.safeParse(name);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { supabase } = await session();
  const error = refused(await supabase.from("sections").update({ name: parsed.data }).eq("id", sectionId).select("id"), "Couldn't rename the section.");
  if (error) return { error };
  refresh();
  return { ok: true };
}

/** Deletes a section. Its tasks stay in the project, without a section. */
export async function deleteSection(sectionId: string): Promise<ActionResult> {
  const { supabase } = await session();
  const error = refused(await supabase.from("sections").delete().eq("id", sectionId).select("id"), "Couldn't delete the section.");
  if (error) return { error };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

type Db = Awaited<ReturnType<typeof session>>["supabase"];

/**
 * Works out the owner columns for a change.
 *   * assignee_id set: a member owns the task; the name is read from their
 *     profile, never taken from the browser.
 *   * only assignee set: a free-text owner who isn't a member.
 */
async function ownerColumns(supabase: Db, workspaceId: string, patch: { assignee?: string | null; assignee_id?: string | null }) {
  if (patch.assignee_id) {
    const person = (await peopleIn(supabase, workspaceId)).find((p) => p.user_id === patch.assignee_id);
    if (!person) return { error: "That person isn't in this workspace." } as const;
    return { assignee_id: person.user_id, assignee: displayName(person) } as const;
  }
  if (patch.assignee !== undefined || patch.assignee_id === null) {
    return { assignee_id: null, assignee: patch.assignee ?? null } as const;
  }
  return {} as const;
}

export async function createTask(projectId: string, input: TaskPatch & { title: string }): Promise<ActionResult & { id?: string }> {
  const parsed = TaskPatchSchema.required({ title: true }).safeParse(input);
  if (!parsed.success || !Id.safeParse(projectId).success) {
    return { error: parsed.success ? "Invalid project." : firstIssue(parsed.error) };
  }
  const { supabase } = await session();

  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", projectId).maybeSingle<{ workspace_id: string }>();
  if (!project) return { error: "That project doesn't exist or you can't see it." };
  const owner = await ownerColumns(supabase, project.workspace_id, parsed.data);
  if ("error" in owner) return { error: owner.error };

  let position = parsed.data.position;
  if (position === undefined) {
    const { data: last } = await supabase
      .from("items")
      .select("position")
      .eq("project_id", projectId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle<{ position: number }>();
    position = (last?.position ?? 0) + 1;
  }

  const status = parsed.data.status ?? "open";
  const { data, error } = await supabase
    .from("items")
    .insert({
      ...parsed.data,
      ...owner,
      status,
      position,
      type: "action_item",
      project_id: projectId,
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: isDenied(error) ? NO_ACCESS : "Couldn't add the task. Please try again." };

  refresh();
  after(deliverQuietly);
  return { ok: true, id: data.id };
}

export async function updateTask(itemId: string, patch: TaskPatch): Promise<ActionResult> {
  const parsed = TaskPatchSchema.safeParse(patch);
  if (!parsed.success || !Id.safeParse(itemId).success) return { error: parsed.success ? "Invalid task." : firstIssue(parsed.error) };
  if (Object.keys(parsed.data).length === 0) return { ok: true };

  const { supabase } = await session();
  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status) update.completed_at = parsed.data.status === "done" ? new Date().toISOString() : null;

  let mapFrom: { projectId: string; name: string } | null = null;
  if (parsed.data.assignee !== undefined || parsed.data.assignee_id !== undefined) {
    const { data: current } = await supabase
      .from("items")
      .select("workspace_id, project_id, assignee, assignee_id")
      .eq("id", itemId)
      .maybeSingle<{ workspace_id: string; project_id: string; assignee: string | null; assignee_id: string | null }>();
    if (!current) return { error: "That task doesn't exist or you can't see it." };
    const owner = await ownerColumns(supabase, current.workspace_id, parsed.data);
    if ("error" in owner) return { error: owner.error };
    Object.assign(update, owner);
    // Picking a member for a task that carried a plain-text name maps that name:
    // every other task in the project under the same name follows.
    if (owner.assignee_id && !current.assignee_id && current.assignee?.trim()) {
      mapFrom = { projectId: current.project_id, name: current.assignee.trim() };
    }
  }

  const error = refused(await supabase.from("items").update(update).eq("id", itemId).select("id"), "Couldn't save your change. Please try again.");
  if (error) return { error };

  if (mapFrom) {
    await supabase
      .from("items")
      .update({ assignee_id: update.assignee_id, assignee: update.assignee })
      .eq("project_id", mapFrom.projectId)
      .is("assignee_id", null)
      .ilike("assignee", mapFrom.name.replace(/[\\%_]/g, (c) => `\\${c}`));
  }

  refresh();
  after(deliverQuietly);
  return { ok: true };
}

export async function deleteItem(itemId: string): Promise<ActionResult> {
  const { supabase } = await session();
  const error = refused(await supabase.from("items").delete().eq("id", itemId).select("id"), "Couldn't delete the item.");
  if (error) return { error };
  refresh();
  return { ok: true };
}

// Decisions, risks and questions (the project log) use the original form.
export async function createItem(projectId: string, input: ItemInput): Promise<ActionResult> {
  const parsed = ItemInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { supabase } = await session();
  const { error } = await supabase.from("items").insert({ ...parsed.data, project_id: projectId, position: Date.now() / 1000 });
  if (error) return { error: isDenied(error) ? NO_ACCESS : "Couldn't add the item. Please try again." };

  refresh();
  return { ok: true };
}

export async function updateItem(itemId: string, input: ItemInput): Promise<ActionResult> {
  const parsed = ItemInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { supabase } = await session();
  // The log form edits a plain-text owner, so any member link is cleared with it.
  const error = refused(
    await supabase.from("items").update({ ...parsed.data, assignee_id: null }).eq("id", itemId).select("id"),
    "Couldn't save your changes. Please try again.",
  );
  if (error) return { error };

  refresh();
  return { ok: true };
}

export async function setItemStatus(itemId: string, status: z.infer<typeof Status>): Promise<ActionResult> {
  return updateTask(itemId, { status });
}

// ---------------------------------------------------------------------------
// Task detail: subtasks
// ---------------------------------------------------------------------------

export type TaskDetail = {
  task: Task;
  project: Pick<Project, "id" | "name" | "color">;
  sections: Pick<Section, "id" | "name">[];
  subtasks: Subtask[];
  comments: ItemComment[];
  /** Newest first. Older entries drop off with the plan's history window. */
  activity: Activity[];
};

export async function getTaskDetail(itemId: string): Promise<TaskDetail | null> {
  if (!Id.safeParse(itemId).success) return null;
  const { supabase } = await session();

  const { data: row } = await supabase.from("items").select(TASK_SELECT).eq("id", itemId).maybeSingle();
  if (!row) return null;
  const raw = toTask(row);

  const [project, sections, subtasks, comments, activity, people] = await Promise.all([
    supabase.from("projects").select("id, name, color").eq("id", raw.project_id).maybeSingle<TaskDetail["project"]>(),
    supabase.from("sections").select("id, name").eq("project_id", raw.project_id).order("position"),
    supabase.from("subtasks").select("*").eq("item_id", itemId).order("position").order("created_at"),
    supabase.from("item_comments").select("*").eq("item_id", itemId).order("created_at"),
    supabase.from("activity").select("*").eq("item_id", itemId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100),
    peopleIn(supabase, raw.workspace_id),
  ]);
  if (!project.data) return null;

  return {
    task: withCurrentNames([raw], people)[0],
    project: project.data,
    sections: (sections.data ?? []) as TaskDetail["sections"],
    subtasks: (subtasks.data ?? []) as Subtask[],
    comments: (comments.data ?? []) as ItemComment[],
    activity: (activity.data ?? []) as Activity[],
  };
}

/** The latest changes across one project, newest first. */
export async function getProjectActivity(projectId: string, before?: number): Promise<Activity[]> {
  if (!Id.safeParse(projectId).success) return [];
  const cursor = z.number().int().positive().optional().safeParse(before);
  if (!cursor.success) return [];
  const { supabase } = await session();
  let query = supabase.from("activity").select("*").eq("project_id", projectId);
  if (cursor.data) query = query.lt("id", cursor.data);
  const { data } = await query.order("id", { ascending: false }).limit(30);
  return (data ?? []) as Activity[];
}

export async function addSubtask(itemId: string, title: string): Promise<ActionResult & { subtask?: Subtask }> {
  const parsed = z.string().trim().min(1, "Type a subtask.").max(300).safeParse(title);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { supabase } = await session();
  const { data, error } = await supabase
    .from("subtasks")
    .insert({ item_id: itemId, title: parsed.data, position: Date.now() / 1000 })
    .select("*")
    .single<Subtask>();
  if (error || !data) return { error: isDenied(error) ? NO_ACCESS : "Couldn't add the subtask." };
  refresh();
  return { ok: true, subtask: data };
}

export async function updateSubtask(subtaskId: string, patch: { done?: boolean; title?: string }): Promise<ActionResult> {
  const parsed = z
    .object({ done: z.boolean().optional(), title: z.string().trim().min(1).max(300).optional() })
    .safeParse(patch);
  if (!parsed.success) return { error: "Invalid change." };
  const { supabase } = await session();
  const error = refused(await supabase.from("subtasks").update(parsed.data).eq("id", subtaskId).select("id"), "Couldn't update the subtask.");
  if (error) return { error };
  refresh();
  return { ok: true };
}

export async function deleteSubtask(subtaskId: string): Promise<ActionResult> {
  const { supabase } = await session();
  const error = refused(await supabase.from("subtasks").delete().eq("id", subtaskId).select("id"), "Couldn't delete the subtask.");
  if (error) return { error };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Save reviewed AI results: original text -> notes, checked items -> items
// ---------------------------------------------------------------------------

export async function saveExtraction(input: SaveExtractionInput): Promise<ActionResult> {
  const parsed = SaveExtractionSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { projectId, rawText, summary, items } = parsed.data;

  const { supabase } = await session();

  const { data: note, error: noteError } = await supabase
    .from("notes")
    .insert({ project_id: projectId, raw_text: rawText, summary: summary || null })
    .select("id, workspace_id")
    .single<{ id: string; workspace_id: string }>();
  if (noteError || !note) return { error: isDenied(noteError) ? NO_ACCESS : "Couldn't save the notes. Please try again." };

  // New tasks land at the end of the project's first section.
  const [{ data: firstSection }, { data: last }, people] = await Promise.all([
    supabase.from("sections").select("id").eq("project_id", projectId).order("position").limit(1).maybeSingle<{ id: string }>(),
    supabase
      .from("items")
      .select("position")
      .eq("project_id", projectId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle<{ position: number }>(),
    peopleIn(supabase, note.workspace_id),
  ]);
  let position = last?.position ?? 0;

  const { error: itemsError } = await supabase.from("items").insert(
    items.map((item) => {
      // A name from the notes that clearly is a member becomes that member.
      const person = matchPerson(item.assignee, people);
      return {
        type: item.type,
        title: item.title,
        // Every column set on every row: in a multi-row insert, a missing column becomes null.
        details: item.details ?? null,
        assignee: person ? displayName(person) : (item.assignee ?? null),
        assignee_id: person?.user_id ?? null,
        due_date: item.due_date ?? null,
        priority: item.priority ?? null,
        status: "open",
        section_id: item.type === "action_item" ? (firstSection?.id ?? null) : null,
        position: ++position,
        project_id: projectId,
        note_id: note.id,
      };
    }),
  );
  if (itemsError) {
    // Don't leave an orphaned note behind if the items failed.
    await supabase.from("notes").delete().eq("id", note.id);
    return { error: "Couldn't save the items. Please try again." };
  }

  refresh();
  after(deliverQuietly);
  return { ok: true };
}
