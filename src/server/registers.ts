"use server";

import { refresh } from "next/cache";
import type { Rfi, Submittal, SubmittalRevision } from "@/lib/registers";
import type { Attachment, Item } from "@/lib/types";
import {
  Id,
  RfiInputSchema,
  RfiPatchSchema,
  SubmittalInputSchema,
  SubmittalPatchSchema,
  firstIssue,
  type ActionResult,
  type RfiInput,
  type RfiPatch,
  type SubmittalInput,
  type SubmittalPatch,
} from "./schemas";
import { NO_ACCESS, isDenied, refused, session } from "./session";

// RFI and submittal registers. The database numbers each one per project,
// stamps the status dates, checks people are workspace members and keeps the
// submittal revision history, so these actions validate input and report.
// Adding or editing needs a plan with registers; Row Level Security checks it.

const PLAN_OR_ACCESS =
  "That wasn't saved. RFIs and submittals need edit access to the project, on a plan that includes registers (Team or Business).";

/** Maps database errors to something a person can act on. */
function registerError(error: { code?: string; message?: string; hint?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (isDenied(error)) return PLAN_OR_ACCESS;
  if (error.hint && /submittal_|review_|dependency_/.test(error.message ?? "")) return error.hint;
  if (error.message?.includes("must be a member")) return "That person isn't in this workspace.";
  return fallback;
}

/** An update that changes no rows was blocked by RLS: no access, or no registers on the plan. */
function refusedRegister(result: { data: unknown[] | null; error: { code?: string; message?: string; hint?: string } | null }, fallback: string) {
  if (result.error) return registerError(result.error, fallback);
  return result.data && result.data.length > 0 ? null : PLAN_OR_ACCESS;
}

// ---------------------------------------------------------------------------
// RFIs
// ---------------------------------------------------------------------------

export async function createRfi(projectId: string, input: RfiInput): Promise<ActionResult & { id?: string; number?: number }> {
  const parsed = RfiInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!Id.safeParse(projectId).success) return { error: "Invalid project." };
  const { supabase } = await session();
  const { data, error } = await supabase
    .from("rfis")
    .insert({ ...parsed.data, question: parsed.data.question ?? "", project_id: projectId })
    .select("id, number")
    .single<{ id: string; number: number }>();
  if (error || !data) return { error: registerError(error, "Couldn't add the RFI. Please try again.") };
  refresh();
  return { ok: true, id: data.id, number: data.number };
}

/**
 * Turns a question from the log (often one the AI pulled out of meeting notes)
 * into an open RFI in one step, and links the question to it.
 */
export async function rfiFromItem(itemId: string): Promise<ActionResult & { id?: string; number?: number }> {
  if (!Id.safeParse(itemId).success) return { error: "Question not found." };
  const { supabase } = await session();
  const { data: item } = await supabase
    .from("items")
    .select("id, project_id, title, details, source_quote, assignee_id, assignee, due_date, rfi_id")
    .eq("id", itemId)
    .maybeSingle<Pick<Item, "id" | "project_id" | "title" | "details" | "source_quote" | "assignee_id" | "assignee" | "due_date" | "rfi_id">>();
  if (!item) return { error: "Question not found." };
  if (item.rfi_id) {
    const { data: existing } = await supabase.from("rfis").select("id, number").eq("id", item.rfi_id).maybeSingle<{ id: string; number: number }>();
    if (existing) return { ok: true, id: existing.id, number: existing.number };
  }

  const question = [item.details, item.source_quote && item.source_quote !== item.details ? `From the notes: "${item.source_quote}"` : null]
    .filter(Boolean)
    .join("\n\n");
  const { data, error } = await supabase
    .from("rfis")
    .insert({
      project_id: item.project_id,
      subject: item.title.slice(0, 300),
      question: (question || item.title).slice(0, 10000),
      status: "open",
      ball_in_court_id: item.assignee_id,
      ball_in_court: item.assignee_id ? null : item.assignee,
      date_required: item.due_date,
      source_item_id: item.id,
    })
    .select("id, number")
    .single<{ id: string; number: number }>();
  if (error || !data) return { error: registerError(error, "Couldn't create the RFI. Please try again.") };
  await supabase.from("items").update({ rfi_id: data.id }).eq("id", item.id);
  refresh();
  return { ok: true, id: data.id, number: data.number };
}

