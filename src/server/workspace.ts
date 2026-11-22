"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SAMPLE_PROJECT } from "@/lib/sample-project";
import { syncSubscription } from "@/lib/billing/stripe-sync";
import { getStripe } from "@/lib/stripe";
import { workspaceUrl } from "@/lib/workspaces";
import { cancelSubscriptionNow, hasLiveSubscription, loadOwnedWorkspace } from "./billing";
import { createProject } from "./projects";
import { Slug, WorkspaceName, firstIssue, type ActionResult } from "./schemas";
import { refused, rpcMessage, session, workspaceFor } from "./session";

// Onboarding, the setup checklist, the sample project and deleting a workspace.

/** Marks the first-run steps as done (admins; the database policy checks). */
export async function completeOnboarding(slug: string): Promise<ActionResult> {
  const { supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return { error: "That workspace doesn't exist." };
  const error = refused(
    await supabase.from("workspaces").update({ onboarded_at: new Date().toISOString() }).eq("id", workspace.id).select("id"),
    "Couldn't save that.",
  );
  if (error) return { error };
  revalidatePath(`/w/${workspace.slug}`, "layout");
  return { ok: true };
}

/** Hides the setup checklist for everyone in the workspace. */
export async function dismissChecklist(slug: string): Promise<ActionResult> {
  const { supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return { error: "That workspace doesn't exist." };
  const error = refused(
    await supabase.from("workspaces").update({ checklist_dismissed_at: new Date().toISOString() }).eq("id", workspace.id).select("id"),
    "Couldn't hide the checklist.",
  );
  if (error) return { error };
  revalidatePath(`/w/${workspace.slug}`, "layout");
  return { ok: true };
}

/**
 * Adds the sample project: a schedule, decisions, risks and the meeting notes
 * they came from. Runs as the user, so Row Level Security applies as usual.
 */
export async function createSampleProject(slug: string, today?: string): Promise<ActionResult & { id?: string }> {
  const created = await createProject(slug, {
    name: SAMPLE_PROJECT.name,
    description: SAMPLE_PROJECT.description,
    color: SAMPLE_PROJECT.color,
    plan: SAMPLE_PROJECT.plan,
    today,
  });
  if (!created.id) return created;

  const { supabase } = await session();
  const { data: note } = await supabase
    .from("notes")
    .insert({ project_id: created.id, raw_text: SAMPLE_PROJECT.notes, summary: SAMPLE_PROJECT.notesSummary })
    .select("id")
    .single();
  const { error } = await supabase.from("items").insert(
    SAMPLE_PROJECT.log.map((entry, i) => ({
      project_id: created.id,
      note_id: note?.id ?? null,
      type: entry.type,
      title: entry.title,
      details: entry.details,
      priority: "priority" in entry ? entry.priority : null,
      status: "open",
      position: 1000 + i,
    })),
  );
  if (error) return { id: created.id, error: "The sample project was created, but some of its decisions and risks couldn't be added." };
  return { ok: true, id: created.id };
}

/**
 * Deletes a workspace and everything in it. Owner only, confirmed by typing its
 * name. Billing is stopped first, so a deleted workspace is never charged.
 */
export async function deleteWorkspace(slug: string, confirmName: string): Promise<ActionResult> {
  if (!Slug.safeParse(slug).success) return { error: "That workspace doesn't exist." };
  const name = WorkspaceName.safeParse(confirmName);
  if (!name.success) return { error: firstIssue(name.error) };

  const owned = await loadOwnedWorkspace(slug);
  if (!owned.ok) {
    return { error: owned.reason === "not_owner" ? "Only the workspace owner can delete it." : "That workspace doesn't exist." };
  }
  const { workspace, admin } = owned;
  if (name.data !== workspace.name) return { error: rpcMessage({ message: "confirm_name_mismatch" }, "") };

  if (hasLiveSubscription(workspace)) {
    const stripe = getStripe();
    if (!stripe) return { error: "Billing isn't reachable right now, so the subscription couldn't be canceled. Nothing was deleted." };
    try {
      await cancelSubscriptionNow(stripe, workspace.stripe_subscription_id!);
      await syncSubscription(stripe, admin, workspace.stripe_subscription_id!, workspace.id);
    } catch (err) {
      console.error("Workspace deletion: couldn't cancel the subscription", err);
      return { error: "We couldn't cancel the subscription, so nothing was deleted. Please try again or contact support." };
    }
  }

  const { supabase } = await session();
  const { error } = await supabase.rpc("delete_workspace", { p_workspace: workspace.id, p_confirm_name: name.data });
  if (error) return { error: rpcMessage(error, "Couldn't delete the workspace. Please try again.") };

  redirect(await workspaceUrl());
}
