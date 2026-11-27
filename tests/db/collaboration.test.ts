import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deliverNotificationEmails } from "@/server/deliver";

// Phase 3: activity, comments, mentions, notifications and search, enforced by
// the database. Runs against a LOCAL Supabase with every migration applied.
// Covers the phase's acceptance criteria:
//   * mentioning someone creates one notification and one email, and respects
//     their preferences,
//   * a task's history shows who changed the due date and when,
//   * search finds a task by a word in one of its comments.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const host = url ? new URL(url).hostname : "";
if (!["127.0.0.1", "localhost"].includes(host)) {
  throw new Error(`Database tests only run against a local Supabase, but NEXT_PUBLIC_SUPABASE_URL is "${url || "(not set)"}".`);
}

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, serviceKey, options);
const PASSWORD = "test-password-1234";
const stamp = Date.now();

type TestUser = { id: string; email: string; name: string; client: SupabaseClient };
const users: TestUser[] = [];

async function createUser(label: string): Promise<TestUser> {
  const email = `collab-${label}-${stamp}@example.test`;
  const name = `${label[0].toUpperCase()}${label.slice(1)} Tester`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error || !data.user) throw new Error(`Couldn't create ${label}: ${error?.message}`);
  const client = createClient(url, anonKey, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`Couldn't sign in ${label}: ${signInError.message}`);
  const user = { id: data.user.id, email, name, client };
  users.push(user);
  return user;
}

const mention = (u: TestUser) => `@[${u.name}](${u.id})`;

async function notificationsFor(user: TestUser, filter: Record<string, string>) {
  let q = admin.from("notifications").select("type, email_state, in_app, actor_id").eq("user_id", user.id);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function comment(user: TestUser, itemId: string, body: string) {
  const { data, error } = await user.client.from("item_comments").insert({ item_id: itemId, body }).select("id").single<{ id: string }>();
  if (error || !data) throw new Error(`Couldn't comment: ${error?.message}`);
  return data.id;
}

let owner: TestUser;
let member: TestUser;
let guest: TestUser;
let outsider: TestUser;
let ws: string;
let project: string;
let privateProject: string;
let task: string;

beforeAll(async () => {
  [owner, member, guest, outsider] = await Promise.all([createUser("owner"), createUser("member"), createUser("guest"), createUser("outsider")]);
  const { data } = await admin.from("workspace_members").select("workspace_id").eq("user_id", owner.id).eq("role", "owner").single();
  ws = data!.workspace_id as string;
  const added = await admin.from("workspace_members").insert([
    { workspace_id: ws, user_id: member.id, role: "member" },
    { workspace_id: ws, user_id: guest.id, role: "guest" },
  ]);
  if (added.error) throw new Error(added.error.message);

  const p = await owner.client.from("projects").insert({ workspace_id: ws, name: "Bridge" }).select("id").single<{ id: string }>();
  const p2 = await owner.client.from("projects").insert({ workspace_id: ws, name: "Private" }).select("id").single<{ id: string }>();
  project = p.data!.id;
  privateProject = p2.data!.id;
  await admin.from("project_members").insert({ project_id: project, user_id: guest.id });

  const t = await owner.client
    .from("items")
    .insert({ project_id: project, type: "action_item", title: "Check pier loads", due_date: "2026-12-01" })
    .select("id")
    .single<{ id: string }>();
  task = t.data!.id;
});

afterAll(async () => {
  for (const user of users) {
    const owned = await admin.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("role", "owner");
    for (const row of owned.data ?? []) await admin.from("workspaces").delete().eq("id", row.workspace_id);
    await admin.auth.admin.deleteUser(user.id);
  }
});

describe("activity", () => {
  it("records who changed the due date, from what to what, and when", async () => {
    const before = Date.now();
    const { error } = await member.client.from("items").update({ due_date: "2026-12-05" }).eq("id", task);
    expect(error).toBeNull();

    const { data } = await member.client.from("activity").select("verb, actor_id, changes, created_at").eq("item_id", task).order("id");
    expect(data?.map((a) => a.verb)).toEqual(["created", "updated"]);
    const change = data![1];
    expect(change.actor_id).toBe(member.id);
    expect(change.changes).toEqual({ due_date: { old: "2026-12-01", new: "2026-12-05" } });
    expect(Date.parse(change.created_at)).toBeGreaterThanOrEqual(before - 5_000);
  });

  it("skips moves that only change position", async () => {
    await member.client.from("items").update({ position: 42 }).eq("id", task);
    const { count } = await admin.from("activity").select("id", { count: "exact", head: true }).eq("item_id", task);
    expect(count).toBe(2);
  });

  it("a guest sees history only on projects shared with them, and nobody writes it", async () => {
    const secret = await owner.client.from("items").insert({ project_id: privateProject, type: "action_item", title: "Secret plan" }).select("id").single<{ id: string }>();
    expect((await guest.client.from("activity").select("id").eq("item_id", task)).data).toHaveLength(2);
    expect((await guest.client.from("activity").select("id").eq("item_id", secret.data!.id)).data).toHaveLength(0);
    expect((await outsider.client.from("activity").select("id").eq("workspace_id", ws)).data).toHaveLength(0);
    const forged = await owner.client.from("activity").insert({ workspace_id: ws, project_id: project, verb: "created" });
    expect(forged.error).not.toBeNull();
  });
});

describe("notifications", () => {
  it("assigning a task notifies the new owner once, with an email", async () => {
    await owner.client.from("items").update({ assignee_id: member.id }).eq("id", task);
    await owner.client.from("items").update({ assignee_id: member.id, title: "Check pier loads!" }).eq("id", task);
    const rows = await notificationsFor(member, { item_id: task, type: "assigned" });
    expect(rows).toEqual([{ type: "assigned", email_state: "pending", in_app: true, actor_id: owner.id }]);
  });

  it("a mention creates exactly one notification and one email per person, never for outsiders", async () => {
    const id = await comment(owner, task, `Please check ${mention(guest)} and ${mention(member)} and ${mention(guest)} and ${mention(outsider)}`);
    expect(await notificationsFor(guest, { comment_id: id })).toEqual([{ type: "mentioned", email_state: "pending", in_app: true, actor_id: owner.id }]);
    // The member owns the task but is told once, as a mention.
    expect(await notificationsFor(member, { comment_id: id })).toEqual([{ type: "mentioned", email_state: "pending", in_app: true, actor_id: owner.id }]);
    expect(await notificationsFor(outsider, { comment_id: id })).toEqual([]);
  });

  it("respects preferences", async () => {
    const saved = await member.client.from("notification_prefs").insert({ user_id: member.id, workspace_id: ws, email_mentioned: false });
    expect(saved.error).toBeNull();
    const quiet = await comment(owner, task, `again ${mention(member)}`);
    expect(await notificationsFor(member, { comment_id: quiet })).toEqual([{ type: "mentioned", email_state: "off", in_app: true, actor_id: owner.id }]);

    await member.client.from("notification_prefs").update({ in_app_mentioned: false }).eq("user_id", member.id).eq("workspace_id", ws);
    const silent = await comment(owner, task, `once more ${mention(member)}`);
    expect(await notificationsFor(member, { comment_id: silent })).toEqual([]);

    const forged = await member.client.from("notification_prefs").insert({ user_id: owner.id, workspace_id: ws });
    expect(forged.error).not.toBeNull();
    const digest = await member.client.from("notification_prefs").update({ last_digest_on: "2000-01-01" }).eq("user_id", member.id);
    expect(digest.error).not.toBeNull();
  });

  it("a guest isn't notified about a project they can't see", async () => {
    const secret = await owner.client.from("items").insert({ project_id: privateProject, type: "action_item", title: "Hidden" }).select("id").single<{ id: string }>();
    const id = await comment(owner, secret.data!.id, `fyi ${mention(guest)}`);
    expect(await notificationsFor(guest, { comment_id: id })).toEqual([]);
  });

  it("people read only their own notifications and can only mark them read", async () => {
    expect((await owner.client.from("notifications").select("id").eq("user_id", guest.id)).data).toHaveLength(0);
    const mine = await guest.client.from("notifications").select("id, read_at");
    expect(mine.data!.length).toBeGreaterThan(0);
    const read = await guest.client.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).select("id");
    expect(read.data!.length).toBe(mine.data!.length);
    expect((await guest.client.from("notifications").update({ type: "status" }).eq("user_id", guest.id)).error).not.toBeNull();
    expect((await guest.client.from("notifications").insert({ user_id: guest.id, workspace_id: ws, type: "assigned" })).error).not.toBeNull();
    expect((await guest.client.rpc("claim_notification_emails", { p_limit: 10 })).error).not.toBeNull();
  });

  it("each queued email is handed out once (skipped while email isn't configured)", async () => {
    const pending = await admin.from("notifications").select("id").eq("workspace_id", ws).eq("email_state", "pending");
    expect(pending.data!.length).toBeGreaterThanOrEqual(3);
    const before = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      expect(await deliverNotificationEmails()).toBe(0);
    } finally {
      if (before !== undefined) process.env.RESEND_API_KEY = before;
    }
    const after = await admin.from("notifications").select("email_state").in("id", pending.data!.map((r) => r.id));
    expect(new Set(after.data!.map((r) => r.email_state))).toEqual(new Set(["skipped"]));
    const again = await admin.rpc("claim_notification_emails", { p_limit: 100 });
    expect((again.data ?? []).filter((r: { id: number }) => pending.data!.some((p) => p.id === r.id))).toEqual([]);
  });
});

