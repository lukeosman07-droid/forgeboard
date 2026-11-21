import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Database isolation tests. They run against a LOCAL Supabase (`npx supabase start`)
// with every migration applied, and prove through the public API that:
//   * people in workspace X see and change X's work according to their role
//     (owner, admin, member, guest), and
//   * nobody outside X (another workspace's owner, a signed-out visitor) gets a
//     single row of it.
// So the suite fails if a policy is dropped (members lose access) and if Row
// Level Security is turned off (outsiders gain access).
//
// Add a case here in the same pull request that creates a new table.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// These tests create and delete users. Never let them touch a hosted project.
const host = url ? new URL(url).hostname : "";
if (!["127.0.0.1", "localhost"].includes(host)) {
  throw new Error(
    `Database tests only run against a local Supabase, but NEXT_PUBLIC_SUPABASE_URL is "${url || "(not set)"}". ` +
      "Start one with `npx supabase start` and export the values from `npx supabase status -o env`.",
  );
}

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, serviceKey, options);
const visitor = createClient(url, anonKey, options); // never signs in

const PASSWORD = "test-password-1234";
const stamp = Date.now();

type TestUser = { id: string; email: string; client: SupabaseClient };

async function createUser(label: string): Promise<TestUser> {
  const email = `rls-${label}-${stamp}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `User ${label.toUpperCase()}`, company_name: `Company ${label.toUpperCase()}` },
  });
  if (error || !data.user) throw new Error(`Couldn't create test user ${label}: ${error?.message}`);

  const client = createClient(url, anonKey, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`Couldn't sign in test user ${label}: ${signInError.message}`);
  return { id: data.user.id, email, client };
}

/** The workspace sign-up created for this user. */
async function ownWorkspace(user: TestUser): Promise<string> {
  const { data, error } = await admin.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("role", "owner").single();
  if (error || !data) throw new Error(`No workspace for ${user.email}: ${error?.message}`);
  return data.workspace_id as string;
}

/** Inserts one row as `client` and returns its id, or throws with the reason. */
async function insert(client: SupabaseClient, table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await client.from(table).insert(row).select("id").single();
  if (error || !data) throw new Error(`Insert into ${table} failed: ${error?.message}`);
  return data.id as string;
}

function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token, "utf8").digest("hex") };
}

/** `inviter` invites `email` to `workspace`; returns the link's token. */
async function invite(inviter: TestUser, workspace: string, email: string, role: string, project: string | null = null) {
  const { token, hash } = newToken();
  const { error } = await inviter.client.rpc("create_invite", {
    p_workspace: workspace,
    p_email: email,
    p_role: role,
    p_token_hash: hash,
    p_project: project,
  });
  return { token, error };
}

async function join(inviter: TestUser, workspace: string, user: TestUser, role: string, project: string | null = null) {
  const { token, error } = await invite(inviter, workspace, user.email, role, project);
  if (error) throw new Error(`Invite for ${user.email} failed: ${error.message}`);
  const accepted = await user.client.rpc("accept_invite", { p_token: token });
  if (accepted.error) throw new Error(`Accept for ${user.email} failed: ${accepted.error.message}`);
}

// The tables that hold customer work, in parent-to-child order, with a harmless
// change to try on each. item_comments has no update permission at all.
const TABLES: { name: string; change: Record<string, unknown> | null }[] = [
  { name: "projects", change: { name: "Changed" } },
  { name: "sections", change: { name: "Changed" } },
  { name: "notes", change: { raw_text: "Changed" } },
  { name: "items", change: { title: "Changed" } },
  { name: "subtasks", change: { title: "Changed" } },
  { name: "item_comments", change: null },
];

// Workspace X: owner, admin, member, guest. Workspace Y: outsider (its owner).
let owner: TestUser;
let adminUser: TestUser;
let member: TestUser;
let guest: TestUser;
let outsider: TestUser;
let x: string;
let y: string;
/** Rows in workspace X, created by the member, by table. */
const rows: Record<string, string> = {};
/** A second project in X that is never shared with the guest. */
let privateProject: string;
/** A project in Y, used to try cross-workspace links. */
let yProject: string;
const extraUsers: TestUser[] = [];

