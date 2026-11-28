"use server";

import { refresh } from "next/cache";
import type { CustomTemplate } from "@/lib/registers";
import type { WorkloadRow } from "@/lib/workload";
import type { Item, Section } from "@/lib/types";
import { planFromProject } from "@/lib/project-template";
import {
  Disposition,
  Id,
  MilestoneInputSchema,
  MilestonePatchSchema,
  ReviewInputSchema,
  ReviewPatchSchema,
  SavedViewInputSchema,
  TemplateInputSchema,
  ViewQuery,
  firstIssue,
  type ActionResult,
  type MilestonePatch,
  type ReviewPatch,
  type SavedViewInput,
} from "./schemas";
import { NO_ACCESS, isDenied, refused, session, workspaceFor } from "./session";

// Milestones and design reviews (every plan), task dependencies (plans with
// registers), saved views (every plan) and custom templates (Business).
// Row Level Security and triggers enforce all of it; these actions validate
// input and turn database refusals into plain messages.

type DbError = { code?: string; message?: string; hint?: string } | null;

function hinted(error: DbError, fallback: string) {
  if (!error) return fallback;
  if (isDenied(error)) return NO_ACCESS;
  if (error.hint && /review_|dependency_/.test(error.message ?? "")) return error.hint;
  return fallback;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export async function createMilestone(projectId: string, input: { name: string; due_on: string }): Promise<ActionResult & { id?: string }> {
  const parsed = MilestoneInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!Id.safeParse(projectId).success) return { error: "Invalid project." };
  const { supabase } = await session();
  const { data, error } = await supabase.from("milestones").insert({ ...parsed.data, project_id: projectId }).select("id").single();
  if (error || !data) return { error: hinted(error, "Couldn't add the milestone.") };
  refresh();
  return { ok: true, id: data.id };
}

export async function updateMilestone(milestoneId: string, patch: MilestonePatch): Promise<ActionResult> {
  const parsed = MilestonePatchSchema.safeParse(patch);
  if (!parsed.success || !Id.safeParse(milestoneId).success) return { error: parsed.success ? "Milestone not found." : firstIssue(parsed.error) };
  const { done, ...rest } = parsed.data;
  const update: Record<string, unknown> = { ...rest };
  if (done !== undefined) update.done_at = done ? new Date().toISOString() : null;
  if (Object.keys(update).length === 0) return { ok: true };
  const { supabase } = await session();
  const problem = refused(await supabase.from("milestones").update(update).eq("id", milestoneId).select("id"), "Couldn't save the milestone.");
  if (problem) return { error: problem };
  refresh();
  return { ok: true };
}

export async function deleteMilestone(milestoneId: string): Promise<ActionResult> {
  if (!Id.safeParse(milestoneId).success) return { error: "Milestone not found." };
  const { supabase } = await session();
  const problem = refused(await supabase.from("milestones").delete().eq("id", milestoneId).select("id"), "Couldn't delete the milestone.");
  if (problem) return { error: problem };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Design reviews and their comments
// ---------------------------------------------------------------------------

export async function createReview(projectId: string, input: { name: string; milestone_id?: string | null; due_on?: string | null }): Promise<ActionResult & { id?: string }> {
  const parsed = ReviewInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!Id.safeParse(projectId).success) return { error: "Invalid project." };
  const { supabase } = await session();
  const { data, error } = await supabase.from("reviews").insert({ ...parsed.data, project_id: projectId }).select("id").single();
  if (error || !data) return { error: hinted(error, "Couldn't add the review.") };
  refresh();
  return { ok: true, id: data.id };
}

/** Closing checks every comment has a disposition and every "incorporate" is done. */
export async function updateReview(reviewId: string, patch: ReviewPatch): Promise<ActionResult> {
  const parsed = ReviewPatchSchema.safeParse(patch);
  if (!parsed.success || !Id.safeParse(reviewId).success) return { error: parsed.success ? "Review not found." : firstIssue(parsed.error) };
  if (Object.keys(parsed.data).length === 0) return { ok: true };
  const { supabase } = await session();
  const result = await supabase.from("reviews").update(parsed.data).eq("id", reviewId).select("id");
  if (result.error) return { error: hinted(result.error, "Couldn't save the review.") };
  if (!result.data?.length) return { error: NO_ACCESS };
  refresh();
  return { ok: true };
}