export async function updateRfi(rfiId: string, patch: RfiPatch): Promise<ActionResult> {
  const parsed = RfiPatchSchema.safeParse(patch);
  if (!parsed.success || !Id.safeParse(rfiId).success) return { error: parsed.success ? "RFI not found." : firstIssue(parsed.error) };
  if (Object.keys(parsed.data).length === 0) return { ok: true };
  const update: Record<string, unknown> = { ...parsed.data };
  // Picking a member clears a typed name and the other way round.
  if (parsed.data.ball_in_court_id) update.ball_in_court = null;
  else if (parsed.data.ball_in_court !== undefined) update.ball_in_court_id = null;
  const { supabase } = await session();
  const problem = refusedRegister(await supabase.from("rfis").update(update).eq("id", rfiId).select("id"), "Couldn't save the RFI.");
  if (problem) return { error: problem };
  refresh();
  return { ok: true };
}

export async function deleteRfi(rfiId: string): Promise<ActionResult> {
  if (!Id.safeParse(rfiId).success) return { error: "RFI not found." };
  const { supabase } = await session();
  const problem = refused(await supabase.from("rfis").delete().eq("id", rfiId).select("id"), "Couldn't delete the RFI.");
  if (problem) return { error: problem };
  refresh();
  return { ok: true };
}

export type LinkedTask = Pick<Item, "id" | "title" | "status" | "due_date" | "assignee">;
export type RfiDetail = { rfi: Rfi; tasks: LinkedTask[]; files: Attachment[]; source: Pick<Item, "id" | "title" | "type"> | null };

export async function getRfiDetail(rfiId: string): Promise<RfiDetail | null> {
  if (!Id.safeParse(rfiId).success) return null;
  const { supabase } = await session();
  const { data: rfi } = await supabase.from("rfis").select("*").eq("id", rfiId).maybeSingle<Rfi>();
  if (!rfi) return null;
  const [tasks, files, source] = await Promise.all([
    supabase.from("items").select("id, title, status, due_date, assignee").eq("rfi_id", rfiId).eq("type", "action_item").order("position"),
    supabase.from("attachments").select("*").eq("rfi_id", rfiId).eq("status", "ready").order("created_at", { ascending: false }),
    rfi.source_item_id
      ? supabase.from("items").select("id, title, type").eq("id", rfi.source_item_id).maybeSingle<Pick<Item, "id" | "title" | "type">>()
      : Promise.resolve({ data: null }),
  ]);
  return { rfi, tasks: (tasks.data ?? []) as LinkedTask[], files: (files.data ?? []) as Attachment[], source: source.data ?? null };
}

// ---------------------------------------------------------------------------
// Submittals
// ---------------------------------------------------------------------------

export async function createSubmittal(projectId: string, input: SubmittalInput): Promise<ActionResult & { id?: string; number?: number }> {
  const parsed = SubmittalInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!Id.safeParse(projectId).success) return { error: "Invalid project." };
  const { supabase } = await session();
  const { data, error } = await supabase
    .from("submittals")
    .insert({ ...parsed.data, project_id: projectId })
    .select("id, number")
    .single<{ id: string; number: number }>();
  if (error || !data) return { error: registerError(error, "Couldn't add the submittal. Please try again.") };
  refresh();
  return { ok: true, id: data.id, number: data.number };
}

export async function updateSubmittal(submittalId: string, patch: SubmittalPatch): Promise<ActionResult> {
  const parsed = SubmittalPatchSchema.safeParse(patch);
  if (!parsed.success || !Id.safeParse(submittalId).success) return { error: parsed.success ? "Submittal not found." : firstIssue(parsed.error) };
  if (Object.keys(parsed.data).length === 0) return { ok: true };
  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.reviewer_id) update.reviewer = null;
  else if (parsed.data.reviewer !== undefined) update.reviewer_id = null;
  const { supabase } = await session();
  const problem = refusedRegister(await supabase.from("submittals").update(update).eq("id", submittalId).select("id"), "Couldn't save the submittal.");
  if (problem) return { error: problem };
  refresh();
  return { ok: true };
}

/**
 * Starts the next revision after a "revise and resubmit" or "rejected". The
 * database files the current round in the history and resets the decision.
 */