beforeAll(async () => {
  [owner, adminUser, member, guest, outsider] = await Promise.all(["owner", "admin", "member", "guest", "outsider"].map(createUser));
  [x, y] = await Promise.all([ownWorkspace(owner), ownWorkspace(outsider)]);

  await join(owner, x, adminUser, "admin");
  await join(owner, x, member, "member");
  await join(owner, x, guest, "guest");

  // A member can insert into every table (this is the "members can insert" check).
  rows.projects = await insert(member.client, "projects", { workspace_id: x, name: "X's project" });
  rows.sections = await insert(member.client, "sections", { project_id: rows.projects, name: "Design" });
  rows.notes = await insert(member.client, "notes", { project_id: rows.projects, raw_text: "X's private meeting notes" });
  rows.items = await insert(member.client, "items", {
    project_id: rows.projects,
    section_id: rows.sections,
    note_id: rows.notes,
    type: "action_item",
    title: "X's task",
  });
  rows.subtasks = await insert(member.client, "subtasks", { item_id: rows.items, title: "X's subtask" });
  rows.item_comments = await insert(member.client, "item_comments", { item_id: rows.items, body: "X's comment" });

  privateProject = await insert(owner.client, "projects", { workspace_id: x, name: "X's private project" });
  yProject = await insert(outsider.client, "projects", { workspace_id: y, name: "Y's project" });
});

afterAll(async () => {
  // Workspaces first (their work cascades), then the users.
  const users = [owner, adminUser, member, guest, outsider, ...extraUsers].filter(Boolean);
  const { data: workspaces } = await admin.from("workspace_members").select("workspace_id").in("user_id", users.map((u) => u.id)).eq("role", "owner");
  await admin.from("workspaces").delete().in("id", (workspaces ?? []).map((w) => w.workspace_id));
  await Promise.all(users.map((u) => admin.auth.admin.deleteUser(u.id)));
});

describe("backfill and sign-up", () => {
  it("every new account gets its own workspace and is its owner", async () => {
    const { data } = await owner.client.from("workspaces").select("id, name, plan").eq("id", x).single();
    expect(data?.name).toBe("Company OWNER");
    expect(data?.plan).toBe("trial");
  });

  it("new rows get the workspace of their project and the creator's id", async () => {
    const { data } = await admin.from("items").select("workspace_id, created_by").eq("id", rows.items).single();
    expect(data).toEqual({ workspace_id: x, created_by: member.id });
  });
});

