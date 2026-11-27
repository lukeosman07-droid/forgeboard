"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { DEFAULT_NOTIFICATION_PREFS, type AppNotification, type NotificationPrefs } from "@/lib/types";
import { Id, firstIssue, type ActionResult } from "./schemas";
import { session, workspaceFor } from "./session";

// The bell and the Inbox. Database triggers create notifications; people can
// only read their own and mark them read.

export type InboxEntry = AppNotification & { item_title: string | null; project_name: string | null };

const PAGE = 30;

export async function listNotifications(
  slug: string,
  options: { unreadOnly?: boolean; before?: number } = {},
): Promise<{ entries: InboxEntry[]; unread: number; more: boolean }> {
  const parsed = z.object({ unreadOnly: z.boolean().optional(), before: z.number().int().positive().optional() }).safeParse(options);
  if (!parsed.success) return { entries: [], unread: 0, more: false };
  const { supabase, user } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return { entries: [], unread: 0, more: false };

  let query = supabase
    .from("notifications")
    .select("id, workspace_id, project_id, item_id, comment_id, actor_id, type, data, read_at, created_at, items(title), projects(name)")
    .eq("workspace_id", workspace.id)
    .eq("user_id", user.id);
  if (parsed.data.unreadOnly) query = query.is("read_at", null);
  if (parsed.data.before) query = query.lt("id", parsed.data.before);

  const [list, unread] = await Promise.all([
    query.order("id", { ascending: false }).limit(PAGE + 1),
    countUnread(supabase, workspace.id, user.id),
  ]);
  type Row = AppNotification & { items: { title: string } | null; projects: { name: string } | null };
  const rows = (list.data ?? []) as unknown as Row[];
  return {
    entries: rows.slice(0, PAGE).map(({ items, projects, ...n }) => ({ ...n, item_title: items?.title ?? null, project_name: projects?.name ?? null })),
    unread,
    more: rows.length > PAGE,
  };
}

async function countUnread(supabase: Awaited<ReturnType<typeof session>>["supabase"], workspaceId: string, userId: string) {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .is("read_at", null);
  return count ?? 0;
}

export async function unreadNotificationCount(slug: string): Promise<number> {
  const { supabase, user } = await session();
  const workspace = await workspaceFor(supabase, slug);
  return workspace ? countUnread(supabase, workspace.id, user.id) : 0;
}

export async function markNotificationsRead(ids: number[]): Promise<ActionResult> {
  const parsed = z.array(z.number().int().positive()).min(1).max(200).safeParse(ids);
  if (!parsed.success) return { error: "Nothing to mark." };
  const { supabase } = await session();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", parsed.data).is("read_at", null);
  if (error) return { error: "Couldn't mark them read." };
  refresh();
  return { ok: true };
}

export async function markAllNotificationsRead(slug: string): Promise<ActionResult> {
  const { supabase, user } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return { error: "Workspace not found." };
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("workspace_id", workspace.id)
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) return { error: "Couldn't mark them read." };
  refresh();
  return { ok: true };
}

export async function getNotificationPrefs(slug: string): Promise<{ prefs: NotificationPrefs; timeZone: string | null } | null> {
  const { supabase, user } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace) return null;
  const [prefs, profile] = await Promise.all([
    supabase.from("notification_prefs").select("*").eq("user_id", user.id).eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("profiles").select("time_zone").eq("id", user.id).maybeSingle<{ time_zone: string | null }>(),
  ]);
  const saved = (prefs.data ?? {}) as Partial<NotificationPrefs>;
  const merged = { ...DEFAULT_NOTIFICATION_PREFS };
  for (const key of Object.keys(merged) as (keyof NotificationPrefs)[]) {
    if (saved[key] !== undefined && saved[key] !== null) (merged as Record<string, unknown>)[key] = saved[key];
  }
  return { prefs: merged, timeZone: profile.data?.time_zone ?? null };
}

function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const Prefs = z.object({
  in_app_assigned: z.boolean(),
  in_app_mentioned: z.boolean(),
  in_app_commented: z.boolean(),
  in_app_status: z.boolean(),
  email_assigned: z.boolean(),
  email_mentioned: z.boolean(),
  email_commented: z.boolean(),
  email_status: z.boolean(),
  email_digest: z.boolean(),
  digest_hour: z.number().int().min(0).max(23),
});

const TimeZone = z.string().max(64).refine(isTimeZone, "Pick a valid time zone.");

export async function saveNotificationPrefs(slug: string, prefs: NotificationPrefs, timeZone: string | null): Promise<ActionResult> {
  const parsed = Prefs.safeParse(prefs);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const tz = timeZone ? TimeZone.safeParse(timeZone) : null;
  if (tz && !tz.success) return { error: firstIssue(tz.error) };

  const { supabase, user } = await session();
  const workspace = await workspaceFor(supabase, slug);
  if (!workspace || !Id.safeParse(workspace.id).success) return { error: "Workspace not found." };

  // Update first; insert only if there's no row yet. (An upsert would also try
  // to rewrite the key columns, which people may not change.)
  const updated = await supabase
    .from("notification_prefs")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("workspace_id", workspace.id)
    .select("user_id");
  if (updated.error) return { error: "Couldn't save your notification settings." };
  if (!updated.data?.length) {
    const inserted = await supabase.from("notification_prefs").insert({ user_id: user.id, workspace_id: workspace.id, ...parsed.data });
    if (inserted.error) return { error: "Couldn't save your notification settings." };
  }

  if (tz?.success) {
    const { error } = await supabase.from("profiles").update({ time_zone: tz.data }).eq("id", user.id);
    if (error) return { error: "Saved, but couldn't update your time zone." };
  }
  refresh();
  return { ok: true };
}