export async function resubmitSubmittal(submittalId: string, receivedOn: string | null): Promise<ActionResult> {
  if (!Id.safeParse(submittalId).success) return { error: "Submittal not found." };
  const { supabase } = await session();
  const { data: current } = await supabase.from("submittals").select("revision").eq("id", submittalId).maybeSingle<{ revision: number }>();
  if (!current) return { error: "Submittal not found." };
  const received = receivedOn && /^\d{4}-\d{2}-\d{2}$/.test(receivedOn) ? receivedOn : null;
  const problem = refusedRegister(
    await supabase
      .from("submittals")
      .update({ revision: current.revision + 1, received_on: received, due_on: null })
      .eq("id", submittalId)
      .select("id"),
    "Couldn't start the new revision.",
  );
  if (problem) return { error: problem };
  refresh();
  return { ok: true };
}

export async function deleteSubmittal(submittalId: string): Promise<ActionResult> {
  if (!Id.safeParse(submittalId).success) return { error: "Submittal not found." };
  const { supabase } = await session();
  const problem = refused(await supabase.from("submittals").delete().eq("id", submittalId).select("id"), "Couldn't delete the submittal.");
  if (problem) return { error: problem };
  refresh();
  return { ok: true };
}

export type SubmittalDetail = { submittal: Submittal; revisions: SubmittalRevision[]; tasks: LinkedTask[]; files: Attachment[] };

export async function getSubmittalDetail(submittalId: string): Promise<SubmittalDetail | null> {
  if (!Id.safeParse(submittalId).success) return null;
  const { supabase } = await session();
  const { data: submittal } = await supabase.from("submittals").select("*").eq("id", submittalId).maybeSingle<Submittal>();
  if (!submittal) return null;
  const [revisions, tasks, files] = await Promise.all([
    supabase.from("submittal_revisions").select("*").eq("submittal_id", submittalId).order("revision", { ascending: false }),
    supabase.from("items").select("id, title, status, due_date, assignee").eq("submittal_id", submittalId).eq("type", "action_item").order("position"),
    supabase.from("attachments").select("*").eq("submittal_id", submittalId).eq("status", "ready").order("created_at", { ascending: false }),
  ]);
  return {
    submittal,
    revisions: (revisions.data ?? []) as SubmittalRevision[],
    tasks: (tasks.data ?? []) as LinkedTask[],
    files: (files.data ?? []) as Attachment[],
  };
}

// ---------------------------------------------------------------------------
// Linked tasks (both registers)
// ---------------------------------------------------------------------------

type RegisterKind = "rfi" | "submittal";
const LINK_COLUMN: Record<RegisterKind, "rfi_id" | "submittal_id"> = { rfi: "rfi_id", submittal: "submittal_id" };

/** Links a task to an RFI or submittal, or unlinks it (registerId null). */
export async function linkTask(itemId: string, kind: RegisterKind, registerId: string | null): Promise<ActionResult> {
  if (!Id.safeParse(itemId).success || (registerId !== null && !Id.safeParse(registerId).success) || !(kind in LINK_COLUMN)) {
    return { error: "Task not found." };
  }
  const { supabase } = await session();
  const problem = refused(
    await supabase.from("items").update({ [LINK_COLUMN[kind]]: registerId }).eq("id", itemId).select("id"),
    "Couldn't link the task.",
  );
  if (problem) return { error: problem };
  refresh();
  return { ok: true };
}

/** Adds a follow-up task that is linked to an RFI or submittal. */
export async function createLinkedTask(kind: RegisterKind, registerId: string, title: string): Promise<ActionResult & { id?: string }> {
  const name = title.trim();
  if (!name || name.length > 500) return { error: "Give the task a name (500 characters max)." };
  if (!Id.safeParse(registerId).success || !(kind in LINK_COLUMN)) return { error: "Not found." };
  const { supabase } = await session();
  const { data: parent } = await supabase
    .from(kind === "rfi" ? "rfis" : "submittals")
    .select("project_id")
    .eq("id", registerId)
    .maybeSingle<{ project_id: string }>();
  if (!parent) return { error: "Not found." };
  const { data: last } = await supabase
    .from("items")
    .select("position")
    .eq("project_id", parent.project_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();
  const { data, error } = await supabase
    .from("items")
    .insert({
      project_id: parent.project_id,
      type: "action_item",
      title: name,
      status: "open",
      position: (last?.position ?? 0) + 1,
      [LINK_COLUMN[kind]]: registerId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: isDenied(error) ? NO_ACCESS : "Couldn't add the task." };
  refresh();
  return { ok: true, id: data.id };
}