describe("comments", () => {
  it("only the author edits a comment, and editing marks it edited", async () => {
    const id = await comment(guest, task, "Done, loads are fine");
    const edited = await guest.client.from("item_comments").update({ body: "Done, loads are fine (checked twice)" }).eq("id", id).select("edited_at");
    expect(edited.data?.[0]?.edited_at).toBeTruthy();
    const hijack = await owner.client.from("item_comments").update({ body: "hacked" }).eq("id", id).select("id");
    expect(hijack.data ?? []).toHaveLength(0);
    const move = await guest.client.from("item_comments").update({ item_id: task, body: "x" }).eq("id", id);
    expect(move.error).not.toBeNull();
    const history = await admin.from("activity").select("verb").eq("comment_id", id).order("id");
    expect(history.data?.map((a) => a.verb)).toEqual(["commented", "comment_edited"]);
  });
});

describe("search", () => {
  it("finds a task by a word in one of its comments", async () => {
    const { data, error } = await member.client.rpc("search_workspace", { ws, q: "twice" });
    expect(error).toBeNull();
    expect(data).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "comment", item_id: task, project_name: "Bridge" })]));
  });

  it("matches word prefixes and respects project access", async () => {
    const prefix = await member.client.rpc("search_workspace", { ws, q: "pie" });
    expect(prefix.data).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "task", id: task })]));
    expect((await guest.client.rpc("search_workspace", { ws, q: "secret" })).data).toEqual([]);
    expect((await outsider.client.rpc("search_workspace", { ws, q: "pier" })).data).toEqual([]);
    expect((await member.client.rpc("search_workspace", { ws, q: " %$& " })).data).toEqual([]);
  });
});
