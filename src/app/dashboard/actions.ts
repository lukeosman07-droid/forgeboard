"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MAX_NOTES_CHARS } from "@/lib/plans";
import { TASK_SELECT, toTask } from "@/lib/work";
import type { ItemComment, Project, Section, Subtask, Task } from "@/lib/types";

// Every action re-checks the session. Row Level Security in the database is the
// second lock: even a forged request can only touch the caller's own rows.

export type ActionResult = { error?: string; ok?: boolean };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
const optionalDate = isoDate.nullable().optional().or(z.literal("").transform(() => null));
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

const Status = z.enum(["open", "in_progress", "stuck", "done"]);
const PriorityEnum = z.enum(["low", "medium", "high", "urgent"]);
const Color = z.enum(["orange", "blue", "green", "purple", "pink", "teal", "yellow", "red"]);
const Id = z.uuid();

const ItemInputSchema = z.object({
  type: z.enum(["action_item", "decision", "risk", "question"]),
  title: z.string().trim().min(1, "Give it a title.").max(500, "Title is too long (500 characters max)."),
  details: optionalText(5000),
  assignee: optionalText(200),
  due_date: optionalDate,
  priority: PriorityEnum.nullable().optional().or(z.literal("").transform(() => null)),
});

export type ItemInput = z.input<typeof ItemInputSchema>;

async function session() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) redirect("/login");
  return { user, supabase };
}

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the form.";
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const PlanSchema = z.object({
  sections: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        tasks: z
          .array(
            z.object({
              title: z.string().trim().min(1).max(500),
              details: optionalText(5000),
              assignee: optionalText(200),
              priority: PriorityEnum.nullable().optional(),
              start_offset: z.number().int().min(0).max(730).nullable().optional(),
              duration_days: z.number().int().min(1).max(365).nullable().optional(),
            }),
          )
          .max(40),
      }),
    )
    .max(12),
});

export type ProjectPlan = z.input<typeof PlanSchema>;

const NewProjectSchema = z.object({
  name: z.string().trim().min(1, "Give your project a name.").max(200, "Name is too long."),
  description: optionalText(2000),
  color: Color.default("orange"),
  plan: PlanSchema.nullable().optional(),
  // The browser's local date, so planned dates start "today" for the user.
  today: isoDate.optional(),
});

/** Creates a project, optionally filled from a template or an AI plan. */
export async function createProject(input: z.input<typeof NewProjectSchema>): Promise<ActionResult & { id?: string }> {
  const parsed = NewProjectSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { name, description, color, plan } = parsed.data;
  const today = parsed.data.today ?? new Date().toISOString().slice(0, 10);

  const { user, supabase } = await session();
  const { data: project, error } = await supabase
    .from("projects")
    .insert({ owner_id: user.id, name, description: description ?? null, color })
    .select("id")
    .single();
  if (error || !project) return { error: "Couldn't create the project. Please try again." };

  const sectionsToCreate = plan?.sections.length ? plan.sections : [{ name: "To do", tasks: [] }];
  const { data: sections, error: sectionError } = await supabase
    .from("sections")
    .insert(sectionsToCreate.map((s, i) => ({ project_id: project.id, owner_id: user.id, name: s.name, position: i + 1 })))
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
        owner_id: user.id,
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

const ProjectPatch = z.object({
  name: z.string().trim().min(1, "Give your project a name.").max(200).optional(),
  description: optionalText(2000),
  color: Color.optional(),
});

export async function updateProject(projectId: string, patch: z.input<typeof ProjectPatch>): Promise<ActionResult> {
  const parsed = ProjectPatch.safeParse(patch);
  if (!parsed.success || !Id.safeParse(projectId).success) return { error: "Invalid change." };
  const { supabase } = await session();
  const { error } = await supabase.from("projects").update(parsed.data).eq("id", projectId);
  if (error) return { error: "Couldn't save the project." };
  refresh();
  return { ok: true };
}

export async function deleteProject(projectId: string): Promise<ActionResult> {
  const { supabase } = await session();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) return { error: "Couldn't delete the project." };
  // Re-render the dashboard layout too, so the sidebar drops the deleted project.
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const SectionName = z.string().trim().min(1, "Name the section.").max(120);

export async function createSection(projectId: string, name: string): Promise<ActionResult & { id?: string }> {
  const parsed = SectionName.safeParse(name);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { user, supabase } = await session();

  const { data: last } = await supabase
    .from("sections")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<Section, "position">>();

  const { data, error } = await supabase
    .from("sections")
    .insert({ project_id: projectId, owner_id: user.id, name: parsed.data, position: (last?.position ?? 0) + 1 })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't add the section." };
  refresh();
  return { ok: true, id: data.id };
}

export async function renameSection(sectionId: string, name: string): Promise<ActionResult> {
  const parsed = SectionName.safeParse(name);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { supabase } = await session();
  const { error } = await supabase.from("sections").update({ name: parsed.data }).eq("id", sectionId);
  if (error) return { error: "Couldn't rename the section." };
  refresh();
  return { ok: true };
}

/** Deletes a section. Its tasks stay in the project, without a section. */
export async function deleteSection(sectionId: string): Promise<ActionResult> {
  const { supabase } = await session();
  const { error } = await supabase.from("sections").delete().eq("id", sectionId);
  if (error) return { error: "Couldn't delete the section." };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

const TaskPatch = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(500).optional(),
  details: optionalText(5000),
  assignee: optionalText(200),
  status: Status.optional(),
  priority: PriorityEnum.nullable().optional(),
  start_date: optionalDate,
  due_date: optionalDate,
  section_id: Id.nullable().optional(),
  position: z.number().finite().optional(),
});

