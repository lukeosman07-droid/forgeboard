"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MAX_NOTES_CHARS } from "@/lib/plans";

// Every action re-checks the session. Row Level Security in the database is the
// second lock: even a forged request can only touch the caller's own rows.

export type ActionResult = { error?: string; ok?: boolean };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

const ItemInputSchema = z.object({
  type: z.enum(["action_item", "decision", "risk", "question"]),
  title: z.string().trim().min(1, "Give it a title.").max(500, "Title is too long (500 characters max)."),
  details: optionalText(5000),
  assignee: optionalText(200),
  due_date: isoDate.nullable().optional().or(z.literal("").transform(() => null)),
  priority: z.enum(["low", "medium", "high"]).nullable().optional().or(z.literal("").transform(() => null)),
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

export async function createProject(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Give your project a name.").max(200, "Name is too long."),
      description: optionalText(2000),
    })
    .safeParse({ name: formData.get("name") ?? "", description: formData.get("description") ?? "" });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { user, supabase } = await session();
  const { data, error } = await supabase
    .from("projects")
    .insert({ owner_id: user.id, name: parsed.data.name, description: parsed.data.description ?? null })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't create the project. Please try again." };

  redirect(`/dashboard/projects/${data.id}`);
}

export async function deleteProject(projectId: string): Promise<ActionResult> {
  const { supabase } = await session();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) return { error: "Couldn't delete the project." };
  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function createItem(projectId: string, input: ItemInput): Promise<ActionResult> {
  const parsed = ItemInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { user, supabase } = await session();
  const { error } = await supabase.from("items").insert({ ...parsed.data, project_id: projectId, owner_id: user.id });
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

export async function setItemStatus(itemId: string, status: "open" | "done"): Promise<ActionResult> {
  if (status !== "open" && status !== "done") return { error: "Invalid status." };

  const { supabase } = await session();
  const { error } = await supabase.from("items").update({ status }).eq("id", itemId);
  if (error) return { error: "Couldn't update the item." };

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