describe.each(TABLES)("$name", ({ name, change }) => {
  it("the owner, an admin and a member can read it", async () => {
    for (const user of [owner, adminUser, member]) {
      const { data, error } = await user.client.from(name).select("id").eq("id", rows[name]);
      expect(error).toBeNull();
      expect(data, `${user.email} should see it`).toHaveLength(1);
    }
  });

  it("another workspace and a signed-out visitor can't read it", async () => {
    const byId = await outsider.client.from(name).select("id").eq("id", rows[name]);
    expect(byId.data ?? []).toHaveLength(0);

    const everything = await outsider.client.from(name).select("id");
    expect((everything.data ?? []).map((r) => r.id)).not.toContain(rows[name]);

    const signedOut = await visitor.from(name).select("id").eq("id", rows[name]);
    expect(signedOut.data ?? []).toHaveLength(0);
  });

  it("a guest can't read it until the project is shared with them", async () => {
    const { data } = await guest.client.from(name).select("id").eq("id", rows[name]);
    expect(data ?? []).toHaveLength(0);
  });

  it("another workspace, a guest and a visitor can't change or delete it", async () => {
    const attempt = change ?? { body: "Changed" };
    for (const client of [outsider.client, guest.client, visitor]) {
      const updated = await client.from(name).update(attempt).eq("id", rows[name]).select("id");
      expect(updated.data ?? []).toHaveLength(0);
      const deleted = await client.from(name).delete().eq("id", rows[name]).select("id");
      expect(deleted.data ?? []).toHaveLength(0);
    }
    const column = Object.keys(attempt)[0];
    const { data: row } = await admin.from(name).select(column).eq("id", rows[name]).single();
    expect((row as Record<string, unknown> | null)?.[column]).not.toBe("Changed");
  });

  if (change) {
    it("a member can change it", async () => {
      const column = Object.keys(change)[0];
      const { data, error } = await member.client.from(name).update({ [column]: "Member edit" }).eq("id", rows[name]).select("id");
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  }
});

describe("workspace isolation", () => {
  it("someone in workspace Y gets zero rows from workspace X in every table", async () => {
    for (const table of [...TABLES.map((t) => t.name), "workspaces", "workspace_members", "workspace_invites", "project_members"]) {
      const column = table === "workspaces" ? "id" : "workspace_id";
      if (table === "project_members") {
        const { data } = await outsider.client.from(table).select("project_id").eq("project_id", rows.projects);
        expect(data ?? [], table).toHaveLength(0);
        continue;
      }
      const { data } = await outsider.client.from(table).select(column).eq(column, x);
      expect(data ?? [], table).toHaveLength(0);
    }
  });

  it("can't create work in another workspace", async () => {
    const { error } = await outsider.client.from("projects").insert({ workspace_id: x, name: "Intruder" }).select("id");
    expect(error).not.toBeNull();
  });

  it("can't add rows under another workspace's project or task", async () => {
    const attempts: [string, Record<string, unknown>][] = [
      ["sections", { project_id: rows.projects, name: "Intruder" }],
      ["notes", { project_id: rows.projects, raw_text: "Intruder" }],
      ["items", { project_id: rows.projects, type: "action_item", title: "Intruder" }],
      ["subtasks", { item_id: rows.items, title: "Intruder" }],
      ["item_comments", { item_id: rows.items, body: "Intruder" }],
    ];
    for (const [table, row] of attempts) {
      const { data, error } = await outsider.client.from(table).insert(row).select("id");
      expect(error, `${table} insert should be refused`).not.toBeNull();
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("can't link its own task to another workspace's section or note", async () => {
    for (const link of [{ section_id: rows.sections }, { note_id: rows.notes }]) {
      const { error } = await outsider.client
        .from("items")
        .insert({ project_id: yProject, type: "action_item", title: "Linked", ...link })
        .select("id");
      expect(error).not.toBeNull();
    }
  });

  it("can't move its own task or project into another workspace", async () => {
    const mine = await insert(outsider.client, "items", { project_id: yProject, type: "action_item", title: "Y's task" });
    const moved = await outsider.client.from("items").update({ project_id: rows.projects }).eq("id", mine).select("id");
    expect(moved.error !== null || (moved.data ?? []).length === 0).toBe(true);

    await outsider.client.from("projects").update({ workspace_id: x }).eq("id", yProject);
    const { data } = await admin.from("projects").select("workspace_id").eq("id", yProject).single();
    expect(data?.workspace_id).toBe(y);
  });

  it("can't assign a task to someone outside the workspace", async () => {
    const { error } = await member.client.from("items").update({ assignee_id: outsider.id }).eq("id", rows.items).select("id");
    expect(error).not.toBeNull();
    const ok = await member.client.from("items").update({ assignee_id: adminUser.id }).eq("id", rows.items).select("id");
    expect(ok.error).toBeNull();
  });

  it("a signed-out visitor can't insert anything", async () => {
    const { error } = await visitor.from("projects").insert({ workspace_id: x, name: "Visitor" }).select("id");
    expect(error).not.toBeNull();
  });
});

describe("guests", () => {
  beforeAll(async () => {
    const { error } = await member.client.from("project_members").insert({ project_id: rows.projects, user_id: guest.id });
    if (error) throw new Error(`Sharing with the guest failed: ${error.message}`);
  });

  it("see a shared project and its work, and nothing else", async () => {
    for (const { name } of TABLES) {
      const { data } = await guest.client.from(name).select("id").eq("id", rows[name]);
      expect(data, `${name} should be visible`).toHaveLength(1);
    }
    const { data: projects } = await guest.client.from("projects").select("id");
    expect((projects ?? []).map((p) => p.id)).toEqual([rows.projects]);
    expect((projects ?? []).map((p) => p.id)).not.toContain(privateProject);
  });

  it("can't edit tasks or add work", async () => {
    const updated = await guest.client.from("items").update({ title: "Guest edit" }).eq("id", rows.items).select("id");
    expect(updated.data ?? []).toHaveLength(0);
    const added = await guest.client.from("items").insert({ project_id: rows.projects, type: "action_item", title: "Guest task" }).select("id");
    expect(added.error).not.toBeNull();
    const project = await guest.client.from("projects").insert({ workspace_id: x, name: "Guest project" }).select("id");
    expect(project.error).not.toBeNull();
  });

  it("can comment, and delete only their own comments", async () => {
    const mine = await insert(guest.client, "item_comments", { item_id: rows.items, body: "Guest question" });
    const theirs = await guest.client.from("item_comments").delete().eq("id", rows.item_comments).select("id");
    expect(theirs.data ?? []).toHaveLength(0);
    const own = await guest.client.from("item_comments").delete().eq("id", mine).select("id");
    expect(own.data).toHaveLength(1);
  });

  it("can't share projects or invite anyone", async () => {
    const share = await guest.client.from("project_members").insert({ project_id: privateProject, user_id: guest.id });
    expect(share.error).not.toBeNull();
    const { error } = await invite(guest, x, `guest-friend-${stamp}@example.test`, "guest", rows.projects);
    expect(error).not.toBeNull();
  });

  it("can't read the Stripe columns or rename the workspace", async () => {
    const stripe = await guest.client.from("workspaces").select("stripe_customer_id").eq("id", x);
    expect(stripe.error).not.toBeNull();
    const renamed = await guest.client.from("workspaces").update({ name: "Guest's now" }).eq("id", x).select("id");
    expect(renamed.data ?? []).toHaveLength(0);
  });
});

describe("roles", () => {
  it("nobody, not even the owner, can write membership rows directly", async () => {
    for (const user of [owner, member]) {
      const { error } = await user.client.from("workspace_members").insert({ workspace_id: x, user_id: outsider.id, role: "member" });
      expect(error).not.toBeNull();
      const promoted = await user.client.from("workspace_members").update({ role: "owner" }).eq("user_id", member.id).eq("workspace_id", x).select("user_id");
      expect(promoted.data ?? []).toHaveLength(0);
    }
  });

  it("a member can't invite to the workspace or change roles", async () => {
    const { error } = await invite(member, x, `nope-${stamp}@example.test`, "member");
    expect(error?.message).toContain("not_allowed");
    const role = await member.client.rpc("set_member_role", { p_workspace: x, p_user: guest.id, p_role: "member" });
    expect(role.error?.message).toContain("not_allowed");
  });

  it("a member can invite a guest to a project they can edit", async () => {
    const { error } = await invite(member, x, `client-${stamp}@example.test`, "guest", rows.projects);
    expect(error).toBeNull();
  });

  it("an admin can't create admins or touch the owner; the owner can", async () => {
    const promote = await adminUser.client.rpc("set_member_role", { p_workspace: x, p_user: member.id, p_role: "admin" });
    expect(promote.error?.message).toContain("not_allowed");
    const inviteAdmin = await invite(adminUser, x, `admin2-${stamp}@example.test`, "admin");
    expect(inviteAdmin.error?.message).toContain("not_allowed");
    const removeOwner = await adminUser.client.rpc("remove_member", { p_workspace: x, p_user: owner.id });
    expect(removeOwner.error).not.toBeNull();

    const byOwner = await owner.client.rpc("set_member_role", { p_workspace: x, p_user: member.id, p_role: "admin" });
    expect(byOwner.error).toBeNull();
    await owner.client.rpc("set_member_role", { p_workspace: x, p_user: member.id, p_role: "member" });
  });

  it("an admin can rename the workspace; a member can't", async () => {
    const byMember = await member.client.from("workspaces").update({ name: "Member's" }).eq("id", x).select("id");
    expect(byMember.data ?? []).toHaveLength(0);
    const byAdmin = await adminUser.client.from("workspaces").update({ name: "Renamed X" }).eq("id", x).select("id");
    expect(byAdmin.data).toHaveLength(1);
    const plan = await owner.client.from("workspaces").update({ plan: "enterprise" }).eq("id", x).select("id");
    expect(plan.error).not.toBeNull();
  });

  it("members see who is in the workspace, but not invite tokens", async () => {
    const people = await member.client.rpc("workspace_people", { ws: x });
    expect((people.data ?? []).map((p: { user_id: string }) => p.user_id).sort()).toEqual([owner.id, adminUser.id, member.id, guest.id].sort());
    const outside = await outsider.client.rpc("workspace_people", { ws: x });
    expect(outside.data ?? []).toHaveLength(0);
    const hashes = await owner.client.from("workspace_invites").select("token_hash");
    expect(hashes.error).not.toBeNull();
  });
});

describe("invites", () => {
  it("a signed-out visitor can preview an invite but not accept it", async () => {
    const email = `preview-${stamp}@example.test`;
    const { token } = await invite(owner, x, email, "guest");
    const preview = await visitor.rpc("invite_preview", { p_token: token });
    expect(preview.data?.[0]).toMatchObject({ email, role: "guest" });
    const accept = await visitor.rpc("accept_invite", { p_token: token });
    expect(accept.error).not.toBeNull();
    const wrong = await visitor.rpc("invite_preview", { p_token: "not-a-real-token-at-all" });
    expect(wrong.data ?? []).toHaveLength(0);
  });

  it("only the invited address can accept, and only once", async () => {
    const invitee = await createUser("invitee");
    extraUsers.push(invitee);
    const { token } = await invite(owner, x, invitee.email, "guest");

    const stolen = await outsider.client.rpc("accept_invite", { p_token: token });
    expect(stolen.error?.message).toContain("invite_wrong_email");

    const first = await invitee.client.rpc("accept_invite", { p_token: token });
    expect(first.error).toBeNull();
    const again = await invitee.client.rpc("accept_invite", { p_token: token });
    expect(again.error?.message).toContain("invite_invalid");
  });

  it("a cancelled invite can't be used", async () => {
    const late = await createUser("late");
    extraUsers.push(late);
    const { token } = await invite(owner, x, late.email, "guest");
    const { data } = await owner.client.from("workspace_invites").select("id").eq("email", late.email).is("revoked_at", null).single();
    expect((await owner.client.rpc("revoke_invite", { p_invite: data!.id })).error).toBeNull();
    const accept = await late.client.rpc("accept_invite", { p_token: token });
    expect(accept.error?.message).toContain("invite_invalid");
  });

  it("seat limits count members and pending invites, but not guests", async () => {
    // Trial: 5 seats. X has owner, admin and member (3), so 2 more invites fit.
    const sent = [];
    for (let i = 0; i < 3; i++) sent.push(await invite(owner, x, `seat-${i}-${stamp}@example.test`, "member"));
    expect(sent[0].error).toBeNull();
    expect(sent[1].error).toBeNull();
    expect(sent[2].error?.message).toContain("seat_limit");
    const guestInvite = await invite(owner, x, `seat-guest-${stamp}@example.test`, "guest");
    expect(guestInvite.error).toBeNull();
  });

  it("can't invite someone who is already in the workspace", async () => {
    const { error } = await invite(owner, x, member.email, "member");
    expect(error?.message).toContain("already_member");
  });
});

describe("leaving and ownership", () => {
  it("someone removed keeps their name on tasks but loses access", async () => {
    const temp = await createUser("temp");
    extraUsers.push(temp);
    const ws = x;
    // Free a seat for them: cancel the pending member invites from the seat test.
    const { data: pending } = await owner.client.from("workspace_invites").select("id").eq("workspace_id", ws).eq("role", "member").is("accepted_at", null).is("revoked_at", null);
    for (const p of pending ?? []) await owner.client.rpc("revoke_invite", { p_invite: p.id });
    await join(owner, ws, temp, "member");

    const task = await insert(member.client, "items", { project_id: rows.projects, type: "action_item", title: "Temp's task", assignee: "User TEMP", assignee_id: temp.id });
    const { error } = await adminUser.client.rpc("remove_member", { p_workspace: ws, p_user: temp.id });
    expect(error).toBeNull();

    const { data: row } = await admin.from("items").select("assignee, assignee_id").eq("id", task).single();
    expect(row).toEqual({ assignee: "User TEMP", assignee_id: null });
    const { data } = await temp.client.from("items").select("id").eq("id", task);
    expect(data ?? []).toHaveLength(0);
  });

  it("the owner can't leave, and can't delete their account while others use the workspace", async () => {
    const leave = await owner.client.rpc("remove_member", { p_workspace: x, p_user: owner.id });
    expect(leave.error?.message).toContain("owner_cannot_leave");
    const del = await owner.client.rpc("delete_own_account");
    expect(del.error?.message).toContain("transfer_ownership_first");
  });

  it("ownership transfers to a member and the old owner becomes an admin", async () => {
    const created = await member.client.rpc("create_workspace", { p_name: "Transfer test" });
    const ws = (created.data as { id: string }[])[0].id;
    await join(member, ws, adminUser, "member");

    expect((await adminUser.client.rpc("transfer_ownership", { p_workspace: ws, p_new_owner: adminUser.id })).error).not.toBeNull();
    expect((await member.client.rpc("transfer_ownership", { p_workspace: ws, p_new_owner: adminUser.id })).error).toBeNull();

    const { data } = await admin.from("workspace_members").select("user_id, role").eq("workspace_id", ws);
    expect(Object.fromEntries((data ?? []).map((m) => [m.user_id, m.role]))).toEqual({ [adminUser.id]: "owner", [member.id]: "admin" });
    await admin.from("workspaces").delete().eq("id", ws);
  });
});

describe("profiles", () => {
  it("a user can read their own profile but nobody else's", async () => {
    const own = await owner.client.from("profiles").select("id, full_name").eq("id", owner.id);
    expect(own.data).toHaveLength(1);

    const other = await outsider.client.from("profiles").select("id").eq("id", owner.id);
    expect(other.data ?? []).toHaveLength(0);

    const signedOut = await visitor.from("profiles").select("id").eq("id", owner.id);
    expect(signedOut.data ?? []).toHaveLength(0);
  });

  it("a user can edit their name and company", async () => {
    const { error } = await owner.client.from("profiles").update({ full_name: "Renamed Owner" }).eq("id", owner.id);
    expect(error).toBeNull();
    const { data } = await admin.from("profiles").select("full_name").eq("id", owner.id).single();
    expect(data?.full_name).toBe("Renamed Owner");
  });

  it("a user can't give themselves a paid plan or reset their AI usage", async () => {
    for (const change of [
      { plan: "business" },
      { subscription_status: "active" },
      { ai_extractions_used: 0 },
      { stripe_customer_id: "cus_forged" },
    ]) {
      const { error } = await owner.client.from("profiles").update(change).eq("id", owner.id);
      expect(error, `updating ${Object.keys(change)[0]} should be refused`).not.toBeNull();
    }
    const { data } = await admin.from("profiles").select("plan, subscription_status, stripe_customer_id").eq("id", owner.id).single();
    expect(data).toEqual({ plan: "free", subscription_status: null, stripe_customer_id: null });
  });

  it("a user can't edit someone else's profile", async () => {
    await outsider.client.from("profiles").update({ full_name: "Hijacked" }).eq("id", owner.id);
    const { data } = await admin.from("profiles").select("full_name").eq("id", owner.id).single();
    expect(data?.full_name).not.toBe("Hijacked");
  });

  it("a paid plan on the profile carries over to the workspace its owner owns", async () => {
    await admin.from("profiles").update({ plan: "team", subscription_status: "active" }).eq("id", outsider.id);
    const { data } = await admin.from("workspaces").select("plan, subscription_status").eq("id", y).single();
    expect(data).toEqual({ plan: "team", subscription_status: "active" });
  });
});

describe("AI usage", () => {
  it("users can't read or write the usage log", async () => {
    await admin.from("ai_extraction_events").insert({ user_id: owner.id });

    const read = await owner.client.from("ai_extraction_events").select("id");
    expect(read.data ?? []).toHaveLength(0);

    const write = await owner.client.from("ai_extraction_events").insert({ user_id: owner.id }).select("id");
    expect(write.error).not.toBeNull();
  });

  it("users can't call the usage functions themselves", async () => {
    const claim = await owner.client.rpc("claim_ai_extraction", { p_user_id: owner.id, p_free_limit: 9999, p_hourly_limit: 9999 });
    expect(claim.error).not.toBeNull();

    const finish = await owner.client.rpc("finish_ai_extraction", { p_event_id: 1, p_status: "failed" });
    expect(finish.error).not.toBeNull();
  });
});

describe("clean-up permissions", () => {
  // Children first, so each delete is checked on its own rather than by cascade.
  it.each([...TABLES].reverse())("a member can delete the $name row", async ({ name }) => {
    if (name === "projects") return; // checked below: members can delete only projects they created
    const { data, error } = await member.client.from(name).delete().eq("id", rows[name]).select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("a member can't delete someone else's project; an admin can", async () => {
    const byMember = await member.client.from("projects").delete().eq("id", privateProject).select("id");
    expect(byMember.data ?? []).toHaveLength(0);
    const byAdmin = await adminUser.client.from("projects").delete().eq("id", privateProject).select("id");
    expect(byAdmin.data).toHaveLength(1);
  });

  it("the creator can delete their own project", async () => {
    const { data } = await member.client.from("projects").delete().eq("id", rows.projects).select("id");
    expect(data).toHaveLength(1);
  });
});

describe("delete_own_account", () => {
  it("a signed-out visitor can't call it", async () => {
    const { error } = await visitor.rpc("delete_own_account");
    expect(error).not.toBeNull();
  });

  it("removes the caller, their solo workspace and its work, and nobody else", async () => {
    const c = await createUser("c");
    const ws = await ownWorkspace(c);
    const project = await insert(c.client, "projects", { workspace_id: ws, name: "C's project" });
    const item = await insert(c.client, "items", { project_id: project, type: "action_item", title: "C's task" });

    const { error } = await c.client.rpc("delete_own_account");
    expect(error).toBeNull();

    const { data: user } = await admin.auth.admin.getUserById(c.id);
    expect(user.user).toBeNull();
    for (const [table, id] of [["profiles", c.id], ["workspaces", ws], ["projects", project], ["items", item]] as const) {
      const { data } = await admin.from(table).select("id").eq("id", id);
      expect(data, `${table} row should be gone`).toHaveLength(0);
    }

    // The other accounts are untouched.
    const { data: others } = await admin.from("profiles").select("id").in("id", [owner.id, outsider.id]);
    expect(others).toHaveLength(2);
  });

  it("refuses to delete the shared demo account", async () => {
    const email = "demo@demo.com";
    const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    const created = existing
      ? null
      : (await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })).data.user;
    // If a demo account already exists locally we don't know its password; skip rather than change it.
    if (!created) return;

    const demo = createClient(url, anonKey, options);
    await demo.auth.signInWithPassword({ email, password: PASSWORD });
    const { error } = await demo.rpc("delete_own_account");
    expect(error).not.toBeNull();

    const { data: user } = await admin.auth.admin.getUserById(created.id);
    expect(user.user?.id).toBe(created.id);
    const ws = await admin.from("workspace_members").select("workspace_id").eq("user_id", created.id);
    await admin.from("workspaces").delete().in("id", (ws.data ?? []).map((w) => w.workspace_id));
    await admin.auth.admin.deleteUser(created.id);
  });
});