export type TaskPatch = z.input<typeof TaskPatch>;

export async function createTask(
  projectId: string,
  input: TaskPatch & { title: string },
): Promise<ActionResult & { id?: string }> {
  const parsed = TaskPatch.required({ title: true }).safeParse(input);
  if (!parsed.success || !Id.safeParse(projectId).success) {
    return { error: parsed.success ? "Invalid project." : firstIssue(parsed.error) };
  }
  const { user, supabase } = await session();

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
      status,
      position,
      type: "action_item",
      project_id: projectId,
      owner_id: user.id,
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't add the task. Please try again." };

  refresh();
  return { ok: true, id: data.id };
}

export async function updateTask(itemId: string, patch: TaskPatch): Promise<ActionResult> {
  const parsed = TaskPatch.safeParse(patch);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (Object.keys(parsed.data).length === 0) return { ok: true };

  const { supabase } = await session();
  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status) update.completed_at = parsed.data.status === "done" ? new Date().toISOString() : null;

  const { error } = await supabase.from("items").update(update).eq("id", itemId);
  if (error) return { error: "Couldn't save your change. Please try again." };

  refresh();
  return { ok: true };
}

export async function deleteItem(itemId: string): Promise<ActionResult> {
  const { supabase } = await session();
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) return { error: "Couldn't delete the item." };

  refresh();
  return { ok: true };
}

// Decisions, risks and questions (the project log) use the original form.
export async function createItem(projectId: string, input: ItemInput): Promise<ActionResult> {
  const parsed = ItemInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { user, supabase } = await session();
  const { error } = await supabase
    .from("items")
    .insert({ ...parsed.data, project_id: projectId, owner_id: user.id, position: Date.now() / 1000 });
  if (error) return { error: "Couldn't add the item. Please try again." };

  refresh();
  return { ok: true };
}

export async function updateItem(itemId: string, input: ItemInput): Promise<ActionResult> {
  const parsed = ItemInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { supabase } = await session();
  const { error } = await supabase.from("items").update(parsed.data).eq("id", itemId);
  if (error) return { error: "Couldn't save your changes. Please try again." };

  refresh();
  return { ok: true };
}

export async function setItemStatus(itemId: string, status: z.infer<typeof Status>): Promise<ActionResult> {
  return updateTask(itemId, { status });
}

// ---------------------------------------------------------------------------
// Task detail: subtasks and comments
// ---------------------------------------------------------------------------

export type TaskDetail = {
  task: Task;
  project: Pick<Project, "id" | "name" | "color">;
  sections: Pick<Section, "id" | "name">[];
  subtasks: Subtask[];
  comments: ItemComment[];
};

export async function getTaskDetail(itemId: string): Promise<TaskDetail | null> {
  if (!Id.safeParse(itemId).success) return null;
  const { supabase } = await session();

  const { data: row } = await supabase.from("items").select(TASK_SELECT).eq("id", itemId).maybeSingle();
  if (!row) return null;
  const task = toTask(row);

  const [project, sections, subtasks, comments] = await Promise.all([
    supabase.from("projects").select("id, name, color").eq("id", task.project_id).maybeSingle<TaskDetail["project"]>(),
    supabase.from("sections").select("id, name").eq("project_id", task.project_id).order("position"),
    supabase.from("subtasks").select("*").eq("item_id", itemId).order("position").order("created_at"),
    supabase.from("item_comments").select("*").eq("item_id", itemId).order("created_at"),
  ]);
  if (!project.data) return null;

  return {
    task,
    project: project.data,
    sections: (sections.data ?? []) as TaskDetail["sections"],
    subtasks: (subtasks.data ?? []) as Subtask[],
    comments: (comments.data ?? []) as ItemComment[],
  };
}

export async function addSubtask(itemId: string, title: string): Promise<ActionResult & { subtask?: Subtask }> {
  const parsed = z.string().trim().min(1, "Type a subtask.").max(300).safeParse(title);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { user, supabase } = await session();
  const { data, error } = await supabase
    .from("subtasks")
    .insert({ item_id: itemId, owner_id: user.id, title: parsed.data, position: Date.now() / 1000 })
    .select("*")
    .single<Subtask>();
  if (error || !data) return { error: "Couldn't add the subtask." };
  refresh();
  return { ok: true, subtask: data };
}

