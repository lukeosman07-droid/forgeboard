import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";
import { Slug } from "./schemas";

// Shared by every server action: who is calling, and a database client that
// acts as them. Row Level Security then decides what they can see and change,
// so an action never has to trust an ID sent by the browser.

export async function session() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) redirect("/login");
  return { user, supabase };
}

type Db = Awaited<ReturnType<typeof session>>["supabase"];

/** The workspace for a URL slug, or null if it doesn't exist or the caller isn't in it. */
export async function workspaceFor(supabase: Db, slug: string): Promise<{ id: string; slug: string; name: string } | null> {
  if (!Slug.safeParse(slug).success) return null;
  const { data } = await supabase.from("workspaces").select("id, slug, name").eq("slug", slug).maybeSingle();
  return data;
}

export async function peopleIn(supabase: Db, workspaceId: string): Promise<Person[]> {
  const { data } = await supabase.rpc("workspace_people", { ws: workspaceId });
  return (data ?? []) as Person[];
}

export const NO_ACCESS = "You have view-only access here, so that change wasn't saved.";

/**
 * Row Level Security doesn't raise an error when an update or delete is not
 * allowed; it just changes nothing. Actions select the changed rows and use
 * this to turn "nothing changed" into a message the user can understand.
 */
export function refused(result: { data: unknown[] | null; error: unknown }, fallback: string): string | null {
  if (result.error) return isDenied(result.error) ? NO_ACCESS : fallback;
  return result.data && result.data.length > 0 ? null : NO_ACCESS;
}

/** True for "new row violates row-level security policy" and "permission denied". */
export function isDenied(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "42501";
}

// Database functions signal expected failures with short codes in the message.
const RPC_MESSAGES: Record<string, string> = {
  seat_limit: "Every seat on your plan is in use. Remove someone, cancel a pending invite, or upgrade to add more people.",
  read_only: "This workspace is read-only until billing is sorted out. The owner can fix it on the Billing page.",
  cancel_subscription_first: "This workspace still has an active subscription. Cancel it first.",
  confirm_name_mismatch: "Type the workspace's name exactly as shown to confirm.",
  demo_locked: "The shared demo workspace can't be deleted.",
  invite_limit: "This workspace has sent 20 invites in the last day. Please try again tomorrow.",
  already_member: "That person is already in this workspace.",
  invalid_invite: "Check the email address and role, then try again.",
  invite_invalid: "This invite link has expired, was cancelled, or has already been used. Ask for a new one.",
  invite_wrong_email: "This invite was sent to a different email address. Sign in with that address to accept it.",
  not_allowed: "You don't have permission to do that.",
  invalid_manager: "The project manager has to be a member of this workspace (not a guest).",
  owner_role_is_fixed: "The owner's role can only change by transferring ownership.",
  owner_cannot_leave: "The owner can't leave. Transfer ownership to someone else first.",
  invalid_new_owner: "Ownership can only go to an admin or member of this workspace.",
  not_a_member: "That person is no longer in this workspace.",
  workspace_limit: "You've reached the limit of 10 workspaces you can own.",
  invalid_name: "Give the workspace a name of 1 to 120 characters.",
  transfer_ownership_first: "You own a workspace that other people use. Transfer ownership or remove them before deleting your account.",
};

/** A user-facing message for an error from one of our database functions. */
export function rpcMessage(error: { message?: string } | null, fallback: string) {
  const code = Object.keys(RPC_MESSAGES).find((key) => error?.message?.includes(key));
  return code ? RPC_MESSAGES[code] : fallback;
}
