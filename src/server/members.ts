"use server";

import { createHash, randomBytes } from "node:crypto";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { siteUrl } from "@/lib/account";
import { sendInviteEmail } from "@/lib/email";
import { workspaceUrl } from "@/lib/workspaces";
import { ROLE_LABELS, displayName } from "@/lib/people";
import type { Role } from "@/lib/types";
import { Email, Id, InviteRole, InviteToken, WorkspaceName, firstIssue, type ActionResult } from "./schemas";
import { isDenied, peopleIn, refused, rpcMessage, session, workspaceFor } from "./session";

// Workspaces, members, invites and project sharing. Every rule (who may invite,
// seat limits, one owner, single-use links) is enforced by the database
// functions these call; this file validates input, sends email and reports.

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export async function createWorkspace(name: string): Promise<ActionResult> {
  const parsed = WorkspaceName.safeParse(name);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { supabase } = await session();
  const { data, error } = await supabase.rpc("create_workspace", { p_name: parsed.data });
  const created = (data as { id: string; slug: string }[] | null)?.[0];
  if (error || !created) return { error: rpcMessage(error, "Couldn't create the workspace. Please try again.") };

  redirect(`/w/${created.slug}`);
}

export async function renameWorkspace(slug: string, name: string): Promise<ActionResult> {
  const parsed = WorkspaceName.safeParse(name);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return { error: "That workspace doesn't exist." };

  const error = refused(
    await supabase.from("workspaces").update({ name: parsed.data }).eq("id", workspace.id).select("id"),
    "Couldn't rename the workspace.",
  );
  if (error) return { error: "Only an owner or admin can rename the workspace." };
  revalidatePath(`/w/${workspace.slug}`, "layout");
  return { ok: true };
}