export async function deleteReview(reviewId: string): Promise<ActionResult> {
  if (!Id.safeParse(reviewId).success) return { error: "Review not found." };
  const { supabase } = await session();
  const problem = refused(await supabase.from("reviews").delete().eq("id", reviewId).select("id"), "Couldn't delete the review.");
  if (problem) return { error: problem };
  refresh();
  return { ok: true };
}

/**
 * A review comment is an item tied to the review. It stays out of the task
 * views until someone decides to incorporate it, when it becomes a task.
 */
export async function addReviewComment(
  reviewId: string,
  input: { title: string; details?: string | null; assignee_id?: string | null },
): Promise<ActionResult & { id?: string }> {
  const title = input.title?.trim() ?? "";
  if (!title || title.length > 500) return { error: "Write the comment (500 characters max)." };
  if (!Id.safeParse(reviewId).success || (input.assignee_id && !Id.safeParse(input.assignee_id).success)) return { error: "Review not found." };
  const details = input.details?.trim().slice(0, 5000) || null;
  const { supabase } = await session();
  const { data: review } = await supabase.from("reviews").select("project_id, due_on").eq("id", reviewId).maybeSingle<{ project_id: string; due_on: string | null }>();
  if (!review) return { error: "Review not found." };
  const { data: last } = await supabase
    .from("items")
    .select("position")
    .eq("project_id", review.project_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();
  const { data, error } = await supabase
    .from("items")
    .insert({
      project_id: review.project_id,
      review_id: reviewId,
      type: "action_item",
      title,
      details,
      status: "open",
      position: (last?.position ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error || !data) return { error: hinted(error, "Couldn't add the comment.") };
  refresh();
  return { ok: true, id: data.id };
}

export async function setDisposition(itemId: string, disposition: string): Promise<ActionResult> {
  const parsed = Disposition.safeParse(disposition);
  if (!parsed.success || !Id.safeParse(itemId).success) return { error: "Comment not found." };
  const { supabase } = await session();
  const result = await supabase.from("items").update({ disposition: parsed.data }).eq("id", itemId).not("review_id", "is", null).select("id");
  if (result.error) return { error: hinted(result.error, "Couldn't save the disposition.") };
  if (!result.data?.length) return { error: NO_ACCESS };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Dependencies (finish-to-start)
// ---------------------------------------------------------------------------

export async function addDependency(predecessorId: string, successorId: string): Promise<ActionResult & { id?: string }> {
  if (!Id.safeParse(predecessorId).success || !Id.safeParse(successorId).success) return { error: "Task not found." };
  if (predecessorId === successorId) return { error: "A task can't wait on itself." };
  const { supabase } = await session();
  const { data, error } = await supabase
    .from("item_dependencies")
    .insert({ predecessor_id: predecessorId, successor_id: successorId })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { error: "Those tasks are already linked." };
    if (isDenied(error)) return { error: "Task dependencies need edit access, on a plan that includes registers (Team or Business)." };
    return { error: hinted(error, "Couldn't link the tasks.") };
  }
  refresh();
  return { ok: true, id: data.id };
}

export async function removeDependency(dependencyId: string): Promise<ActionResult> {
  if (!Id.safeParse(dependencyId).success) return { error: "Link not found." };
  const { supabase } = await session();
  const problem = refused(await supabase.from("item_dependencies").delete().eq("id", dependencyId).select("id"), "Couldn't remove the link.");
  if (problem) return { error: problem };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Saved views
// ---------------------------------------------------------------------------

export async function saveView(projectId: string, input: SavedViewInput): Promise<ActionResult & { id?: string }> {
  const parsed = SavedViewInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!Id.safeParse(projectId).success) return { error: "Invalid project." };
  const { supabase } = await session();
  const { data, error } = await supabase
    .from("saved_views")
    .insert({ ...parsed.data, project_id: projectId })
    .select("id")
    .single();
  if (error || !data) {
    return {
      error: isDenied(error)
        ? parsed.data.shared
          ? "Only people who can edit the project can share a view. Save it just for you instead."
          : "This project has 100 saved views already. Delete one first."
        : "Couldn't save the view.",
    };
  }
  refresh();
  return { ok: true, id: data.id };
}

export async function updateView(viewId: string, patch: { name?: string; query?: string; shared?: boolean }): Promise<ActionResult> {
  const parsed = SavedViewInputSchema.pick({ name: true, shared: true }).partial().extend({ query: ViewQuery.optional() }).safeParse(patch);
  if (!parsed.success || !Id.safeParse(viewId).success) return { error: parsed.success ? "View not found." : firstIssue(parsed.error) };
  const { supabase } = await session();
  const problem = refused(await supabase.from("saved_views").update(parsed.data).eq("id", viewId).select("id"), "Couldn't save the view.");
  if (problem) return { error: problem };
  refresh();
  return { ok: true };
}

export async function deleteView(viewId: string): Promise<ActionResult> {
  if (!Id.safeParse(viewId).success) return { error: "View not found." };
  const { supabase } = await session();
  const problem = refused(await supabase.from("saved_views").delete().eq("id", viewId).select("id"), "Couldn't delete the view.");
  if (problem) return { error: problem };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Custom templates
// ---------------------------------------------------------------------------

export async function listTemplates(slug: string): Promise<CustomTemplate[]> {
  const { supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return [];
  const { data } = await supabase.from("templates").select("*").eq("workspace_id", workspace.id).order("name").limit(100);
  return (data ?? []) as CustomTemplate[];
}

/**
 * Saves a project's sections and tasks as a reusable template. Dates become
 * offsets from the earliest date in the project, so a new project from the
 * template starts on the day it's made.
 */
export async function saveProjectAsTemplate(projectId: string, input: { name: string; description?: string | null }): Promise<ActionResult & { id?: string }> {
  const parsed = TemplateInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!Id.safeParse(projectId).success) return { error: "Invalid project." };
  const { supabase } = await session();
  const { data: project } = await supabase.from("projects").select("workspace_id, color").eq("id", projectId).maybeSingle<{ workspace_id: string; color: string }>();
  if (!project) return { error: "Project not found." };
  const [sections, items] = await Promise.all([
    supabase.from("sections").select("id, name, position").eq("project_id", projectId).order("position"),
    supabase
      .from("items")
      .select("title, details, priority, start_date, due_date, section_id, position, created_at")
      .eq("project_id", projectId)
      .eq("type", "action_item")
      .is("review_id", null)
      .order("position"),
  ]);
  const plan = planFromProject((sections.data ?? []) as Section[], (items.data ?? []) as Item[]);
  const { data, error } = await supabase
    .from("templates")
    .insert({ workspace_id: project.workspace_id, name: parsed.data.name, description: parsed.data.description ?? null, color: project.color, plan })
    .select("id")
    .single();
  if (error || !data) {
    return {
      error: isDenied(error)
        ? "Custom templates are on the Business plan, for members (not guests). A workspace can keep up to 100."
        : "Couldn't save the template.",
    };
  }
  refresh();
  return { ok: true, id: data.id };
}

export async function deleteTemplate(templateId: string): Promise<ActionResult> {
  if (!Id.safeParse(templateId).success) return { error: "Template not found." };
  const { supabase } = await session();
  const problem = refused(await supabase.from("templates").delete().eq("id", templateId).select("id"), "Couldn't delete the template.");
  if (problem) return { error: problem };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Workload (Business plan)
// ---------------------------------------------------------------------------

/**
 * Open tasks per person per week across every project the caller can see,
 * from the database's workload() function. `today` is the browser's date.
 */
export async function getWorkload(slug: string, today: string, weeks = 6): Promise<WorkloadRow[] | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isInteger(weeks) || weeks < 1 || weeks > 12) return null;
  const { supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return null;
  const { data, error } = await supabase.rpc("workload", { ws: workspace.id, p_today: today, p_weeks: weeks });
  if (error) {
    console.error("workload failed:", error);
    return null;
  }
  return (data ?? []) as WorkloadRow[];
}