export async function updateSubtask(subtaskId: string, patch: { done?: boolean; title?: string }): Promise<ActionResult> {
  const parsed = z
    .object({ done: z.boolean().optional(), title: z.string().trim().min(1).max(300).optional() })
    .safeParse(patch);
  if (!parsed.success) return { error: "Invalid change." };
  const { supabase } = await session();
  const { error } = await supabase.from("subtasks").update(parsed.data).eq("id", subtaskId);
  if (error) return { error: "Couldn't update the subtask." };
  refresh();
  return { ok: true };
}

export async function deleteSubtask(subtaskId: string): Promise<ActionResult> {
  const { supabase } = await session();
  const { error } = await supabase.from("subtasks").delete().eq("id", subtaskId);
  if (error) return { error: "Couldn't delete the subtask." };
  refresh();
  return { ok: true };
}

export async function addComment(itemId: string, body: string): Promise<ActionResult & { comment?: ItemComment }> {
  const parsed = z.string().trim().min(1, "Write something first.").max(5000).safeParse(body);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { user, supabase } = await session();
  const { data, error } = await supabase
    .from("item_comments")
    .insert({ item_id: itemId, owner_id: user.id, body: parsed.data })
    .select("*")
    .single<ItemComment>();
  if (error || !data) return { error: "Couldn't post the update." };
  refresh();
  return { ok: true, comment: data };
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  const { supabase } = await session();
  const { error } = await supabase.from("item_comments").delete().eq("id", commentId);
  if (error) return { error: "Couldn't delete the update." };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Search (command palette)
// ---------------------------------------------------------------------------

export type SearchResults = {
  projects: Pick<Project, "id" | "name" | "color">[];
  tasks: (Pick<Task, "id" | "title" | "status" | "project_id"> & { project_name: string })[];
};

export async function searchWorkspace(query: string): Promise<SearchResults> {
  const q = query.trim().slice(0, 100);
  const { supabase } = await session();
  // Escape the characters that are special in ILIKE patterns.
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  const [projects, tasks] = await Promise.all([
    supabase.from("projects").select("id, name, color").ilike("name", pattern).order("created_at", { ascending: false }).limit(5),
    q
      ? supabase
          .from("items")
          .select("id, title, status, project_id, projects(name)")
          .eq("type", "action_item")
          .ilike("title", pattern)
          .order("created_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    projects: (projects.data ?? []) as SearchResults["projects"],
    tasks: ((tasks.data ?? []) as unknown as (SearchResults["tasks"][number] & { projects: { name: string } | null })[]).map(
      ({ projects: p, ...t }) => ({ ...t, project_name: p?.name ?? "" }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Save reviewed AI results: original text -> notes, checked items -> items
// ---------------------------------------------------------------------------

const SaveExtractionSchema = z.object({
  projectId: z.uuid(),
  rawText: z.string().trim().min(1).max(MAX_NOTES_CHARS),
  summary: z.string().trim().max(2000).nullable(),
  items: z.array(ItemInputSchema).min(1, "Select at least one item to save.").max(300),
});

export async function saveExtraction(input: z.input<typeof SaveExtractionSchema>): Promise<ActionResult> {
  const parsed = SaveExtractionSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { projectId, rawText, summary, items } = parsed.data;

  const { user, supabase } = await session();

  const { data: note, error: noteError } = await supabase
    .from("notes")
    .insert({ project_id: projectId, owner_id: user.id, raw_text: rawText, summary: summary || null })
    .select("id")
    .single();
  if (noteError || !note) return { error: "Couldn't save the notes. Please try again." };

  // New tasks land at the end of the project's first section.
  const [{ data: firstSection }, { data: last }] = await Promise.all([
    supabase.from("sections").select("id").eq("project_id", projectId).order("position").limit(1).maybeSingle<{ id: string }>(),
    supabase
      .from("items")
      .select("position")
      .eq("project_id", projectId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle<{ position: number }>(),
  ]);
  let position = last?.position ?? 0;

  const { error: itemsError } = await supabase.from("items").insert(
    items.map((item) => ({
      type: item.type,
      title: item.title,
      // Every column set on every row: in a multi-row insert, a missing column becomes null.
      details: item.details ?? null,
      assignee: item.assignee ?? null,
      due_date: item.due_date ?? null,
      priority: item.priority ?? null,
      status: "open",
      section_id: item.type === "action_item" ? (firstSection?.id ?? null) : null,
      position: ++position,
      project_id: projectId,
      owner_id: user.id,
      note_id: note.id,
    })),
  );
  if (itemsError) {
    // Don't leave an orphaned note behind if the items failed.
    await supabase.from("notes").delete().eq("id", note.id);
    return { error: "Couldn't save the items. Please try again." };
  }

  refresh();
  return { ok: true };
}