/** Remembers the workspace someone last opened, so /dashboard and login land there. */
export async function rememberWorkspace(workspaceId: string): Promise<void> {
  if (!Id.safeParse(workspaceId).success) return;
  const { user, supabase } = await session();
  await supabase.from("profiles").update({ last_workspace_id: workspaceId }).eq("id", user.id);
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export type InviteOutcome = {
  email: string;
  /** True when the email went out. False means email isn't set up: share the link by hand. */
  emailed?: boolean;
  /** Shown once, right after sending. Only its hash is stored. */
  link?: string;
  error?: string;
  /** The plan is out of seats: offer an upgrade. */
  upgrade?: boolean;
};

type Db = Awaited<ReturnType<typeof session>>["supabase"];

async function invite(
  supabase: Db,
  inviterName: string,
  workspace: { id: string; name: string },
  email: string,
  role: Exclude<Role, "owner">,
  project: { id: string; name: string } | null,
): Promise<InviteOutcome> {
  // 32 random bytes. The link carries the token; the database gets only its hash.
  const token = randomBytes(32).toString("base64url");
  const { error } = await supabase.rpc("create_invite", {
    p_workspace: workspace.id,
    p_email: email,
    p_role: role,
    p_token_hash: createHash("sha256").update(token, "utf8").digest("hex"),
    p_project: project?.id ?? null,
  });
  // Out of seats: the result offers an upgrade.
  if (error) return { email, error: rpcMessage(error, "Couldn't create the invite."), upgrade: /seat_limit/.test(error.message) };

  const link = `${siteUrl()}/invite/${token}`;
  const emailed = await sendInviteEmail(email, {
    workspaceName: workspace.name,
    inviterName,
    roleLabel: ROLE_LABELS[role],
    projectName: project?.name,
    link,
  });
  return { email, emailed, link };
}

async function myName(supabase: Db, userId: string, fallback: string | null) {
  const { data } = await supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle<{ full_name: string | null; email: string | null }>();
  return data ? displayName(data) : (fallback ?? "A teammate");
}

/** Splits "a@x.com, b@y.com c@z.com" into unique, lowercased addresses. */
function parseEmails(text: string) {
  return [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

/** Invites one or more people to the workspace. Admins and owners only. */
export async function inviteMembers(slug: string, emailsText: string, role: string): Promise<ActionResult & { outcomes?: InviteOutcome[] }> {
  const parsedRole = InviteRole.safeParse(role);
  if (!parsedRole.success) return { error: "Choose a role." };
  const emails = parseEmails(emailsText);
  if (emails.length === 0) return { error: "Enter at least one email address." };
  if (emails.length > 20) return { error: "Invite up to 20 people at a time." };
  const bad = emails.find((e) => !Email.safeParse(e).success);
  if (bad) return { error: `"${bad}" doesn't look like an email address.` };

  const { user, supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return { error: "That workspace doesn't exist." };

  const inviter = await myName(supabase, user.id, user.email);
  const outcomes: InviteOutcome[] = [];
  for (const email of emails) outcomes.push(await invite(supabase, inviter, workspace, email, parsedRole.data, null));

  refresh();
  return { ok: outcomes.some((o) => !o.error), outcomes };
}

/**
 * Shares one project with someone by email (the Share dialog).
 *   * Already in the workspace: they're added to the project straight away.
 *   * Not in the workspace: they get a guest invite to this project only.
 */
export async function shareProjectByEmail(projectId: string, emailText: string): Promise<ActionResult & { outcome?: InviteOutcome; added?: boolean }> {
  const email = Email.safeParse(emailText.trim().toLowerCase());
  if (!email.success) return { error: firstIssue(email.error) };
  if (!Id.safeParse(projectId).success) return { error: "Invalid project." };

  const { user, supabase } = await session();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, workspace_id, workspaces(id, name)")
    .eq("id", projectId)
    .maybeSingle<{ id: string; name: string; workspace_id: string; workspaces: { id: string; name: string } }>();
  if (!project) return { error: "That project doesn't exist or you can't see it." };

  const existing = (await peopleIn(supabase, project.workspace_id)).find((p) => p.email?.toLowerCase() === email.data);
  if (existing) {
    if (existing.role !== "guest") return { error: `${displayName(existing)} is a ${ROLE_LABELS[existing.role].toLowerCase()} and already sees every project.` };
    const result = await addProjectMember(projectId, existing.user_id);
    return result.error ? result : { ok: true, added: true };
  }

  const outcome = await invite(supabase, await myName(supabase, user.id, user.email), project.workspaces, email.data, "guest", project);
  if (outcome.error) return { error: outcome.error };
  refresh();
  return { ok: true, outcome };
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  if (!Id.safeParse(inviteId).success) return { error: "Invalid invite." };
  const { supabase } = await session();
  const { error } = await supabase.rpc("revoke_invite", { p_invite: inviteId });
  if (error) return { error: rpcMessage(error, "Couldn't cancel the invite.") };
  refresh();
  return { ok: true };
}

/** Sends a fresh link to the same person. The old link stops working. */
export async function resendInvite(slug: string, inviteId: string): Promise<ActionResult & { outcome?: InviteOutcome }> {
  if (!Id.safeParse(inviteId).success) return { error: "Invalid invite." };
  const { user, supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return { error: "That workspace doesn't exist." };

  const { data: old } = await supabase
    .from("workspace_invites")
    .select("email, role, project_id, projects(id, name)")
    .eq("id", inviteId)
    .eq("workspace_id", workspace.id)
    .is("accepted_at", null)
    .maybeSingle<{ email: string; role: Exclude<Role, "owner">; project_id: string | null; projects: { id: string; name: string } | null }>();
  if (!old) return { error: "That invite is no longer pending." };

  const outcome = await invite(supabase, await myName(supabase, user.id, user.email), workspace, old.email, old.role, old.projects);
  if (outcome.error) return { error: outcome.error };
  refresh();
  return { ok: true, outcome };
}

/** Accepts an invite for the signed-in user, then opens the workspace (or the shared project). */
export async function acceptInvite(token: string): Promise<ActionResult> {
  if (!InviteToken.safeParse(token).success) return { error: rpcMessage({ message: "invite_invalid" }, "") };
  const { supabase } = await session();
  const { data, error } = await supabase.rpc("accept_invite", { p_token: token });
  const joined = (data as { workspace_slug: string; project_id: string | null }[] | null)?.[0];
  if (error || !joined) return { error: rpcMessage(error, "Couldn't accept the invite. Please try again.") };

  revalidatePath(`/w/${joined.workspace_slug}`, "layout");
  redirect(joined.project_id ? `/w/${joined.workspace_slug}/projects/${joined.project_id}` : `/w/${joined.workspace_slug}`);
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export async function setMemberRole(slug: string, userId: string, role: string): Promise<ActionResult> {
  const parsedRole = InviteRole.safeParse(role);
  if (!parsedRole.success || !Id.safeParse(userId).success) return { error: "Invalid change." };
  const { supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return { error: "That workspace doesn't exist." };

  const { error } = await supabase.rpc("set_member_role", { p_workspace: workspace.id, p_user: userId, p_role: parsedRole.data });
  if (error) return { error: rpcMessage(error, "Couldn't change the role.") };
  refresh();
  return { ok: true };
}

/** Removes someone from the workspace. Their tasks keep their name as plain text. */
export async function removeMember(slug: string, userId: string): Promise<ActionResult> {
  if (!Id.safeParse(userId).success) return { error: "Invalid member." };
  const { supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return { error: "That workspace doesn't exist." };

  const { error } = await supabase.rpc("remove_member", { p_workspace: workspace.id, p_user: userId });
  if (error) return { error: rpcMessage(error, "Couldn't remove that person.") };
  refresh();
  return { ok: true };
}

/** Leaves a workspace, then goes to another one the user belongs to. */
export async function leaveWorkspace(slug: string): Promise<ActionResult> {
  const { user, supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return { error: "That workspace doesn't exist." };

  const { error } = await supabase.rpc("remove_member", { p_workspace: workspace.id, p_user: user.id });
  if (error) return { error: rpcMessage(error, "Couldn't leave the workspace.") };
  redirect(await workspaceUrl());
}

export async function transferOwnership(slug: string, userId: string): Promise<ActionResult> {
  if (!Id.safeParse(userId).success) return { error: "Invalid member." };
  const { supabase } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return { error: "That workspace doesn't exist." };

  const { error } = await supabase.rpc("transfer_ownership", { p_workspace: workspace.id, p_new_owner: userId });
  if (error) return { error: rpcMessage(error, "Couldn't transfer ownership.") };
  revalidatePath(`/w/${workspace.slug}`, "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Project sharing (which projects a guest can see)
// ---------------------------------------------------------------------------

export async function addProjectMember(projectId: string, userId: string): Promise<ActionResult> {
  if (!Id.safeParse(projectId).success || !Id.safeParse(userId).success) return { error: "Invalid request." };
  const { supabase } = await session();
  const { error } = await supabase.from("project_members").insert({ project_id: projectId, user_id: userId });
  // 23505: already shared with them, which is what was asked for.
  if (error && error.code !== "23505") {
    return { error: isDenied(error) ? "Only the project manager or an admin can share this project." : "Couldn't share the project." };
  }
  refresh();
  return { ok: true };
}

export async function removeProjectMember(projectId: string, userId: string): Promise<ActionResult> {
  if (!Id.safeParse(projectId).success || !Id.safeParse(userId).success) return { error: "Invalid request." };
  const { supabase } = await session();
  const error = refused(
    await supabase.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId).select("project_id"),
    "Couldn't remove access.",
  );
  if (error) return { error: "Only the project manager or an admin can change who this project is shared with." };
  refresh();
  return { ok: true };
}
