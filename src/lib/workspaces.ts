import "server-only";
import { cache } from "react";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { canEdit, isAdmin } from "@/lib/people";
import { toPlanState, type PlanState, type WorkspaceLimitsRow } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import type { Person, Role, Workspace } from "@/lib/types";

// Reading workspaces on the server. Row Level Security returns a workspace only
// to its members, so "not found" and "not yours" look the same from here.

/** Members can't read the Stripe columns, so the columns are always listed. */
export const WORKSPACE_COLUMNS =
  "id, name, slug, plan, subscription_status, trial_ends_at, grace_ends_at, billing_interval, current_period_end, cancel_at_period_end, storage_bytes_used, onboarded_at, checklist_dismissed_at, created_at";

export type WorkspaceAccess = {
  workspace: Workspace;
  user: CurrentUser;
  role: Role;
  /**
   * Owner, admin or member, and the workspace isn't read-only (trial over or
   * unpaid). Guests can only read and comment.
   */
  canEdit: boolean;
  /** Plan, limits, usage and read-only state, from workspace_limits(). */
  plan: PlanState;
  /** Owner or admin. */
  isAdmin: boolean;
  people: Person[];
};

/** The workspace at a URL slug and the caller's role in it, or null. Cached per request. */
export const getWorkspace = cache(async (slug: string): Promise<WorkspaceAccess | null> => {
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return null;

  const { data: workspace } = await supabase.from("workspaces").select(WORKSPACE_COLUMNS).eq("slug", slug).maybeSingle<Workspace>();
  if (!workspace) return null;

  const [{ data }, { data: limits }] = await Promise.all([
    supabase.rpc("workspace_people", { ws: workspace.id }),
    supabase.rpc("workspace_limits", { ws: workspace.id }),
  ]);
  const people = (data ?? []) as Person[];
  const role = people.find((p) => p.user_id === user.id)?.role;
  const limitsRow = (limits as WorkspaceLimitsRow[] | null)?.[0];
  if (!role || !limitsRow) return null;
  const plan = toPlanState(limitsRow);

  return { workspace, user, role, canEdit: canEdit(role) && !plan.readOnly, isAdmin: isAdmin(role), plan, people };
});

export type WorkspaceSummary = Pick<Workspace, "id" | "name" | "slug" | "plan"> & { role: Role };

/** Every workspace the signed-in user belongs to, oldest first. */
export const listWorkspaces = cache(async (): Promise<WorkspaceSummary[]> => {
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return [];

  const { data } = await supabase
    .from("workspace_members")
    .select("role, workspaces(id, name, slug, plan, created_at)")
    .eq("user_id", user.id)
    .overrideTypes<{ role: Role; workspaces: (Pick<Workspace, "id" | "name" | "slug" | "plan"> & { created_at: string }) | null }[], { merge: false }>();

  return (data ?? [])
    .filter((row) => row.workspaces)
    .sort((a, b) => a.workspaces!.created_at.localeCompare(b.workspaces!.created_at))
    .map(({ role, workspaces: w }) => ({ id: w!.id, name: w!.name, slug: w!.slug, plan: w!.plan, role }));
});

/** Where to send someone who asks for "the app": the workspace they used last, else their first. */
export async function defaultWorkspaceSlug(): Promise<string | null> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return null;

  const [workspaces, { data: profile }] = await Promise.all([
    listWorkspaces(),
    supabase.from("profiles").select("last_workspace_id").eq("id", user.id).maybeSingle<{ last_workspace_id: string | null }>(),
  ]);
  return (workspaces.find((w) => w.id === profile?.last_workspace_id) ?? workspaces[0])?.slug ?? null;
}

/**
 * A page in the user's default workspace, e.g. workspaceUrl("/settings").
 * For redirect() in server actions: Next renders that redirect inside the
 * action's response without passing through the proxy, so the proxy's
 * /dashboard forwarding doesn't apply there.
 */
export async function workspaceUrl(path = ""): Promise<string> {
  const slug = await defaultWorkspaceSlug();
  return slug ? `/w/${slug}${path}` : "/welcome";
}
